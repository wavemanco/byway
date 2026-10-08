import { describe, expect, it } from 'vitest';
import { c4, CHOOSER } from '@byway/catalog';
import { parsePurpose, respond, type MockContext } from '@byway/gateway';
import { greatLineup, imagesSlot, labelled, problemSlot } from '../src/index.ts';
import { FILES, library } from './library.ts';

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

  it('answers a GREAT-mode critic with a rank in a lineup of references plus ours, and an OK-mode critic with a score', () => {
    const great = ask('critic:prose', 'product.c3.critic', { view: labelled(['one', 'two', 'three', 'four', 'ours']), ...greatLineup(4, 4) });
    expect(great).toMatch(/\nRank: \d+ of 5$/);
    const ok = ask('critic:prose', 'product.c3.critic', { view: 'The piece.' });
    expect(ok).toMatch(/\nScore: \d+\/10$/);
    for (const id of ['runbook.critic-ok', 'product.c2.critic', 'product.c4.recipient', 'product.c5.gate-critic', 'product.c6.critic', 'product.c6a.critic', 'product.c7.reviewer']) {
      const medium = id.includes('c2') ? 'options' : id.includes('c5') ? 'media' : id.includes('c7') ? 'code-diff' : id.startsWith('runbook') ? 'web-page' : 'prose';
      expect(ask(`critic:${medium}`, id, { view: 'x' }), id).toMatch(/Score: \d+\/10$/);
      expect(ask(`critic:${medium}`, id, { view: 'x', ...greatLineup(3, 0) }), id).toMatch(/Rank: \d+ of 4$/);
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
