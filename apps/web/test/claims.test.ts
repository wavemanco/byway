import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_CLAIMS, findClaims } from '../src/view/claims.ts';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css|md|json)$/.test(name) ? [path] : [];
  });
}

describe('the claims rule (spec §4, CR11)', () => {
  it('lists the forbidden efficacy phrases', () => {
    expect(FORBIDDEN_CLAIMS).toEqual(['research-backed', 'proven', 'studies show', 'outperforms']);
  });

  it('finds the phrases in any case and spelling', () => {
    expect(findClaims('A Research-Backed method')).toEqual(['research-backed']);
    expect(findClaims('research backed')).toEqual(['research-backed']);
    expect(findClaims('Studies show it Outperforms the rest')).toEqual(['studies show', 'outperforms']);
    expect(findClaims('A proven recipe')).toEqual(['proven']);
  });

  it('does not flag honest wording', () => {
    expect(findClaims('Untested — not yet studied')).toEqual([]);
    expect(findClaims('Conversion lift is unproven.')).toEqual([]);
  });

  it('keeps every product string in apps/web free of efficacy claims', () => {
    const offenders = [...sourceFiles(join(appRoot, 'app')), ...sourceFiles(join(appRoot, 'src'))]
      // The rule's own definition necessarily spells the phrases out.
      .filter((file) => !file.endsWith(join('view', 'claims.ts')))
      .map((file) => ({ file: relative(appRoot, file), hits: findClaims(readFileSync(file, 'utf8')) }))
      .filter((r) => r.hits.length > 0);
    expect(offenders).toEqual([]);
  });
});
