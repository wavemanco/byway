import { CHOOSER, c3, presentationOf } from '@byway/catalog';
import type { ChooserAnswer } from '@byway/contracts';
import { problemSlot } from '@byway/prompts/pure';
import { describe, expect, it } from 'vitest';
import { AdvisorError } from '../src/index.ts';
import { demoAdvisor, fencedJson, sequence, WS } from './helpers.ts';

const userAnswer = (questionId: string, answer: boolean): ChooserAnswer => ({ questionId, answer, confidence: 0.3, rationale: 'You said so.', setBy: 'user' });

/** A well-formed intake answer: yes to the listed questions (with a confidence), no to the rest. */
const intakeAnswer = (yes: Record<string, number>, routes: Record<string, string> = {}) =>
  fencedJson({
    answers: CHOOSER.map((q) => ({ questionId: q.id, answer: q.id in yes, confidence: yes[q.id] ?? 0.8, rationale: q.id in yes ? 'It fits.' : 'It does not.' })),
    routes,
  });

describe('recommend: representative problems in demo mode', () => {
  it.each([
    ['A landing page for my neighborhood bakery', 'c1'],
    ['A status memo to leadership about the billing migration', 'c4'],
    ['A short story about a lighthouse keeper who stops answering letters', 'c6a'],
    ['Trim this agent-written code change before it goes to review', 'c7'],
    ['A 30-second video ad for our trail running shoes', 'c5'],
    ['Strategy options for entering the Brazilian market', 'c2'],
    ['A weekly newsletter series about urban gardening', 'c3'],
    ['My cover letter for a museum curator job', 'c6'],
  ])('"%s" → %s', async (text, expected) => {
    const { advisor } = demoAdvisor();
    const rec = await advisor.recommend({ text }, WS);
    expect(rec.recipeId).toBe(expected);
    expect(rec.presentation).toEqual(presentationOf(expected));
    expect(rec.routing).toBe('untested');
    expect(rec.recipeHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(rec.recipeHash).toBe(advisor.recipe(expected)?.hash);
  });

  it('asks the intake once, with the problem slot laid out by @byway/prompts and the questions as JSON the template fences', async () => {
    const { advisor, gateway, prompts } = demoAdvisor();
    const brief = { text: 'A landing page for my bakery', audience: 'Local families', attachments: [{ name: 'notes.txt', text: 'Open 7–3.' }] };
    await advisor.recommend(brief, WS);
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake']);
    expect(gateway.calls[0]).toMatchObject({ workspaceId: 'ws-1', profileId: 'demo' });
    expect(prompts.renders).toHaveLength(1);
    const { id, slots, rendered } = prompts.renders[0]!;
    expect(id).toBe('advisor.intake');
    expect(slots.problem).toBe(problemSlot(brief));
    // The template puts the slot inside its own ```json fence, so the slot is the bare JSON array.
    expect(JSON.parse(slots.questions ?? 'null')).toEqual(CHOOSER.map((q) => ({ id: q.id, routesTo: q.routesTo, text: q.text })));
    expect(rendered.user).toContain(`\`\`\`json\n${slots.questions}\n\`\`\``);
    expect(rendered.user).not.toContain('```json\n```');
    const sent = gateway.calls[0]!.messages[0]!.content[0];
    expect(sent?.type === 'text' && sent.text).toBe(rendered.user);
    expect(gateway.calls[0]!.system).toBe(rendered.system);
    expect(rendered.user).toContain('<problem>\nA landing page for my bakery');
  });

  it('records which template asked on every intake call, retries included (spec §3.3 provenance)', async () => {
    const intake = sequence('I think it is a landing page.', intakeAnswer({ visual: 0.9 }));
    const { advisor, gateway, prompts, ledger } = demoAdvisor({ responders: { 'advisor.intake': intake } });
    await advisor.recommend({ text: 'x' }, WS);
    const { rendered } = prompts.renders[0]!;
    const ref = { id: rendered.id, version: rendered.version, hash: rendered.hash, fidelity: rendered.fidelity };
    expect(ref).toMatchObject({ id: 'advisor.intake', fidelity: 'project' });
    expect(ref.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(gateway.calls.map((c) => c.prompt)).toEqual([ref, ref]);
    expect((await ledger()).map((e) => e.prompt)).toEqual([ref, ref]);
  });

  it('returns one answer per chooser question, set by the intake, with rationales', async () => {
    const { advisor } = demoAdvisor();
    const rec = await advisor.recommend({ text: 'A short story about a lighthouse keeper' }, WS);
    expect(rec.answers.map((a) => a.questionId)).toEqual(CHOOSER.map((q) => q.id));
    expect(rec.answers.every((a) => a.setBy === 'intake' && a.rationale.length > 0)).toBe(true);
    expect(rec.answers.find((a) => a.questionId === 'fiction')).toMatchObject({ answer: true });
  });
});

describe('recommend: fit, fallback and alternatives', () => {
  it('is a strong fit when the deciding answer is confident', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ fiction: 0.9 }) } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    expect([rec.recipeId, rec.fit, rec.composeSuggested]).toEqual(['c6a', 'strong', false]);
    expect(rec.why).toContain(CHOOSER.find((q) => q.id === 'fiction')!.text);
  });

  it('is a partial fit when the deciding answer is unsure', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ visual: 0.55 }) } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    expect([rec.recipeId, rec.fit]).toEqual(['c1', 'partial']);
  });

  it('falls back to C4 Memo Polish as a partial fit and suggests composing when nothing is a yes', async () => {
    const { advisor } = demoAdvisor();
    const rec = await advisor.recommend({ text: 'A status memo to leadership about the billing migration' }, WS);
    expect(rec).toMatchObject({ recipeId: 'c4', fit: 'partial', composeSuggested: true, alternatives: [] });
    expect(rec.presentation.name).toBe('Memo Polish');
    expect(rec.why).toMatch(/build your own/i);
  });

  it('offers up to two alternatives from later yes answers', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ decision: 0.9, media: 0.8, visual: 0.8, series: 0.75 }) } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    expect(rec.recipeId).toBe('c2');
    expect(rec.alternatives.map((a) => [a.recipeId, a.name])).toEqual([
      ['c5', 'Ad Video Chain'],
      ['c1', 'Landing Page Studio'],
    ]);
    expect(rec.alternatives[0]!.why).toContain(CHOOSER.find((q) => q.id === 'media')!.text);
  });

  it('carries the computed label and an estimate for the chosen profile', async () => {
    const { advisor } = demoAdvisor();
    const rec = await advisor.recommend({ text: 'A landing page for my bakery' }, WS);
    expect(rec.label).toEqual(advisor.label(advisor.recipe('c1')!));
    expect(rec.estimate).toEqual(advisor.estimate(advisor.recipe('c1')!, 'demo'));
  });

  it('never claims efficacy in what it says', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ decision: 0.9, media: 0.6, visual: 0.8 }) } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    const said = [rec.why, rec.label.summary, ...rec.alternatives.map((a) => a.why)].join(' ');
    expect(said).not.toMatch(/research-backed|proven|studies show|outperforms/i);
  });
});

describe('recommend: user answers', () => {
  it('lets a user answer override the intake, with confidence 1', async () => {
    const { advisor } = demoAdvisor();
    const rec = await advisor.recommend({ text: 'A landing page for my bakery' }, { ...WS, answers: [userAnswer('decision', true)] });
    expect([rec.recipeId, rec.fit]).toEqual(['c2', 'strong']);
    expect(rec.answers.find((a) => a.questionId === 'decision')).toMatchObject({ answer: true, confidence: 1, setBy: 'user' });
    expect(rec.alternatives.map((a) => a.recipeId)).toEqual(['c1']);
  });

  it('lets a user "no" remove the deciding yes', async () => {
    const { advisor } = demoAdvisor();
    const rec = await advisor.recommend({ text: 'A landing page for my bakery' }, { ...WS, answers: [userAnswer('visual', false)] });
    expect(rec).toMatchObject({ recipeId: 'c4', composeSuggested: true });
  });

  it('re-routes without a model call when every question already has an answer', async () => {
    const first = demoAdvisor();
    const rec = await first.advisor.recommend({ text: 'A landing page for my bakery' }, WS);
    const flipped = rec.answers.map((a) => (a.questionId === 'fiction' ? { ...a, answer: true, setBy: 'user' as const } : a));
    const again = demoAdvisor();
    const rerouted = await again.advisor.recommend({ text: 'A landing page for my bakery' }, { ...WS, answers: flipped });
    expect(again.gateway.calls).toHaveLength(0);
    expect(rerouted.recipeId).toBe('c1');
    expect(rerouted.alternatives.map((a) => a.recipeId)).toEqual(['c6a']);
    const off = flipped.map((a) => (a.questionId === 'visual' ? { ...a, answer: false, setBy: 'user' as const } : a));
    expect((await again.advisor.recommend({ text: 'A landing page for my bakery' }, { ...WS, answers: off })).recipeId).toBe('c6a');
  });
});

describe('recommend: reading the intake answer', () => {
  it('retries once with the parse error when the answer cannot be read', async () => {
    const intake = sequence('I think it is a landing page.', intakeAnswer({ visual: 0.9 }));
    const { advisor, gateway } = demoAdvisor({ responders: { 'advisor.intake': intake } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    expect(rec.recipeId).toBe('c1');
    expect(gateway.calls.map((c) => c.purpose)).toEqual(['advisor.intake', 'advisor.intake']);
    const retry = gateway.calls[1]!.messages;
    expect(retry.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const note = retry[2]!.content[0];
    expect(note?.type === 'text' && note.text).toMatch(/could not be (used|read)/i);
  });

  it('fails with a clear error when the retry cannot be read either', async () => {
    const { advisor, gateway } = demoAdvisor({ responders: { 'advisor.intake': () => '```json\n{"answers": "yes"}\n```' } });
    await expect(advisor.recommend({ text: 'x' }, WS)).rejects.toMatchObject({ name: 'AdvisorError', code: 'intake-unreadable' });
    await expect(advisor.recommend({ text: 'x' }, WS)).rejects.toBeInstanceOf(AdvisorError);
    expect(gateway.calls.filter((c) => c.purpose === 'advisor.intake')).toHaveLength(4);
  });

  it('does not trust an answer cut off at the output cap', async () => {
    let n = 0;
    const responder = () => (n++ === 0 ? { text: intakeAnswer({ media: 0.9 }), truncated: true } : intakeAnswer({ series: 0.9 }));
    const { advisor, gateway } = demoAdvisor({ responders: { 'advisor.intake': responder } });
    expect((await advisor.recommend({ text: 'x' }, WS)).recipeId).toBe('c3');
    expect(gateway.calls).toHaveLength(2);
  });

  it('takes the last fenced json block, ignores unknown question ids and clamps confidence', async () => {
    const answer = `First thoughts:\n${fencedJson({ answers: [] })}\nFinal:\n${fencedJson({
      answers: [
        { questionId: 'nonsense', answer: true, confidence: 1, rationale: 'x' },
        { questionId: 'series', answer: true, confidence: 7, rationale: 'A newsletter.' },
      ],
      routes: {},
    })}`;
    const { advisor } = demoAdvisor({ responders: { 'advisor.intake': () => answer } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    expect(rec.recipeId).toBe('c3');
    expect(rec.answers.find((a) => a.questionId === 'series')?.confidence).toBe(1);
    expect(rec.answers.find((a) => a.questionId === 'decision')).toMatchObject({ answer: false, confidence: 0 });
  });

  it('keeps only route choices the recommended recipe has', async () => {
    const { advisor } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ series: 0.9 }, { draft: 'own', entry: 'seed', other: 'x' }) } });
    const rec = await advisor.recommend({ text: 'x' }, WS);
    expect(rec.recipeId).toBe(c3.id);
    expect(rec.routes).toEqual({ draft: 'own' });
    const { advisor: a2 } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ series: 0.9 }, { draft: 'ghostwriter' }) } });
    expect((await a2.recommend({ text: 'x' }, WS)).routes).toEqual({});
  });
});

describe('recommend: route choices from an earlier recommendation (opts.routes)', () => {
  /** A complete set of user answers: yes to exactly these questions. */
  const allAnswers = (...yes: string[]) => CHOOSER.map((q) => userAnswer(q.id, yes.includes(q.id)));

  it('keeps them when the answers are complete and no intake call is made', async () => {
    const { advisor, gateway } = demoAdvisor();
    const rec = await advisor.recommend({ text: 'x' }, { ...WS, answers: allAnswers('series'), routes: { draft: 'own' } });
    expect(gateway.calls).toHaveLength(0);
    expect([rec.recipeId, rec.routes]).toEqual(['c3', { draft: 'own' }]);
  });

  it("keeps only the chosen recipe's routes and branches", async () => {
    const { advisor } = demoAdvisor();
    const routes = { draft: 'own', entry: 'seed', other: 'x' };
    expect((await advisor.recommend({ text: 'x' }, { ...WS, answers: allAnswers('series'), routes })).routes).toEqual({ draft: 'own' });
    // Flipped to a recipe without that route: nothing applies.
    expect((await advisor.recommend({ text: 'x' }, { ...WS, answers: allAnswers('fiction'), routes })).routes).toEqual({});
    expect((await advisor.recommend({ text: 'x' }, { ...WS, answers: allAnswers('series'), routes: { draft: 'ghostwriter' } })).routes).toEqual({});
  });

  it("uses the fresh intake's route choices, not the caller's, when the intake runs", async () => {
    const { advisor, gateway } = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ series: 0.9 }, { draft: 'ai' }) } });
    const rec = await advisor.recommend({ text: 'x' }, { ...WS, answers: [userAnswer('series', true)], routes: { draft: 'own' } });
    expect(gateway.calls).toHaveLength(1);
    expect(rec.routes).toEqual({ draft: 'ai' });
    const silent = demoAdvisor({ responders: { 'advisor.intake': () => intakeAnswer({ series: 0.9 }) } });
    expect((await silent.advisor.recommend({ text: 'x' }, { ...WS, answers: [userAnswer('series', true)], routes: { draft: 'own' } })).routes).toEqual({});
  });
});
