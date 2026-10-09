import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isEntry, run, type Io } from '../src/main.ts';

const RECIPES = join(import.meta.dirname, '../../../recipes');

function capture(): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, out: (s) => stdout.push(s), err: (s) => stderr.push(s) };
}

function tempFile(name: string, text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'byway-cli-'));
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

describe('byway validate', () => {
  it('exits 0 for a valid catalog recipe and prints its hash', async () => {
    const io = capture();
    expect(await run(['validate', join(RECIPES, 'c1h.json')], io)).toBe(0);
    expect(io.stdout.join('\n')).toMatch(/^ok c1h sha256:[0-9a-f]{64}/);
    expect(io.stdout.join('\n')).toContain('exceptions used: C1-DR2, SM-1, SM-2, SM-3, SM-4, SM-6');
  });

  it('exits 1 and lists rule ids when the recipe breaks rules', async () => {
    const recipe = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(RECIPES, 'c1.json'), 'utf8')));
    recipe.exceptions = [];
    delete recipe.hash;
    const io = capture();
    expect(await run(['validate', tempFile('bad.json', JSON.stringify(recipe))], io)).toBe(1);
    const text = io.stdout.join('\n');
    expect(text).toContain('DR2 [default]');
    expect(text).toContain('DR7 [default]');
  });

  it('exits 1 when the stored hash does not match the content (a hand edit)', async () => {
    const recipe = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(RECIPES, 'b-plain.json'), 'utf8')));
    recipe.title = 'B-Plain (edited)';
    const io = capture();
    expect(await run(['validate', tempFile('edited.json', JSON.stringify(recipe))], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('hash mismatch');
  });

  it('exits 2 for a file that is not JSON', async () => {
    const io = capture();
    expect(await run(['validate', tempFile('x.json', '{ not json')], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('is not valid JSON');
  });

  it('exits 2 with the schema path for a malformed recipe', async () => {
    const io = capture();
    const bad = { schema: 'byway.recipe/1', id: 'x', title: 'x', kind: 'baseline', family: 'b', channel: 'protocol', inputs: [], stages: [{ stage: 'D1', body: { op: 'warp' } }], sitsOut: [], exceptions: [], bank: false };
    expect(await run(['validate', tempFile('m.json', JSON.stringify(bad))], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('stages.0.body.op');
  });

  it('exits 2 for a missing file without a stack trace', async () => {
    const io = capture();
    expect(await run(['validate', join(tmpdir(), 'byway-does-not-exist.json')], io)).toBe(2);
    const text = io.stderr.join('\n');
    expect(text).toContain('cannot read');
    expect(text).not.toContain('    at ');
  });
});

describe('file robustness (review findings)', () => {
  const plainText = () => readFileSync(join(RECIPES, 'b-plain.json'), 'utf8');

  it('accepts a UTF-8 BOM, as PowerShell 5.1 writes it', async () => {
    const io = capture();
    expect(await run(['validate', tempFile('bom.json', `﻿${plainText()}`)], io)).toBe(0);
  });

  it('rejects UTF-16 with a clear message', async () => {
    const io = capture();
    const file = tempFile('u16.json', '');
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(plainText(), 'utf16le')]));
    expect(await run(['validate', file], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('is UTF-16');
  });

  it('rejects a repeated key, which JSON.parse would silently resolve', async () => {
    const io = capture();
    const text = plainText().replace('"bank": false', '"bank": false,\n  "bank": true');
    expect(await run(['validate', tempFile('dup.json', text)], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('repeats the key "bank"');
  });

  it('rejects pathological nesting with exit 2 and no stack trace', async () => {
    const io = capture();
    const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
    expect(await run(['validate', tempFile('deep.json', deep)], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('nests deeper than');
  });

  it('recognises itself as the entry point through a directory junction or symlink', () => {
    const real = join(import.meta.dirname, '../src');
    const link = join(mkdtempSync(join(tmpdir(), 'byway-link-')), 'src');
    symlinkSync(real, link, 'junction');
    const moduleUrl = pathToFileURL(join(real, 'main.ts')).href;
    expect(isEntry(moduleUrl, join(link, 'main.ts'))).toBe(true);
    expect(isEntry(moduleUrl, join(real, 'json.ts'))).toBe(false);
    expect(isEntry(moduleUrl, undefined)).toBe(false);
  });
});

describe('byway hash', () => {
  it('prints the content hash', async () => {
    const io = capture();
    expect(await run(['hash', join(RECIPES, 'b-plain.json')], io)).toBe(0);
    expect(io.stdout[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('a lone surrogate in a recipe file (F19)', () => {
  // The file holds a JSON \u escape for half a surrogate pair: valid JSON and valid UTF-8, but text that has no
  // canonical form, so the recipe has no hash.
  const plain = () => readFileSync(join(RECIPES, 'b-plain.json'), 'utf8');
  const files = {
    'a knob name': () => plain().replace('"writes": true', '"writes": true,\n          "knobs": { "\\ud800": "x" }'),
    'the title': () => plain().replace('"title": "B-Plain (article Baseline 1)"', '"title": "B-Plain \\ud800"'),
  };

  it.each(Object.entries(files))('in %s: validate and hash both exit 2 with "is not a valid recipe"', async (_label, text) => {
    const file = tempFile('lone.json', text());
    expect(text()).toContain('\\ud800');
    for (const command of ['validate', 'hash']) {
      const io = capture();
      expect(await run([command, file], io), command).toBe(2);
      const err = io.stderr.join('\n');
      expect(err).toContain('is not a valid recipe');
      expect(err).toContain('the recipe cannot be hashed');
      expect(err.isWellFormed()).toBe(true);
      expect(io.stdout).toEqual([]);
    }
  });
});

describe('usage', () => {
  it('exits 2 with usage for no or unknown commands', async () => {
    for (const argv of [[], ['frobnicate'], ['validate']]) {
      const io = capture();
      expect(await run(argv, io)).toBe(2);
      expect(io.stderr.join('\n')).toContain('usage: byway');
    }
  });
});
