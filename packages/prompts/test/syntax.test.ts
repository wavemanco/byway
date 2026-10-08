import { describe, expect, it } from 'vitest';
import { evaluate, parseBody, slotsUsed } from '../src/syntax.ts';

const render = (src: string, slots: Record<string, string | undefined>) => evaluate(parseBody(src, 't'), slots, 't');

describe('template syntax', () => {
  it('substitutes slots', () => {
    expect(render('Hello {{problem}}!', { problem: 'world' })).toBe('Hello world!');
  });

  it('allows spaces inside the braces', () => {
    expect(render('{{ problem }}', { problem: 'x' })).toBe('x');
  });

  it('never re-reads slot values as template syntax (no injection through a value)', () => {
    expect(render('<problem>{{problem}}</problem>', { problem: 'use {{seed}} and {{#if x}}' })).toBe('<problem>use {{seed}} and {{#if x}}</problem>');
  });

  it('throws when a used slot is missing', () => {
    expect(() => render('{{problem}} {{brief}}', { problem: 'p' })).toThrow(/slot "brief"/);
  });

  it('renders an empty string for a slot that is present but empty', () => {
    expect(render('[{{brief}}]', { brief: '' })).toBe('[]');
  });

  it('takes the #if branch only for a non-blank value, else the #else branch', () => {
    const src = '{{#if refs}}GREAT {{refs}}{{else}}OK{{/if}}';
    expect(render(src, { refs: '4' })).toBe('GREAT 4');
    expect(render(src, {})).toBe('OK');
    expect(render(src, { refs: '  ' })).toBe('OK');
  });

  it('treats a slot used only inside an #if as optional', () => {
    expect(render('a{{#if brief}} {{brief}}{{/if}}b', {})).toBe('ab');
  });

  it('still requires slots used inside a branch that is taken', () => {
    expect(() => render('{{#if refs}}{{labels}}{{/if}}', { refs: '4' })).toThrow(/slot "labels"/);
  });

  it('supports nested #if blocks', () => {
    const src = '{{#if refs}}A{{#if brief}}B{{else}}b{{/if}}{{else}}-{{/if}}';
    expect(render(src, { refs: '1', brief: '1' })).toBe('AB');
    expect(render(src, { refs: '1' })).toBe('Ab');
    expect(render(src, {})).toBe('-');
  });

  it('drops lines that hold only a block tag, so blocks leave no blank lines', () => {
    const src = 'one\n{{#if refs}}\ntwo\n{{else}}\nthree\n{{/if}}\nfour';
    expect(render(src, { refs: 'x' })).toBe('one\ntwo\nfour');
    expect(render(src, {})).toBe('one\nthree\nfour');
  });

  it('keeps single braces (JSON examples) as text', () => {
    expect(render('{"routes":{"draft":"own"}}', {})).toBe('{"routes":{"draft":"own"}}');
  });

  it('rejects unknown slot names, malformed tags and unbalanced blocks at parse time', () => {
    expect(() => parseBody('{{nope}}', 't')).toThrow(/unknown slot "nope"/);
    expect(() => parseBody('{{#if problem}}x', 't')).toThrow(/never closed/);
    expect(() => parseBody('x{{/if}}', 't')).toThrow(/without/);
    expect(() => parseBody('x{{else}}', 't')).toThrow(/without/);
    expect(() => parseBody('{{#if problem}}a{{else}}b{{else}}c{{/if}}', 't')).toThrow(/second/);
    expect(() => parseBody('{{ #each x }}', 't')).toThrow(/malformed/);
    expect(() => parseBody('{{problem', 't')).toThrow(/malformed/);
  });

  it('lists every slot a body uses, including #if conditions', () => {
    expect([...slotsUsed(parseBody('{{problem}}{{#if refs}}{{labels}}{{else}}{{view}}{{/if}}', 't'))].sort()).toEqual(['labels', 'problem', 'refs', 'view']);
  });
});
