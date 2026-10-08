/**
 * Guard: no efficacy claims anywhere a person reads byway's words (spec §4, CR11): the app's screens and strings, the
 * recipe presentations and chooser questions it shows, the prompt templates' text (what models are told, and what
 * they echo into deliverables), and the READMEs that describe the product. The rule itself is src/view/claims.ts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHOOSER, PRESENTATIONS } from '@byway/catalog';
import { findClaims } from '../src/view/claims.ts';
import { filesUnder, REPO, templateText } from './guards/scan.ts';

const WEB = path.join(REPO, 'apps', 'web');
const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');

function offenders(files: string[], text: (file: string) => string = (f) => readFileSync(f, 'utf8')) {
  return files.map((file) => ({ file: rel(file), hits: findClaims(text(file)) })).filter((r) => r.hits.length > 0);
}

describe('no efficacy claims (spec §4, CR11)', () => {
  it('in the app: screens, components, view code, styles and routes', () => {
    const files = [...filesUnder(path.join(WEB, 'app'), /\.(tsx?|css|md|json)$/), ...filesUnder(path.join(WEB, 'src'), /\.(tsx?|css|md|json)$/)]
      // The rule's own definition necessarily spells the phrases out.
      .filter((file) => !file.endsWith(path.join('view', 'claims.ts')));
    expect(files.length).toBeGreaterThan(20);
    expect(offenders(files)).toEqual([]);
  });

  it('in the recipe presentations and the chooser questions the app shows', () => {
    expect(findClaims(JSON.stringify(PRESENTATIONS))).toEqual([]);
    expect(findClaims(JSON.stringify(CHOOSER))).toEqual([]);
  });

  it("in the prompt templates' text", () => {
    const templates = filesUnder(path.join(REPO, 'packages', 'prompts', 'templates'), /\.md$/);
    expect(templates.length).toBeGreaterThan(20);
    expect(offenders(templates, (f) => templateText(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('in the READMEs that describe the product', () => {
    expect(offenders([path.join(REPO, 'README.md'), path.join(WEB, 'README.md')])).toEqual([]);
  });

  it('reads templates without their front matter', () => {
    expect(templateText('---\nid: x\nsource: studies show\n---\n## user\nHello')).toBe('## user\nHello');
  });
});
