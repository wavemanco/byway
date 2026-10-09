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

  it('rejects holes in sparse arrays instead of emitting invalid JSON', () => {
    const sparse = [1, , 3]; // deliberately sparse
    expect(() => canonicalize(sparse)).toThrow(CanonicalizationError);
  });

  it('rejects lone surrogates (RFC 8785 §3.2.2.2)', () => {
    expect(() => canonicalize({ s: '\ud800' })).toThrow(CanonicalizationError);
    expect(canonicalize('😀')).toBe('"😀"');
  });

  /** The error canonicalize throws for `value`, so a test can read its message. */
  function rejection(value: unknown): CanonicalizationError {
    try {
      canonicalize(value);
    } catch (e) {
      if (e instanceof CanonicalizationError) return e;
      throw e;
    }
    throw new Error('expected a CanonicalizationError');
  }

  // F19: RFC 8785 §3.2.2.2 applies to "JSON string data (which includes JSON object property names as well)".
  it.each([
    ['a lone high surrogate at the root', { '\ud800': 1 }, '$: property name "\\ud800"'],
    ['a lone low surrogate at the root', { '\udc00': 1 }, '$: property name "\\udc00"'],
    ['a lone low surrogate in a nested name', { a: [{ 'x\udc00': 1 }] }, '$.a[0]: property name "x\\udc00"'],
    ['a reversed pair', { '\udc00\ud800': 1 }, '$: property name "\\udc00\\ud800"'],
  ])('rejects %s in a property name, naming it escaped in a well-formed message', (_label, value, names) => {
    const e = rejection(value);
    expect(e.message).toBe(`${names} contains a lone surrogate`);
    expect(e.message.isWellFormed()).toBe(true);
  });

  it('checks a property name before its value, so the outer bad name is the one reported', () => {
    const e = rejection({ '\ud800': { 'x\udc00': 'y\ud800' } });
    expect(e.message).toBe('$: property name "\\ud800" contains a lone surrogate');
    expect(e.message.isWellFormed()).toBe(true);
  });

  it('keeps the message of a lone surrogate in a value as it was', () => {
    expect(rejection({ s: ['ok', '\ud800'] }).message).toBe('$.s[1]: string contains a lone surrogate');
  });

  it('serializes well-formed property names exactly as before', () => {
    expect(canonicalize({ '😀': 1 })).toBe('{"😀":1}');
    expect(canonicalize({ '\u0000': 1 })).toBe('{"\\u0000":1}');
    expect(canonicalize({ '￿': 1 })).toBe('{"￿":1}');
    expect(canonicalize({ ' ': 1 })).toBe('{" ":1}');
    // A literal backslash-u is six ordinary characters, not an escape.
    expect(canonicalize({ '\\ud800': 1 })).toBe('{"\\\\ud800":1}');
    // RFC 8785 does not normalize: a decomposed é stays two code points.
    expect(canonicalize({ 'é': 1 })).toBe('{"é":1}');
  });

  it('rejects non-plain objects that would collide as "{}"', () => {
    expect(() => canonicalize({ d: new Date(0) })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ m: new Map() })).toThrow(CanonicalizationError);
    expect(canonicalize(Object.create(null))).toBe('{}');
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

describe('sha256Hex', () => {
  it('refuses text with a lone surrogate, which has no UTF-8 encoding (F19)', () => {
    // Node would otherwise encode the surrogate as U+FFFD, so two different texts would share one hash.
    expect(() => sha256Hex('a\ud800b')).toThrow(CanonicalizationError);
    expect(() => sha256Hex('a\ud800b')).toThrow('lone surrogate');
    expect(sha256Hex('a�b')).toMatch(/^[0-9a-f]{64}$/);
  });
});
