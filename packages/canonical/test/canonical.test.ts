import { describe, expect, it } from 'vitest';
import { CanonicalizationError, canonicalize, contentHash, sha256Hex } from '../src/index.ts';

describe('canonicalize (RFC 8785)', () => {
  it('sorts object keys by UTF-16 code units, recursively', () => {
    // RFC 8785 §3.2.3 sorting example.
    const input = {
      '€': 'Euro Sign',
      '\r': 'Carriage Return',
      'דּ': 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      '😀': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      'ö': 'Latin Small Letter O With Diaeresis',
    };
    // Compare the text itself: JSON.parse would move the integer-like key "1" first.
    const order = ['\r', '1', '\u0080', 'ö', '€', '😀', 'דּ'];
    const expected = `{${order.map((k) => `${JSON.stringify(k)}:${JSON.stringify(input[k as keyof typeof input])}`).join(',')}}`;
    expect(canonicalize(input)).toBe(expected);
  });

  it('emits no whitespace and keeps array order', () => {
    expect(canonicalize({ b: [3, 1, 2], a: { d: true, c: null } })).toBe('{"a":{"c":null,"d":true},"b":[3,1,2]}');
  });

  it('serializes numbers with ECMAScript rules', () => {
    expect(canonicalize([1e21, 1e-7, -0, 0.1, 333333333.3333333, 1.0])).toBe('[1e+21,1e-7,0,0.1,333333333.3333333,1]');
  });

  it('escapes strings like JSON.stringify', () => {
    expect(canonicalize('a"b\\c\n\u0001')).toBe('"a\\"b\\\\c\\n\\u0001"');
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['undefined', undefined],
    ['a function', () => 1],
    ['a bigint', 10n],
    ['a symbol', Symbol('s')],
  ])('rejects %s', (_label, value) => {
    expect(() => canonicalize({ v: value })).toThrow(CanonicalizationError);
  });

  it('rejects cycles', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalize(a)).toThrow(CanonicalizationError);
  });

  it('allows the same object to appear twice without a cycle', () => {
    const shared = { x: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
});

describe('contentHash', () => {
  it('is independent of key order', () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });

  it('changes when a value changes', () => {
    expect(contentHash({ a: 1, b: 2 })).not.toBe(contentHash({ a: 1, b: 3 }));
  });

  it('has the sha256:<hex> form', () => {
    expect(contentHash({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('hashes the UTF-8 bytes of the canonical text', () => {
    // sha256("abc")
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(contentHash('é')).toBe(`sha256:${sha256Hex('"é"')}`);
  });
});
