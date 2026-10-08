import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PromptRenderer } from '@byway/contracts';
import { createPromptRenderer, PromptTemplateError } from '../src/index.ts';

let dir: string;
const write = (name: string, text: string) => writeFileSync(join(dir, name), text);
const template = (id: string, opts: { slots?: string; output?: string; system?: string; user: string; version?: number }) =>
  [
    '---',
    `id: ${id}`,
    `version: ${opts.version ?? 1}`,
    'fidelity: project',
    `slots: ${opts.slots ?? ''}`,
    `output: ${opts.output ?? 'plain-text'}`,
    'source: test',
    '---',
    ...(opts.system ? ['## system', opts.system, ''] : []),
    '## user',
    opts.user,
    '',
  ].join('\n');

const errorOf = (f: () => unknown): PromptTemplateError => {
  try {
    f();
  } catch (e) {
    if (e instanceof PromptTemplateError) return e;
    throw e;
  }
  throw new Error('expected a PromptTemplateError');
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-prompts-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createPromptRenderer', () => {
  it('implements the PromptRenderer contract: has, and render with id, version, hash, fidelity, system and user', () => {
    write('helper.demo.md', template('helper.demo', { slots: 'problem', system: 'You help.', user: '<problem>\n{{problem}}\n</problem>\n', version: 3 }));
    const r: PromptRenderer = createPromptRenderer({ dir });
    expect(r.has('helper.demo')).toBe(true);
    expect(r.has('helper.other')).toBe(false);
    const out = r.render('helper.demo', { problem: 'a bakery page' });
    expect(out).toMatchObject({ id: 'helper.demo', version: 3, fidelity: 'project', system: 'You help.', user: '<problem>\na bakery page\n</problem>' });
    expect(out.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('leaves system out when the template has no system section', () => {
    write('helper.demo.md', template('helper.demo', { user: 'Hi.' }));
    expect('system' in createPromptRenderer({ dir }).render('helper.demo', {})).toBe(false);
  });

  it('chooses the variant whose medium matches the medium slot, else the base template', () => {
    write('helper.demo.md', template('helper.demo', { user: 'base' }));
    write('helper.demo@prose.md', template('helper.demo', { user: 'prose variant' }));
    const r = createPromptRenderer({ dir });
    expect(r.render('helper.demo', { medium: 'prose' }).user).toBe('prose variant');
    expect(r.render('helper.demo', { medium: 'web-page' }).user).toBe('base');
    expect(r.render('helper.demo', {}).user).toBe('base');
    expect(r.render('helper.demo', { medium: 'prose' }).hash).not.toBe(r.render('helper.demo', {}).hash);
  });

  it('fails clearly when an id has only variants and none matches the medium', () => {
    write('helper.demo@prose.md', template('helper.demo', { user: 'prose variant' }));
    const r = createPromptRenderer({ dir });
    expect(r.has('helper.demo')).toBe(true);
    const e = errorOf(() => r.render('helper.demo', { medium: 'options' }));
    expect(e.code).toBe('no-variant');
    expect(e.message).toMatch(/options/);
    expect(errorOf(() => r.render('helper.demo', {})).code).toBe('no-variant');
  });

  it('throws for an unknown template and for a missing slot', () => {
    write('helper.demo.md', template('helper.demo', { slots: 'problem, brief', user: '{{problem}} {{brief}}' }));
    const r = createPromptRenderer({ dir });
    expect(errorOf(() => r.render('helper.nope', {})).code).toBe('unknown-template');
    const missing = errorOf(() => r.render('helper.demo', { problem: 'p' }));
    expect(missing.code).toBe('missing-slot');
    expect(missing.slot).toBe('brief');
  });

  it('ignores slots a template does not use', () => {
    write('helper.demo.md', template('helper.demo', { user: 'static' }));
    expect(createPromptRenderer({ dir }).render('helper.demo', { problem: 'p', medium: 'prose' }).user).toBe('static');
  });

  it('refuses to load a directory with a broken template, naming the file', () => {
    write('helper.demo.md', template('helper.demo', { slots: 'problem', user: 'no slot used' }));
    expect(() => createPromptRenderer({ dir })).toThrow(/helper\.demo\.md/);
  });

  it('ignores files that are not templates', () => {
    write('helper.demo.md', template('helper.demo', { user: 'x' }));
    write('notes.txt', 'not a template');
    expect(createPromptRenderer({ dir }).ids()).toEqual(['helper.demo']);
  });

  it('lists ids and describes each template', () => {
    write('helper.b.md', template('helper.b', { user: 'b', output: 'choice' }));
    write('helper.a@media.md', template('helper.a', { user: 'a' }));
    const r = createPromptRenderer({ dir });
    expect(r.ids()).toEqual(['helper.a', 'helper.b']);
    expect(r.variants('helper.a')).toEqual(['media']);
    expect(r.info('helper.b')).toMatchObject({ id: 'helper.b', output: 'choice', medium: undefined, file: 'helper.b.md' });
    expect(r.info('helper.a', 'media')).toMatchObject({ medium: 'media', file: 'helper.a@media.md' });
  });

  it('loads the package templates by default', () => {
    const r = createPromptRenderer();
    expect(r.has('article.SEED')).toBe(true);
  });
});
