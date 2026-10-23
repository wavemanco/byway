/**
 * A step takes in only what its prompt shows (ADR-0097). A step's `consumes` and `reads` say which slots the runner
 * fills; its template decides which of them the model sees. Admission reads that one fact (`promptShows`) wherever it
 * asks whether a step takes a port in: whose critique a writer applies, which of a person's answers reach the work.
 * The agreement with what the runner actually renders lives in @byway/runner's prompt-shows test.
 */
import { describe, expect, it } from 'vitest';
import type { PortType } from '@byway/protocol';
import { appliesCritique, critiqueSources, promptShows, seq, step, unappliedCritiques, type Node, type Recipe, type Step } from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

function recipeOf(body: Node, medium: Recipe['medium']): Recipe {
  const r = minimalRecipe();
  r.medium = medium;
  r.stages = [{ stage: 'D3', body }];
  return r;
}
const model = (id: string, role: Step['role'], prompt: string | undefined, consumes: PortType[], produces: PortType[], extra: Partial<Step> = {}): Step =>
  step({ id, role, actor: 'model', tier: 'mid', ...(prompt ? { prompt } : {}), consumes, produces, ...extra });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const yourCut = (id = 'cut'): Step => step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] });
const critic = (id: string): Step =>
  step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.c3.critic', consumes: ['view'], produces: ['critique', 'score'] });
const unapplied = (r: Recipe) => unappliedCritiques(r).map((p) => p.step.id);

describe("what a model step's prompt shows of the ports it takes in (promptShows)", () => {
  it('a port whose slot its template uses, and nothing it does not take in', () => {
    const revise = model('apply-cut', 'fix', 'product.c3.revise', ['critique', 'artifact'], ['artifact']);
    expect(promptShows(revise, 'critique', 'prose')).toBe(true);
    expect(promptShows(revise, 'artifact', 'prose')).toBe(true);
    expect(promptShows(revise, 'brief', 'prose')).toBe(false);
    // C3's draft prompt renders the problem and the brief: a draft on it that takes the list in never shows it.
    const draft = model('apply-cut', 'build', 'product.c3.ai-draft', ['intent', 'brief', 'critique', 'artifact'], ['artifact']);
    expect([promptShows(draft, 'intent', 'prose'), promptShows(draft, 'brief', 'prose')]).toEqual([true, true]);
    expect([promptShows(draft, 'critique', 'prose'), promptShows(draft, 'artifact', 'prose')]).toEqual([false, false]);
  });

  it("an image step shows what its briefs prompt renders: C3's image prompt renders the work alone", () => {
    const image = model('image', 'asset', 'product.c3.asset', ['critique', 'artifact'], ['artifact'], { block: 'ASSET' });
    expect(promptShows(image, 'artifact', 'prose')).toBe(true);
    expect(promptShows(image, 'critique', 'prose')).toBe(false);
    // One whose prompt the library does not hold is asked by the image-briefs helper, as the runner does.
    const unnamed = model('image', 'asset', 'no.such.prompt', ['critique', 'artifact'], ['artifact'], { block: 'ASSET' });
    expect(promptShows(unnamed, 'artifact', 'prose')).toBe(true);
    expect(promptShows(unnamed, 'critique', 'prose')).toBe(false);
  });

  it('a seed prompt renders only the problem and the string, whatever the seed takes in', () => {
    for (const prompt of ['article.SEED', 'product.c3.seed-angle', 'product.c6a.seed-card']) {
      const seed = model('seed', 'seed', prompt, ['intent', 'critique', 'brief', 'taste'], ['artifact'], { block: 'SEED' });
      expect((['intent', 'critique', 'brief', 'taste'] as const).map((p) => promptShows(seed, p, 'prose')), prompt).toEqual([true, false, false, false]);
    }
  });

  it("a relay link's brief slot holds its shot (\"Shot N\"), never the brief; its start frame rides along", () => {
    const regenerate = model('regenerate', 'relay', 'product.c5.regenerate', ['critique', 'brief', 'artifact', 'anchor'], ['artifact', 'anchor'], { block: 'RELAY' });
    expect(promptShows(regenerate, 'critique', 'media')).toBe(true);
    expect(promptShows(regenerate, 'brief', 'media')).toBe(false);
    expect(promptShows(regenerate, 'anchor', 'media')).toBe(true);
  });

  it('images ride along whatever the template says: a view on media judged by screenshots, and the options there but to an overlap flag', () => {
    // runbook.critic-ok has no view slot: the critic sees the page's screenshots.
    const c1Critic = model('critic', 'critic', 'runbook.critic-ok', ['view'], ['critique', 'score']);
    expect(promptShows(c1Critic, 'view', 'web-page')).toBe(true);
    // On prose a view is text, shown only where the template uses its slot.
    const draftOnView = model('draft', 'build', 'product.c3.ai-draft', ['intent', 'brief', 'view'], ['artifact']);
    expect(promptShows(draftOnView, 'view', 'prose')).toBe(false);
    // On a web page the options' slot holds only "(The screenshots under this label show it.)": an overlap flag, which
    // is never shown their screenshots, sees nothing of them; any other step sees their screenshots.
    const flag = model('flag', 'overlap', 'product.c3.vanilla-flag', ['view', 'option_set<artifact>'], ['critique']);
    expect(promptShows(flag, 'option_set<artifact>', 'prose')).toBe(true);
    expect(promptShows(flag, 'option_set<artifact>', 'web-page')).toBe(false);
    expect(promptShows(model('map', 'build', 'product.c3.ai-draft', ['intent', 'brief', 'option_set<artifact>'], ['artifact']), 'option_set<artifact>', 'web-page')).toBe(true);
    // An ASSET step's options slot on the options medium holds the work's own option labels.
    const boards = model('boards', 'asset', 'product.c2.mood-boards', ['artifact', 'option_set<artifact>'], ['asset'], { block: 'ASSET' });
    expect(promptShows(boards, 'option_set<artifact>', 'options')).toBe(false);
  });

  it("a judging step is never given the work (port rule 1); a score and the images beside the work never reach a prompt", () => {
    const judging = model('critic', 'critic', 'product.c3.critic', ['view', 'artifact', 'score', 'asset'], ['critique', 'score']);
    expect((['view', 'artifact', 'score', 'asset'] as const).map((p) => promptShows(judging, p, 'prose'))).toEqual([true, false, false, false]);
  });

  it("read by the ports it declares where byway's library has no template for its prompt (a research recipe's own, or none), and for a person's or a tool's step", () => {
    expect(promptShows(model('apply', 'fix', 'study1.A10', ['critique', 'artifact'], ['artifact']), 'critique', 'web-page')).toBe(true);
    expect(promptShows(model('apply', 'fix', undefined, ['critique', 'artifact'], ['artifact']), 'critique', 'prose')).toBe(true);
    // A prompt the library holds for other media only (a helper written per medium) has no template on this one.
    expect(promptShows(model('apply', 'fix', 'helper.asset.integrate', ['critique', 'artifact'], ['artifact']), 'critique', 'options')).toBe(true);
    expect(promptShows(step({ id: 'yours', role: 'build', actor: 'human', consumes: ['critique', 'artifact'], produces: ['artifact'] }), 'critique', 'prose')).toBe(true);
    expect(promptShows(model('apply', 'fix', 'product.c3.revise', ['artifact'], ['artifact']), 'critique', 'prose')).toBe(false);
  });
});

describe('the semantics read it: a step takes in only what its prompt shows', () => {
  it('a writer applies a critique only where its prompt shows it (appliesCritique)', () => {
    expect(appliesCritique(model('f', 'fix', 'product.c3.revise', ['critique', 'artifact'], ['artifact']), false, 'prose')).toBe(true);
    expect(appliesCritique(model('f', 'build', 'product.c3.ai-draft', ['intent', 'brief', 'critique'], ['artifact']), false, 'prose')).toBe(false);
    expect(appliesCritique(model('f', 'seed', 'product.c3.seed-angle', ['intent', 'critique'], ['artifact']), false, 'prose')).toBe(false);
    expect(appliesCritique(model('f', 'fix', undefined, ['critique', 'artifact'], ['artifact']), false, 'prose')).toBe(true);
  });

  it("C3 with the trim's fix replaced by an AI draft on C3's draft prompt, or an image step on its image prompt: your list reaches the work on no path", () => {
    const withFix = (fix: Step) => recipeOf(seq(render('cut-render'), yourCut(), fix, render('after')), 'prose');
    expect(unapplied(withFix(model('apply-cut', 'fix', 'product.c3.apply-cut', ['critique', 'artifact'], ['artifact'], { writes: true })))).toEqual([]);
    expect(unapplied(withFix(model('apply-cut', 'build', 'product.c3.ai-draft', ['intent', 'brief', 'critique', 'artifact'], ['artifact'], { writes: true })))).toEqual(['cut']);
    expect(unapplied(withFix(model('apply-cut', 'asset', 'product.c3.asset', ['critique', 'artifact'], ['artifact'], { block: 'ASSET', writes: true })))).toEqual(['cut']);
  });

  it('a seed that takes your list in never shows it', () => {
    const r = recipeOf(seq(render('cut-render'), yourCut(), model('seed', 'seed', 'product.c3.seed-angle', ['intent', 'critique'], ['artifact'], { block: 'SEED', writes: true })), 'prose');
    expect(unapplied(r)).toEqual(['cut']);
  });

  it("a relay link that takes your brief in is shown its shot, not your brief", () => {
    const reaction = step({ id: 'direction', role: 'vision', block: 'VISION', actor: 'human', consumes: ['view'], produces: ['critique', 'brief'] });
    const clip = model('clip', 'relay', 'product.c5.clip', ['anchor', 'artifact', 'brief'], ['artifact', 'anchor'], { block: 'RELAY', writes: true });
    expect(unapplied(recipeOf(seq(render('board'), reaction, clip), 'media'))).toEqual(['direction']);
  });

  it('an AI step carries on only what its prompt shows: a spec interview that renders only the problem carries nothing of your list', () => {
    const interview = model('interview', 'vision', 'product.c7.interview', ['intent', 'critique'], ['brief'], { block: 'VISION' });
    const implement = model('implement', 'build', 'product.c7.implement', ['intent'], ['artifact'], { reads: ['brief'], writes: true });
    expect(unapplied(recipeOf(seq(render('diff'), yourCut(), interview, implement), 'code-diff'))).toEqual(['cut']);
  });

  it("whose critique a writer applies: none for a writer whose prompt never shows a critique", () => {
    const shown = model('revise', 'fix', 'product.c3.revise', ['critique', 'artifact'], ['artifact']);
    const unshown = model('draft', 'build', 'product.c3.ai-draft', ['intent', 'brief', 'critique'], ['artifact']);
    const c = critic('critic');
    const sources = critiqueSources(recipeOf(seq(render('r'), c, shown, unshown), 'prose'));
    expect(sources.get(shown)).toBe(c);
    expect(sources.has(unshown)).toBe(false);
  });
});
