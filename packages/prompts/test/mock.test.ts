import { describe, expect, it } from 'vitest';
import { c4, CHOOSER } from '@byway/catalog';
import { parsePurpose, respond, type MockContext } from '@byway/gateway';
import type { Medium } from '@byway/protocol';
import { greatLineup, imagesSlot, labelled, labelOf, problemSlot } from '../src/index.ts';
import { FILES, library, mediumOf } from './library.ts';

const CRITICS = FILES.filter((f) => f.template.output === 'critique');

/**
 * The prompts and the gateway's demo-mode mock must agree (spec §3.3): the mock reads the problem, the current
 * artifact, image links, chooser questions and the nearest recipe out of the rendered prompts. These tests render the
 * real templates and ask the real mock, with no network and no keys.
 */

function ask(purpose: string, id: string, slots: Record<string, string>, extra: Partial<MockContext> = {}): string {
  const { role, medium } = parsePurpose(purpose);
  const r = library.render(id, { ...slots, ...(medium ? { medium } : {}) });
  return respond({ purpose, role, medium, system: r.system ?? '', prompt: r.user, images: 0, seed: 7, iteration: 0, ...extra });
}

const PROBLEM = problemSlot({ text: 'A sourdough bakery in Lisbon that opens at dawn' });
const PAGE = '<!doctype html>\n<html><head><title>x</title></head><body><main><figure class="art" data-slot="hero"><svg></svg></figure></main></body></html>';

describe('the gateway mock reads what the templates write', () => {
  it('finds the problem inside <problem> tags (a seeded page is about the bakery)', () => {
    const answer = ask('seed:web-page', 'article.SEED', { problem: PROBLEM, seed: 'Zq81xPl0aa9' });
    expect(answer).toMatch(/```html/);
    expect(answer).toContain('Sourdough bakery in Lisbon');
    expect(answer).not.toContain('Zq81xPl0aa9');
  });

  describe.each(CRITICS.map((f) => [f.template.id, f] as const))('critic %s, rendered in both modes', (id, f) => {
    const medium = mediumOf(f.template) as Medium;
    const purpose = `critic:${medium}`;

    it('OK mode (no references): the mock answers bullets, then "Score: N/10"', () => {
      const out = ask(purpose, id, { view: medium === 'web-page' ? '' : 'The work, as its audience meets it.' });
      expect(out).toMatch(/\nScore: \d+\/10$/);
      expect(out).not.toMatch(/Ranking:/);
    });

    it('GREAT mode: the mock reads M and the labels from the lineup line, critiques every item and ranks every label once', () => {
      for (const refs of [3, 4, 9]) {
        const m = refs + 1;
        const view = medium === 'web-page' ? '' : labelled(Array.from({ length: m }, (_, i) => `Item ${i + 1}: a piece of work in this medium.`));
        const out = ask(purpose, id, { view, ...greatLineup(refs) });
        const labels = Array.from({ length: m }, (_, i) => labelOf(i));
        const ranking = /\nRanking: (.+)$/.exec(out)?.[1]?.split(', ') ?? [];
        expect([...ranking].sort(), `${id} with ${refs} references`).toEqual(labels);
        for (const label of labels) expect(out).toMatch(new RegExp(`^### ${label}\\n- Intent: `, 'm'));
      }
    });

    if (medium === 'prose' || medium === 'code-diff') {
      it('GREAT mode: the mock finds the revised item in the rendered lineup and ranks it first, wherever it sits', () => {
        const ours = medium === 'prose' ? '# Our piece\n\nThe point, made plainly.\n\n[//]: # (byway-demo-revision: 3)' : '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n\nWhy: smaller.\n<!-- byway-demo-revision: 3 -->';
        for (const at of [0, 2, 4]) {
          const texts = ['First reference.', 'Second reference.', 'Third reference.', 'Fourth reference.'];
          texts.splice(at, 0, ours);
          const out = ask(purpose, id, { view: labelled(texts), ...greatLineup(4) });
          expect(/\nRanking: (\w+)/.exec(out)?.[1], `${id}, ours at ${labelOf(at)}`).toBe(labelOf(at));
        }
      });
    }
  });

  it('finds the current page in a fix turn (the revision counter moves)', () => {
    const answer = ask('fix:web-page', 'article.CRIT-W', { critique: '- The hero is cramped.', artifact: PAGE });
    expect(answer).toContain('<meta name="byway-revision" content="1">');
  });

  it('finds the image routes the integrate turn lists, and puts them in the page', () => {
    const images = imagesSlot('web-page', [{ artifactId: 'abc123', alt: 'A loaf at dawn', slot: 'hero' }]);
    const answer = ask('asset.integrate:web-page', 'helper.asset.integrate', { artifact: PAGE, images });
    expect(answer).toContain('src="/api/artifacts/abc123"');
  });

  it('applies the person\'s prose as written (voice.apply returns the voice, not the old draft)', () => {
    const answer = ask('voice.apply:prose', 'helper.voice.apply', { artifact: '# Old\n\nOld text.', voice: '# Mine\n\nMy own words.' });
    expect(answer).toContain('My own words.');
    expect(answer).not.toContain('Old text.');
  });

  it('reads the chooser questions from the intake prompt and answers each by id', () => {
    const questions = JSON.stringify(CHOOSER.map((q) => ({ id: q.id, routesTo: q.routesTo, text: q.text })), null, 2);
    const answer = ask('advisor.intake', 'advisor.intake', { problem: problemSlot({ text: 'A landing page for my bakery' }), questions });
    const json = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(answer)?.[1] ?? '{}') as { answers: { questionId: string; answer: boolean }[] };
    expect(json.answers.map((a) => a.questionId)).toEqual(CHOOSER.map((q) => q.id));
    expect(json.answers.find((a) => a.questionId === 'visual')?.answer).toBe(true);
  });

  it('reads the nearest recipe from the compose prompt and reuses its prompt ids', () => {
    for (const id of ['advisor.compose', 'advisor.compose.repair']) {
      const answer = ask(id, id, {
        problem: problemSlot({ text: 'A weekly update to my team about the migration' }),
        blocks: 'SEED, VISION, CRITIC, ASSET, RELAY, CUT, TELLS, VOICE',
        nearest: JSON.stringify(c4, null, 2),
        artifact: '{"schema":"byway.recipe/1","id":"broken"}',
        violations: '- PR1: the critic sees the brief',
      });
      expect(answer, id).toContain('"prompt": "product.c4.draft"');
    }
  });

  it('never makes the demo defect checks fire on the templates\' own wording', () => {
    for (const f of FILES.filter((x) => x.template.output === 'defects')) {
      const medium = f.template.id.includes('c5') ? 'media' : f.template.id.includes('c7') ? 'code-diff' : 'web-page';
      const answer = ask(`check:${medium}`, f.template.id, { view: 'A clean storyboard or diff.' });
      expect(answer, f.name).toBe('No defects.');
    }
  });
});
