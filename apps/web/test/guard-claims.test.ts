/**
 * Guard: no efficacy claims anywhere a person reads byway's words (spec §4, CR11): the app's screens and strings, the
 * recipe presentations and chooser questions it shows, the prompt templates' text (what models are told, and what
 * they echo into deliverables), and the READMEs that describe the product. The rule itself is src/view/claims.ts.
 *
 * Copy that describes recipes and steps is also held to the outcome patterns (CRED-1): it says what a step does, never
 * what it achieves. That covers the catalog's presentations and chooser help, the advisor's composed explainers (every
 * sentence a composed recipe's steps can be explained with) and the evidence label summaries.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPOSED_EXPLAINERS, COMPOSED_SUMMARY, presentComposed, UNTESTED_SUMMARY } from '@byway/advisor';
import { CHOOSER, PRESENTATIONS, PROTOCOL_CONFIGS } from '@byway/catalog';
import { withHash } from '@byway/recipe';
import { findClaims, findOutcomeClaims } from '../src/view/claims.ts';
import { filesUnder, REPO, templateText } from './guards/scan.ts';

const WEB = path.join(REPO, 'apps', 'web');
const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');

function offenders(files: string[], text: (file: string) => string = (f) => readFileSync(f, 'utf8')) {
  return files.map((file) => ({ file: rel(file), hits: findClaims(text(file)) })).filter((r) => r.hits.length > 0);
}

/** Every string a presentation shows: name, promise, what it is for, step labels and explainers. */
const presentationCopy = (p: (typeof PRESENTATIONS)[number]): string[] => [
  p.name,
  p.promise,
  ...p.bestFor,
  ...p.stages.flatMap((s) => s.steps.flatMap((st) => [st.label, st.explainer])),
];

/** Copy whose sentences are meant to describe recipes and steps, each with where it comes from. */
function recipeCopy(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const p of PRESENTATIONS) for (const text of presentationCopy(p)) out.push({ where: `presentation ${p.recipeId}`, text });
  for (const q of CHOOSER) out.push({ where: `chooser ${q.id}`, text: q.text }, { where: `chooser ${q.id} help`, text: q.help });
  for (const [key, text] of Object.entries(COMPOSED_EXPLAINERS)) out.push({ where: `composed explainer ${key}`, text });
  // A composed recipe's steps as the advisor presents them, over every configuration's shape.
  for (const r of PROTOCOL_CONFIGS) {
    const composed = withHash({ ...r, id: `composed-${r.id}`, kind: 'composed', channel: 'workspace' });
    const p = presentComposed(composed, { code: 'X', name: 'Your recipe', promise: 'Not tested.', bestFor: ['Your problem'] });
    for (const st of p.stages.flatMap((s) => s.steps)) out.push({ where: `composed ${r.id} ${st.label}`, text: st.explainer });
  }
  out.push({ where: 'label summary (untested)', text: UNTESTED_SUMMARY }, { where: 'label summary (composed)', text: COMPOSED_SUMMARY });
  return out;
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

  it("in the advisor's composed explainers and evidence label summaries", () => {
    expect(findClaims(JSON.stringify(COMPOSED_EXPLAINERS))).toEqual([]);
    expect(findClaims(`${UNTESTED_SUMMARY} ${COMPOSED_SUMMARY}`)).toEqual([]);
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

describe('no outcome claims in copy that describes recipes and steps (CRED-1)', () => {
  it('the presentations, chooser help, composed explainers and label summaries say what steps do, not what they achieve', () => {
    const copy = recipeCopy();
    expect(copy.length).toBeGreaterThan(150);
    expect(copy.map((c) => ({ ...c, hits: findOutcomeClaims(c.text) })).filter((c) => c.hits.length > 0)).toEqual([]);
  });

  it('the Untested summary claims no planned study (ENG-13, LABEL-1)', () => {
    expect(UNTESTED_SUMMARY).not.toMatch(/plan|stud(y|ies)/i);
  });

  it('catches the sentences the review found, which the phrase list let through', () => {
    const found = [
      'Four distinct page designs, each pushed by an outside critique.',
      'Four drafts start in separate sessions, each from its own random spark, so they do not settle on the same safe design.',
      'A wide field of genuinely different options, with the obvious ones flagged, so you choose with everything in view.',
      'Options that say the same thing are merged, so the field stays wide.',
      'A memo with the ask in the first two lines and nothing the reader would miss, in minutes.',
      'A smaller code change that is easier to review, with the "why" written by you.',
      'This makes the change smaller and easier to read.',
      'Separate sessions, each from its own random spark, so the drafts do not settle on the same safe answer.',
    ];
    for (const text of found) {
      expect(findClaims(text), text).toEqual([]);
      expect(findOutcomeClaims(text).length, text).toBeGreaterThan(0);
    }
  });

  it('lets honest descriptions of steps through', () => {
    for (const text of [
      'Four drafts start in separate sessions, each told to take its creative direction from its own random string.',
      'The AI merges options that say the same thing into one.',
      'A fresh reviewer lists what the task did not ask for, and the AI removes what it lists.',
      'Not available in this version: no voice-over audio is made, and your locked script stays with the storyboard.',
      'Not yet tested.',
    ]) {
      expect(findOutcomeClaims(text), text).toEqual([]);
    }
  });
});
