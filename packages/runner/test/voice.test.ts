/**
 * VOICE writes the person's copy exactly, without a model (F07, ADR-0081), and keepsVoice holds it exactly against
 * later machine writes. Activities on their own, against a temp store and a scripted gateway that records every call.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Medium } from '@byway/contracts';
import { AnswerRejected, StepError } from '../src/activities/failures.ts';
import { finishHumanStep } from '../src/activities/human.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { relayLink } from '../src/activities/relay.ts';
import { pageCopy, pageLockView } from '../src/copy.ts';
import { joinCodeDiff, parseStoryboard, serializeJson, splitCodeDiff } from '../src/formats.ts';
import { playwrightPages, type PageRenderer } from '../src/pages.ts';
import { INPUT_MEDIA_TYPE } from '../src/stored-inputs.ts';
import type { StepSpec } from '../src/types.ts';
import { benchRun, putWork, stepCall, storyboard, voiceBench, VoiceQuestion, voiceStep, type VoiceBench } from './helpers/voice-activity.ts';

// The runner's own Chromium: a page's VOICE is checked by the browser (ADR-0081). Each page question reads the page
// in it twice and each page write three times, so a test with many questions takes seconds on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });
const chromium = playwrightPages();
afterAll(() => chromium.close(), 60_000);

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench([], { pages: chromium });
});
afterEach(() => b.close());

const json = async (id: string) => JSON.parse(await b.store.artifacts.getText(id)) as Record<string, unknown>;
/** The person's words as the run holds them (P2): kept as a text file, by its id. */
const kept = async (text: string) => (await b.store.artifacts.putText(text, INPUT_MEDIA_TYPE)).id;
const rejected = (p: Promise<unknown>) => p.then(
  () => {
    throw new Error('expected the answer to be refused');
  },
  (e: unknown) => {
    expect(e).toBeInstanceOf(AnswerRejected);
    return (e as Error).message;
  },
);

const OPTIONS = serializeJson({
  options: [
    { title: 'Bread club', pitch: 'Fresh bread at seven.', rationale: 'Mornings matter.' },
    { title: 'Weekend box', pitch: 'A box on Saturday.', rationale: 'Weekends are slow.' },
  ],
});

describe('VOICE on options: a total reader, no model (F07)', () => {
  const open = async () => {
    const run = await benchRun(b, 'options');
    return VoiceQuestion.open(b, run, await putWork(b, 'options', OPTIONS));
  };

  it('stores a changed field exactly, with no model call', async () => {
    const q = await open();
    const out = await q.answer(q.offered!.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at six.'));
    expect(((await json(out.artifactId!)).options as { pitch: string }[])[0]!.pitch).toBe('Fresh bread at six.');
    expect(out.costUsd).toBe(0);
    expect(b.gateway.requests).toEqual([]);
  });

  it('refuses a line before the first label, naming it, instead of dropping it', async () => {
    const q = await open();
    const msg = await rejected(q.answer(`Lead with the club; it is cheaper.\n\n${q.offered}`));
    expect(msg).toMatch(/Line 1 \("Lead with the club; it is cheaper\."\) is not under a field/);
    expect(b.gateway.requests).toEqual([]);
    expect(await b.store.events(q.run.runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));
  });

  it('refuses a line between a label and its fields', async () => {
    const q = await open();
    const msg = await rejected(q.answer(q.offered!.replace('### A\n', '### A\nAvailable in every shop from May.\n')));
    expect(msg).toMatch(/Line 2 \("Available in every shop from May\."\) is not under a field/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('refuses a second "Pitch:", quoting how that field was first offered', async () => {
    const q = await open();
    const msg = await rejected(q.answer(q.offered!.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nPitch: Now with oat loaves.')));
    expect(msg).toMatch(/Option A "Pitch:" appears twice/);
    expect(msg).toMatch(/As first offered, line 3 read "Pitch: Fresh bread at seven\."/);
  });

  it('refuses a deleted block, a blanked pitch and reordered fields', async () => {
    const q = await open();
    expect(await rejected(q.answer(q.offered!.split('\n\n')[0]!))).toMatch(/### B is missing/);
    expect(await rejected(q.answer(q.offered!.replace('Pitch: A box on Saturday.', 'Pitch:')))).toMatch(/Option B needs a title, a pitch and a rationale/);
    expect(await rejected(q.answer(q.offered!.replace('Title: Bread club\nPitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nTitle: Bread club')))).toMatch(/order shown/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('stores layout variants: continuation lines, a value on the next line, "title:" with no space, CRLF, a paragraph', async () => {
    const deck = (await open()).offered!;
    for (const answer of [
      deck.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at seven.\nNow with oat loaves.'),
      deck.replace('Rationale: Mornings matter.', 'Rationale: Mornings matter.\n\nThey always have.'),
    ]) {
      const out = await (await open()).answer(answer);
      expect(out.artifactId).toBeDefined();
    }
    // Layout only: nothing is written.
    for (const answer of [deck.replace('Pitch: Fresh bread at seven.', 'Pitch:\n\nFresh bread at seven.'), deck.replace('Title: Bread club', 'title:Bread club'), deck.replace('\n\n', '\n').replace(/\n/g, '\r\n')]) {
      expect((await (await open()).answer(answer)).artifactId).toBeUndefined();
    }
    expect(b.gateway.requests).toEqual([]);
  });

  // Blank lines are layout wherever a run of them ends at a label, however long the run (r2: two or more were refused).
  const blankRuns = (deck: string) => [
    deck.replace('\n\n### B', '\n\n\n### B'),
    deck.replace('\n\n### B', '\n\n\n\n### B'),
    deck.replace('\nPitch: Fresh', '\n\n\nPitch: Fresh'),
    deck.replace('\nPitch: Fresh', '\n\n\n\nPitch: Fresh'),
    deck.replace(/\n/g, '\r\n').replace('\r\n\r\n### B', '\r\n \r\n\t\r\n### B'),
    `\n\n${deck}\n\n\n`,
  ];

  it('blank-line runs before a label are layout: nothing is written, and an edit beside them is stored', async () => {
    const deck = (await open()).offered!;
    for (const answer of blankRuns(deck)) {
      expect((await (await open()).answer(answer)).artifactId, JSON.stringify(answer)).toBeUndefined();
      const out = await (await open()).answer(answer.replace('Weekends are slow.', 'Weekends are quiet.'));
      expect(((await json(out.artifactId!)).options as { rationale: string }[]).map((o) => o.rationale), JSON.stringify(answer)).toEqual(['Mornings matter.', 'Weekends are quiet.']);
    }
    expect(b.gateway.requests).toEqual([]);
  });
});

describe('VOICE on a storyboard (F07)', () => {
  const SB = storyboard({ voiceover: 'Bread before seven.', headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'At your door' }] });
  const late = async (sb = SB) => VoiceQuestion.open(b, await benchRun(b, 'media'), await putWork(b, 'media', sb));

  it('refuses a duplicate or dropped "Shot N:", a preamble and a voice-over line, with no model call', async () => {
    const q = await late();
    const deck = q.offered!;
    expect(await rejected(q.answer(deck.replace('Shot 1: Hot bread', 'Shot 1: Hot bread\nShot 1: Still warm')))).toMatch(/"Shot 1:" appears twice/);
    expect(await rejected(q.answer(deck.replace('\nShot 2: At your door', '')))).toMatch(/"Shot 2:" is missing/);
    expect(await rejected(q.answer(`Make it warmer.\n${deck}`))).toMatch(/Line 1 \("Make it warmer\."\) is not under a field/);
    expect(await rejected(q.answer(`${deck}\nVoice-over: Bread now.`))).toMatch(/voice-over was locked/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('writes a doubled space inside a caption (a change), and nothing for a layout-only answer', async () => {
    const q = await late();
    const out = await q.answer(q.offered!.replace('Hot bread', 'Hot  bread'));
    expect(((await json(out.artifactId!)).storyboard as { caption?: string }[])[0]!.caption).toBe('Hot  bread');
    const again = await late();
    expect((await again.answer(again.offered!.replace('Headline: Fresh at seven', 'headline:\n\nFresh at seven'))).artifactId).toBeUndefined();
  });

  it('two or three blank lines between fields are layout: a caption edit beside them is stored', async () => {
    for (const gap of ['\n\n\n', '\n\n\n\n', '\r\n\r\n\r\n']) {
      const q = await late();
      const answer = q.offered!.replace('\nTagline:', `${gap}Tagline:`);
      const again = await late();
      expect((await again.answer(answer)).artifactId).toBeUndefined();
      const out = await q.answer(answer.replace('Hot bread', 'Warm bread'));
      expect(((await json(out.artifactId!)).storyboard as { caption?: string }[]).map((s) => s.caption)).toEqual(['Warm bread', 'At your door']);
    }
  });

  it('a cleared headline and a two-line caption are stored', async () => {
    const q = await late();
    const out = await q.answer(q.offered!.replace('Headline: Fresh at seven', 'Headline:').replace('Shot 1: Hot bread', 'Shot 1: Hot bread\n\n  still warm'));
    const sb = await json(out.artifactId!);
    expect(sb.headline).toBeUndefined();
    expect((sb.storyboard as { caption?: string }[])[0]!.caption).toBe('Hot bread\n\n  still warm');
    expect(sb.voiceover).toBe('Bread before seven.');
  });

  it('reads shots by position, so a storyboard with two shots numbered 2 can still be edited', async () => {
    const q = await late(storyboard({ voiceover: 'v', storyboard: [{ shot: 1, caption: 'a' }, { shot: 2, caption: 'b' }, { shot: 2, caption: 'c' }] }));
    const out = await q.answer(q.offered!.replace('Shot 2: c', 'Shot 2: see'));
    expect(((await json(out.artifactId!)).storyboard as { caption?: string }[]).map((s) => s.caption)).toEqual(['a', 'b', 'see']);
  });

  it('the early VOICE writes the script exactly', async () => {
    const run = await benchRun(b, 'media');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'media', SB), voiceStep({ variant: 'VOICE-early' }));
    expect(q.offered).toBe('Bread before seven.');
    const out = await q.answer('Bread before seven.\nStill warm at your door.');
    expect((await json(out.artifactId!)).voiceover).toBe('Bread before seven.\nStill warm at your door.');
  });
});

describe('VOICE on prose and code diffs (F07)', () => {
  it('a prose paragraph split is stored, not dropped as "unchanged"', async () => {
    const run = await benchRun(b, 'prose');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'prose', '# Memo\n\nWe migrate on Friday. Nothing changes for you.\n'));
    const out = await q.answer('# Memo\n\nWe migrate on Friday.\n\nNothing changes for you.');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe('# Memo\n\nWe migrate on Friday.\n\nNothing changes for you.\n');
  });

  it('empty prose and an empty Why are refused', async () => {
    const prose = await VoiceQuestion.open(b, await benchRun(b, 'prose'), await putWork(b, 'prose', '# Memo\n'));
    expect(await rejected(prose.answer('  \n'))).toMatch(/empty/);
    const diff = joinCodeDiff({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b', why: 'Why: old.' });
    const cd = await VoiceQuestion.open(b, await benchRun(b, 'code-diff'), await putWork(b, 'code-diff', diff));
    expect(await rejected(cd.answer('Why:'))).toMatch(/empty/);
    const out = await cd.answer('Why: the old one leaked.');
    expect(splitCodeDiff(await b.store.artifacts.getText(out.artifactId!)).why).toBe('Why: the old one leaked.');
    expect(b.gateway.requests).toEqual([]);
  });

  it('a claim-log VOICE on a run that is not prose offers, and writes, the copy deck', async () => {
    const run = await benchRun(b, 'options');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'options', OPTIONS), voiceStep({ variant: 'claim-log' }), 'claims');
    expect(q.offered).toMatch(/^### A\nTitle: Bread club\n/);
    const out = await q.answer(q.offered!.replace('Title: Bread club', 'Title: The bread club'));
    expect(((await json(out.artifactId!)).options as { title: string }[])[0]!.title).toBe('The bread club');
  });

  it('a store that fails to write is retried (a plain error), not asked again', async () => {
    const run = await benchRun(b, 'prose');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'prose', '# Memo\n'));
    const putText = b.store.artifacts.putText.bind(b.store.artifacts);
    b.store.artifacts.putText = async () => {
      throw new Error('disk busy');
    };
    const err = await q.answer('# Memo\n\nMine.').catch((e: unknown) => e);
    b.store.artifacts.putText = putText;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AnswerRejected);
    expect(err).not.toBeInstanceOf(StepError);
  });
});

describe('a broken character is asked about again, in every medium, before anything is stored (F07, r7)', () => {
  const HALF = '\uD83D'; // the first half of an emoji, alone: not valid Unicode, so no store can hold it
  const why = (line: number) => new RegExp(`^Line ${line} has a broken character \\(half of a surrogate pair, not valid Unicode\\), so it cannot be stored: type that character again, or take it out\\.`);
  const nothingStored = async (runId: string) => expect(await b.store.events(runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));

  it('VOICE on options, prose, a code diff, a storyboard, a claim log and a page', async () => {
    const cases: [Medium, string, (offered: string) => string, number, Partial<StepSpec>?, 'claims'?][] = [
      ['options', OPTIONS, (o) => o.replace('Pitch: Fresh bread at seven.', `Pitch: Fresh bread ${HALF} at seven.`), 3],
      ['prose', '# Memo\n\nOne.\n', (o) => `${o}\n\nTwo ${HALF}.`, 5],
      ['code-diff', joinCodeDiff({ why: 'Fix the bug.', diff: 'diff --git a/x b/x\n' }), () => `Fix the ${HALF} bug.`, 1],
      ['media', storyboard({ voiceover: 'V.', headline: 'H', tagline: 'T', storyboard: [{ shot: 1, caption: 'C' }] }), (o) => o.replace('Tagline: T', `Tagline: T${HALF}`), 2],
      ['prose', '# Memo\n\nWe launched on 3 May.\n', (o) => o.replace('3 May', `4 May${HALF}`), 1, { variant: 'claim-log' }, 'claims'],
      ['web-page', '<!doctype html><html><head><title>T</title></head><body><p>Hello</p><p>World</p></body></html>', () => `T\nHello\nWorld ${HALF}`, 3],
    ];
    for (const [medium, work, answerOf, line, step, from] of cases) {
      const run = await benchRun(b, medium);
      const q = await VoiceQuestion.open(b, run, await putWork(b, medium, work), voiceStep(step), from);
      const msg = await rejected(q.answer(answerOf(q.offered!)));
      expect(msg, medium).toMatch(why(line));
      await nothingStored(run.runId);
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('the author\'s own draft too', async () => {
    const run = await benchRun(b, 'prose');
    const draft: StepSpec = { id: 'draft', role: 'build', actor: 'human', consumes: [], produces: ['artifact'], writes: true };
    const err = await finishHumanStep(b.deps, { run, call: stepCall(run, 'draft'), step: draft, kind: 'write', resolution: { checkpointId: 'cp-draft', text: `# Mine\n\nA ${HALF}.` }, ports: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnswerRejected);
    expect((err as Error).message).toMatch(why(3));
    await nothingStored(run.runId);
  });
});

describe("the author's own draft that byway cannot read is asked again with why, not a failed run (ENG-6)", () => {
  const draft: StepSpec = { id: 'draft', role: 'build', actor: 'human', consumes: [], produces: ['artifact'], writes: true };
  const finish = (run: Awaited<ReturnType<typeof benchRun>>, text: string) => finishHumanStep(b.deps, { run, call: stepCall(run, 'draft'), step: draft, kind: 'write', resolution: { checkpointId: 'cp-draft', text }, ports: {} });
  const nothingStored = async (runId: string) => expect(await b.store.events(runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));

  it('a storyboard with a shot numbered twice: the problem goes back to the person, nothing is stored, and their corrected draft is the work', async () => {
    const run = await benchRun(b, 'media');
    const twice = storyboard({ voiceover: 'Bread before seven.', storyboard: [{ shot: 1, caption: 'Oven' }, { shot: 1, caption: 'Door' }] });
    expect(await rejected(finish(run, twice))).toBe('Your draft could not be used as the media: Shot 1 appears more than once in the storyboard: give each shot its own number.');
    await nothingStored(run.runId);
    const fixed = await finish(run, twice.replace(/"shot": 1,(?![\s\S]*"shot": 1,)/, '"shot": 2,'));
    expect(((await json(fixed.artifactId!)).storyboard as { shot: number }[]).map((s) => s.shot)).toEqual([1, 2]);
  });

  it('a code diff that is not a diff at all', async () => {
    const run = await benchRun(b, 'code-diff');
    expect(await rejected(finish(run, 'not a diff at all'))).toMatch(/^Your draft could not be used as the code-diff: The answer is not a unified diff/);
    await nothingStored(run.runId);
    expect(b.gateway.requests).toEqual([]);
  });
});

describe('keepsVoice holds the person’s words exactly (F07)', () => {
  const fixSpec: StepSpec = { id: 'apply-cut', role: 'fix', block: 'CUT', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const fenced = (text: string) => '```json\n' + text + '\n```';
  const script = 'Shot 1: Bread before seven.\nShot 2: Still warm.\nShot 3: At your door.';
  const before = storyboard({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] });
  const fix = async (medium: Parameters<typeof benchRun>[1], beforeText: string, answer: string, voice: string | undefined) => {
    const run = await benchRun(b, medium);
    const artifact = await putWork(b, medium, beforeText);
    b.gateway.requests.length = 0;
    const scripted = [answer, answer];
    b.gateway.complete = async (req) => {
      b.gateway.requests.push(req);
      return { text: scripted.shift() ?? '', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${b.gateway.requests.length}` };
    };
    const out = await modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact, critique: '- Cut shot 2.', ...(voice !== undefined ? { voice: await kept(voice) } : {}) }, refs: [] });
    const finished = (await b.store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    return { out, finished, run };
  };

  it('a voice-over the model appended to is written back as the person wrote it, and the step says so', async () => {
    const appended = before.replace('Shot 3: At your door.', 'Shot 3: At your door. Now 50% off!');
    const { out, finished } = await fix('media', before, fenced(appended), script);
    expect(b.gateway.requests).toHaveLength(1);
    expect((await json(out.artifactId!)).voiceover).toBe(script);
    expect(finished[0]).toMatch(/voice-over .*kept exactly/i);
  });

  it('a reordered voice-over is written back too', async () => {
    const reordered = before.replace(JSON.stringify(script), JSON.stringify('Shot 2: Still warm.\nShot 1: Bread before seven.\nShot 3: At your door.'));
    const { out } = await fix('media', before, fenced(reordered), script);
    expect((await json(out.artifactId!)).voiceover).toBe(script);
  });

  it('a first-pass cut on a shot-labelled script is stored with nothing locked; an obedient write gets no note', async () => {
    const cut = storyboard({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Your door', description: 'd3' }] });
    const { out, finished } = await fix('media', before, fenced(cut), script);
    expect(((await json(out.artifactId!)).storyboard as unknown[]).length).toBe(2);
    expect(finished[0]).toBeUndefined();
    expect(b.gateway.requests).toHaveLength(1);
  });

  it('on-screen copy accepted at a late VOICE is locked: a changed caption is refused (composed recipes)', async () => {
    const answer = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door';
    const vo = storyboard({ voiceover: 'Bread before seven.', headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] });
    const changed = vo.replace('"Hot bread"', '"Hot bread, 50% off"');
    await expect(fix('media', vo, fenced(changed), answer)).rejects.toThrow(/on-screen copy is the person's/);
  });

  it('options, prose and code-diff decks that change are refused', async () => {
    const opt = OPTIONS.replace('Fresh bread at seven.', 'Fresh bread at seven, guaranteed.');
    await expect(fix('options', OPTIONS, fenced(opt), '### A\nTitle: Bread club')).rejects.toThrow(/exactly as written/);
    await expect(fix('prose', '# Memo\n\nMine.\n', '# Memo\n\nMine. Now 50% off!', 'Mine.')).rejects.toThrow(/exactly as written/);
  });

  it('an empty voice is checked too', async () => {
    await expect(fix('prose', '# Memo\n\nMine.\n', '# Memo\n\nMine. Guaranteed.', '')).rejects.toThrow(/exactly as written/);
  });

  it('a relay link that only attaches its clip is stored byte for byte, with no note', async () => {
    const run = await benchRun(b, 'media');
    const artifact = await putWork(b, 'media', before);
    b.gateway.complete = async () => ({ text: '```json\n{"clipPrompt":"Shot 1: go","durationSec":3}\n```', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: 'l1' });
    b.gateway.video = async () => {
      const clip = await b.store.artifacts.putText('<svg/>', 'image/svg+xml');
      const frame = await b.store.artifacts.put(new Uint8Array([137, 80, 78, 71]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', costUsd: 0, servedModel: 'mock', provider: 'mock', ledgerEntryId: 'v1' };
    };
    const relay: StepSpec = { id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true };
    // The link starts from shot 1's frame (a link with none makes no clip, ADR-0090).
    const start = (await b.store.artifacts.put(new Uint8Array([137, 80, 78, 71]), 'image/png')).id;
    const out = await relayLink(b.deps, { run, call: { key: `${run.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' }, step: relay, ports: { artifact, voice: await kept(script), anchor: start }, shot: 1 });
    const stored = await json(out.artifactId!);
    expect(stored.voiceover).toBe(script);
    const shot = (stored.storyboard as { clipArtifactId?: string; lastFrameArtifactId?: string }[])[0]!;
    expect(shot.clipArtifactId).toBeDefined();
    // Byte for byte the storyboard as the link writes it (the clip and its last frame on shot 1), nothing written back.
    const was = parseStoryboard(before);
    if (!was.ok) throw new Error(was.problem);
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(serializeJson({ ...was.value, storyboard: was.value.storyboard.map((s) => (s.shot === 1 ? { ...s, clipArtifactId: shot.clipArtifactId, lastFrameArtifactId: shot.lastFrameArtifactId } : s)) }));
    const notes = (await b.store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    expect(notes).toEqual([undefined]);
  });
});

describe('VOICE on a web page: deterministic, no model (F07)', () => {
  const page = (b: string) => `<!doctype html><html><head><title>T</title></head><body>${b}</body></html>\n`;
  const open = async (html: string) => VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html));
  const stored = async (id: string) => (await b.store.artifacts.getText(id)).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '');

  it('writes deletions, order and link words exactly, with no model call, at no cost', async () => {
    const q = await open(page('<h1>Head</h1><p>Old middle</p><p>Please <a href="/terms">read terms</a> today.</p>'));
    expect(q.offered).toBe('T\nHead\nOld middle\nPlease [read terms] today.');
    const out = await q.answer('T\nNew head\n\nPlease [read the terms] today.');
    expect(await stored(out.artifactId!)).toBe('<h1>New head</h1><p>Please <a href="/terms">read the terms</a> today.</p>');
    expect(out.costUsd).toBe(0);
    expect(b.gateway.requests).toEqual([]);
  });

  it('a page with an out-of-range character reference opens and finishes', async () => {
    const q = await open(page('<p>A &#99999999; B</p><p>Two</p>'));
    expect(q.offered).toBe('T\nA \uFFFD B\nTwo');
    const out = await q.answer('T\nA \uFFFD B\nTwo!');
    expect(await stored(out.artifactId!)).toBe('<p>A &#99999999; B</p><p>Two!</p>');
  });

  it('refusals name the line and quote how it was first offered', async () => {
    const q = await open(page('<p>Please <a href="/terms">read terms</a> today.</p>'));
    const msg = await rejected(q.answer('T\nPlease read the terms today.'));
    expect(msg).toBe('Line 2 has 1 link in [brackets] and your line has 0: keep one pair per link, in order; leave a pair empty, [], to remove its link. As first offered, line 2 read "Please [read terms] today.".');
    expect(b.gateway.requests).toEqual([]);
  });

  it('the prompt says how a page is written and where each link goes, once, on the first offer and on a re-ask', async () => {
    const q = await open(page('<footer><p><a href="/terms">Terms of service</a> · <a href="/privacy">Privacy policy</a></p></footer>'));
    const legend = 'Where each one goes: line 2 "Terms of service" goes to /terms; line 2 "Privacy policy" goes to /privacy.';
    expect(q.prompt).toMatch(/^Write the words yourself: change any line below\. One line per block of text; leave a line empty to remove its text\. Words in \[brackets\] are a link's words/);
    expect(q.prompt!.split(legend)).toHaveLength(2);
    const problem = await rejected(q.answer('T\nTerms · Privacy'));
    const again = await q.ask({ prompt: `${problem} Write the words yourself: change any line below.`, initialText: 'T\nTerms · Privacy' });
    expect(again.prompt.split(legend)).toHaveLength(2);
    expect(again.prompt.split('One line per block of text')).toHaveLength(2);
    const out = await q.answer('T\n[Privacy] · [Terms]', again.checkpointId);
    expect(await stored(out.artifactId!)).toBe('<footer><p><a href="/terms">Privacy</a> · <a href="/privacy">Terms</a></p></footer>');
  });

  it('an in-flight question read differently since it opened: a moved line is refused on the first offer and applied on the re-ask', async () => {
    const html = page('<p>A</p><nav><a href="#1">One</a><a href="#2">Two</a></nav><pre>code</pre>');
    const old = 'T\nA\nOneTwo\ncode';
    const q = await VoiceQuestion.openInFlight(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html), old);
    const answer = 'T\nA\nOne and Two\nTwo';
    const problem = await rejected(q.answer(answer));
    expect(problem).toMatch(/^Line 3 was read again since this question opened; it now reads "One": write your change to that line\. As first offered, line 3 read "OneTwo"\./);
    const out = await q.reask(answer, problem, answer);
    expect(await stored(out.artifactId!)).toBe('<p>A</p><nav><a href="#1">One and Two</a><a href="#2">Two</a></nav><pre>code</pre>');
  });

  it('a line beside an image link or an svg social link is written (the link held no words to lose)', async () => {
    const q = await open(page('<h1><a href="/"><img src="logo.png" alt="Bakery"></a> Fresh Bakery</h1><p>Follow us <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>'));
    expect(q.offered).toBe('T\nFresh Bakery\nFollow us');
    const out = await q.answer('T\nWarm Bakery\nFollow me');
    expect(pageCopy(await b.store.artifacts.getText(out.artifactId!))).toEqual(['T', 'Warm Bakery', 'Follow me']);
    // The space beside each image stays outside its link.
    expect(await stored(out.artifactId!)).toBe('<h1><a href="/"><img src="logo.png" alt="Bakery"></a> Warm Bakery</h1><p>Follow me <a href="https://x.com/b"><svg width="10" height="10"></svg></a></p>');
    expect(b.gateway.requests).toEqual([]);
  });

  it('words added beside a share icon stay outside its link, and the stored page locks the person\'s deck (r3)', async () => {
    const html = page('<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> <a href="/contact">Contact us</a> today</p>');
    const q = await open(html);
    expect(q.offered).toBe('T\n[Contact us] today');
    const out = await q.answer('T\nPlease [Contact us] today');
    const written = await b.store.artifacts.getText(out.artifactId!);
    expect(await stored(out.artifactId!)).toBe('<p><a href="https://x.com/bakery"><svg width="10" height="10"></svg></a> Please <a href="/contact">Contact us</a> today</p>');
    // The lock a later write is held to is the person's deck and the one link they wrote words for.
    expect(JSON.parse(pageLockView(written))).toEqual({ deck: ['T', 'Please [Contact us] today'], links: ['/contact'] });
    expect(b.gateway.requests).toEqual([]);
  });

  it('punctuation glued to a pretty-printed link is stored glued, and the stored page locks the person\'s deck (r4)', async () => {
    const q = await open(page('<p>Visit\n  <a href="/shop">\n    our shop\n  </a>\n</p>'));
    expect(q.offered).toBe('T\nVisit [our shop]');
    const out = await q.answer('T\nVisit [our shop].');
    expect(await stored(out.artifactId!)).toBe('<p>Visit <a href="/shop">our shop</a>.\n</p>');
    expect(JSON.parse(pageLockView(await b.store.artifacts.getText(out.artifactId!)))).toEqual({ deck: ['T', 'Visit [our shop].'], links: ['/shop'] });
    expect(b.gateway.requests).toEqual([]);
  });

  it('a link the page leaves open: the prompt names where its carried words go, and an edit to them is stored (r4)', async () => {
    const q = await open(page('<p>Hello <a href="/x">world</p><p>Next block</p>'));
    expect(q.offered).toBe('T\nHello [world]\nNext block');
    expect(q.prompt).toMatch(/line 3 "Next block" goes to \/x\.$/);
    const out = await q.answer('T\nHello [world]\nNext blocks');
    expect(await stored(out.artifactId!)).toBe('<p>Hello <a href="/x">world</p><p>Next blocks</p>');
    expect(JSON.parse(pageLockView(await b.store.artifacts.getText(out.artifactId!)))).toEqual({ deck: ['T', 'Hello [world]', 'Next blocks'], links: ['/x', '/x'] });
  });

  it('where byway cannot tell a left-open link\'s words, the prompt says so and a change there is refused, never mis-written (r4)', async () => {
    const q = await open(page('<p>Intro</p><p>Hello <a href="/x">world</p><table><tr><td>Cell</td></tr></table><p>After</p>'));
    expect(q.prompt).toMatch(/Lines 3 to 5 cannot be changed in this step: a link on the page \(to \/x\) is left open/);
    const msg = await rejected(q.answer('T\nIntro\nHello world\nCells\nAfter'));
    expect(msg).toMatch(/^Line 4 cannot be changed in this step: a link on the page \(to \/x\) is left open .* Leave line 4 as it was offered\. As first offered, line 4 read "Cell"\.$/);
    const out = await q.answer('T\nWelcome\nHello world\nCell\nAfter');
    expect(await stored(out.artifactId!)).toBe('<p>Welcome</p><p>Hello <a href="/x">world</p><table><tr><td>Cell</td></tr></table><p>After</p>');
    expect(b.gateway.requests).toEqual([]);
  });

  it('a block inside an element browsers show inline, emptied, is kept where removing it would run two lines together; the lock reads as a browser shows it (r5)', async () => {
    for (const [html, offered, answer, written, deck] of [
      ['<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>', 'T\nIntro\nSpring sale\nOrder today', 'T\nIntro\n\nOrder today', '<div><font face="Arial">Intro<p></p></font>Order today</div>', ['T', 'Intro', 'Order today']],
      ['<div>Call us<ins><p>New offer</p></ins>today</div>', 'T\nCall us\nNew offer\ntoday', 'T\nCall us\n\ntoday', '<div>Call us<ins><p></p></ins>today</div>', ['T', 'Call us', 'today']],
      ['<section><span>one<div>two</span>three</div>after</section>', 'T\none\ntwothree\nafter', 'T\n\nthree\nafter', '<section><span><div></span>three</div>after</section>', ['T', 'three', 'after']],
    ] as const) {
      const q = await open(page(html));
      expect(q.offered).toBe(offered);
      const out = await q.answer(answer);
      expect(await stored(out.artifactId!)).toBe(written);
      expect(JSON.parse(pageLockView(await b.store.artifacts.getText(out.artifactId!)))).toEqual({ deck, links: [] });
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('an svg or math <title> before such a block, self-closed or left open, does not stop that: the block is still kept (r6)', async () => {
    // An svg <title>'s text is a tooltip: a browser does not show it, so it is not offered (r7); the lock still holds it.
    for (const [icon, iconLines, locked] of [
      ['<p><svg width="9" height="9"><title/></svg></p>', '', ''],
      ['<p>X<svg width="9" height="9"><title>Tip</svg></p>', 'X\n', 'X\nTip\n'],
      ['<p>x<math><title/></math></p>', 'x\n', 'x\n'],
    ] as const) {
      for (const [html, answer, written, deck] of [
        ['<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>', 'Intro\n\nOrder today', '<div><font face="Arial">Intro<p></p></font>Order today</div>', ['Intro', 'Order today']],
        ['<div>Call us<ins><p>New offer</p></ins>today</div>', 'Call us\n\ntoday', '<div>Call us<ins><p></p></ins>today</div>', ['Call us', 'today']],
        ['<div>Name<label><p>(required)</p></label>here</div>', 'Name\n\nhere', '<div>Name<label><p></p></label>here</div>', ['Name', 'here']],
      ] as const) {
        const q = await open(page(`${icon}${html}`));
        expect(q.offered!.split('\n').slice(0, -3)).toEqual(['T', ...iconLines.split('\n').filter((l) => l)]);
        const out = await q.answer(`T\n${iconLines}${answer}`);
        expect(await stored(out.artifactId!)).toBe(`${icon}${written}`);
        expect(JSON.parse(pageLockView(await b.store.artifacts.getText(out.artifactId!))).deck).toEqual(['T', ...locked.split('\n').filter((l) => l), ...deck]);
      }
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('two lines a browser shows on one screen line stay apart: a deleted line leaves its space, and new words at a line\'s edge keep one (r6)', async () => {
    for (const [html, answer, written, deck] of [
      ['<p><label>First</label><b> and </b><label>second</label></p>', 'T\nFirst\n\nsecond', '<p><label>First</label>  <label>second</label></p>', ['T', 'First', 'second']],
      ['<p>Price: <del>$20</del><span> now </span><ins>$15</ins></p>', 'T\nPrice:\n$20\n\n$15', '<p>Price: <del>$20</del>  <ins>$15</ins></p>', ['T', 'Price:', '$20', '$15']],
      ['<p><font>Hello</font><span> big </span><font>world</font></p>', 'T\nHello\n\nworld', '<p><font>Hello</font>  <font>world</font></p>', ['T', 'Hello', 'world']],
      ['<p>Pick <button type="button">Yes</button><em> or </em><button type="button">No</button></p>', 'T\nPick\nYes\n\nNo', '<p>Pick <button type="button">Yes</button>  <button type="button">No</button></p>', ['T', 'Pick', 'Yes', 'No']],
      ['<p><del>Was <b>$20 </b></del>Now $15</p>', 'T\nWas $20 only\nNow $15', '<p><del>Was <b>$20 </b> only </del>Now $15</p>', ['T', 'Was $20 only', 'Now $15']],
      ['<p><label>Email</label><a href="/help"> help</a> is here</p>', 'T\nEmail\nGet [help] is here', '<p><label>Email</label> Get <a href="/help"> help</a> is here</p>', ['T', 'Email', 'Get [help] is here']],
    ] as const) {
      const out = await (await open(page(html))).answer(answer);
      expect(await stored(out.artifactId!)).toBe(written);
      expect(JSON.parse(pageLockView(await b.store.artifacts.getText(out.artifactId!))).deck).toEqual(deck);
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('a line whose kept last word is an emoji is stored, in a link and outside one (r6)', async () => {
    for (const [html, answer, written] of [
      ['<p><strong>Free shipping</strong> on all orders 🎉</p>', 'T\nFree shipping on every order 🎉', '<p><strong>Free shipping</strong> on every order 🎉</p>'],
      ['<p>Ready? <a href="/o"><b>Order now</b> 🚀</a></p>', 'T\nReady? [Order today 🚀]', '<p>Ready? <a href="/o"><b>Order today</b> 🚀</a></p>'],
    ] as const) {
      const out = await (await open(page(html))).answer(answer);
      expect(await stored(out.artifactId!)).toBe(written);
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('a name-only anchor the page leaves open is not a link: the next paragraph is edited as the person sees it (r5)', async () => {
    const q = await open(page('<h2><a name="top"/>Welcome</h2><p>Our <a href="/menu">menu</a> changes daily.</p>'));
    expect(q.offered).toBe('T\nWelcome\nOur [menu] changes daily.');
    expect(q.prompt).not.toContain('(no address)');
    const out = await q.answer('T\nWelcome\nOur [menus] change daily!');
    expect(await stored(out.artifactId!)).toBe('<h2><a name="top"/>Welcome</h2><p>Our <a href="/menu">menus</a> change daily!</p>');
    expect(JSON.parse(pageLockView(await b.store.artifacts.getText(out.artifactId!)))).toEqual({ deck: ['T', 'Welcome', 'Our [menus] change daily!'], links: ['/menu'] });
  });

  it('an </a> inside a table cell the link holds does not end it: the prompt names those lines, and a change there is refused (r5)', async () => {
    const q = await open(page('<div><a href="/x">Shop<table><tr><td>Cell</a> more</td></tr></table>After table</div>'));
    expect(q.prompt).toMatch(/Lines 2 to 4 cannot be changed in this step: a link on the page \(to \/x\) is left open/);
    const msg = await rejected(q.answer(`${q.offered!.replace('After table', 'After the table')}`));
    expect(msg).toMatch(/^Line 4 cannot be changed in this step/);
    expect(b.gateway.requests).toEqual([]);
  });

  it('a link or button whose only other words are hidden is never left without a name: the edit is asked again, naming the line (r7)', async () => {
    for (const [html, answer, line, what] of [
      ['<form><p>Ready? <button type="submit"><span>Send</span><span hidden>Sending…</span></button> We reply fast.</p></form>', 'T\nReady?\n\nWe reply fast.', 3, 'button'],
      ['<p>Go <a href="/x">Read<span hidden> more</span></a> now</p>', 'T\nGo [] now', 2, 'link'],
      ['<p>Menu: <button type="button"><svg width="9" height="9"></svg><span>Open</span><span hidden>Close</span></button> here</p>', 'T\nMenu:\n\nhere', 3, 'button'],
    ] as const) {
      const q = await open(page(html));
      const msg = await rejected(q.answer(answer));
      expect(msg).toMatch(new RegExp(`^Line ${line}: this ${what} cannot be removed in this step \\(it holds words a browser hides\\) and would be left`));
      expect(await b.store.events(q.run.runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('a <body> after text that began the body is ignored, so deleting the block between them keeps it, empty (r7)', async () => {
    const html = '<!doctype html><html><head><title>T</title>Welcome</head><body><h2>Sale</h2>Order today</body></html>';
    const q = await VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html));
    expect(q.offered).toBe('T\nWelcome\nSale\nOrder today');
    const out = await q.answer('T\nWelcome\n\nOrder today');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace('<h2>Sale</h2>', '<h2></h2>'));
  });

  it('a script, noscript or comment inside an element the edit empties stays, byte for byte (r7)', async () => {
    for (const inner of ['<script>window.x=1</script>', '<noscript>Enable JS</noscript>', '<!-- keep -->']) {
      const out = await (await open(page(`<p>Hello <span>world${inner}</span></p>`))).answer('T\nHello');
      expect(await stored(out.artifactId!)).toBe(`<p>Hello<span>${inner}</span></p>`);
    }
  });

  it('an answer equal to the offer writes nothing, whatever its whitespace', async () => {
    const q = await open(page('<h1>Head</h1><p>Sub</p>'));
    expect((await q.answer('T\n  Head \nSub\n\n')).artifactId).toBeUndefined();
  });

  it('a claim-log VOICE on a web-page run offers the page deck', async () => {
    const run = await benchRun(b, 'web-page');
    const q = await VoiceQuestion.open(b, run, await putWork(b, 'web-page', page('<h1>We launched on 3 May.</h1>')), voiceStep({ variant: 'claim-log' }), 'claims');
    expect(q.offered).toBe('T\nWe launched on 3 May.');
    const out = await q.answer('T\nWe launched on 4 May.');
    expect(await stored(out.artifactId!)).toBe('<h1>We launched on 4 May.</h1>');
  });
});

describe('the browser has the last word on a page write (F07, r7)', () => {
  const page = (b: string) => `<!doctype html><html><head><title>T</title></head><body>${b}</body></html>\n`;
  const open = async (html: string) => VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html));
  const none = async () => undefined;
  /** What Chromium shows of a stored page. */
  const shows = async (id: string) => (await chromium.shownText(await b.store.artifacts.getText(id), none)).text;

  it('the round 4 to 6 glue reproductions are written as Chromium shows the person\'s lines', async () => {
    for (const [html, answer, shown] of [
      ['<p>Price: <del>$20</del><span> now </span><ins>$15</ins></p>', 'T\nPrice:\n$20\n\n$15', 'Price: $20 $15'],
      ['<p><del>Was <b>$20 </b></del>Now $15</p>', 'T\nWas $20 only\nNow $15', 'Was $20 only Now $15'],
      ['<p><label>Email</label><a href="/help"> help</a> is here</p>', 'T\nEmail\nGet [help] is here', 'Email Get help is here'],
      ['<p><label>First</label><b> and </b><label>second</label></p>', 'T\nFirst\n\nsecond', 'First second'],
      ['<div><font face="Arial">Intro<p>Spring sale</p></font>Order today</div>', 'T\nIntro\n\nOrder today', 'Intro\nOrder today'],
      ['<p>Visit\n  <a href="/shop">\n    our shop\n  </a>\n</p>', 'T\nVisit [our shop].', 'Visit our shop.'],
      ['<p><svg width="9" height="9"><title/></svg></p><div>Call us<ins><p>New offer</p></ins>today</div>', 'T\nCall us\n\ntoday', 'Call us\ntoday'],
    ] as const) {
      const out = await (await open(page(html))).answer(answer);
      expect(await shows(out.artifactId!), html).toBe(shown);
    }
    // Text that ends the head, then a <body> browsers ignore (round 6 ran "Welcome" into "Order today").
    const head = '<!doctype html><html><head><title>T</title>Welcome</head><body><h2>Sale</h2>Order today</body></html>';
    const out = await (await open(head)).answer('T\nWelcome\n\nOrder today');
    expect(await shows(out.artifactId!)).toBe('Welcome\nOrder today');
    expect(b.gateway.requests).toEqual([]);
  });

  it('a menu table: deleting either line of a two-line cell is written, as Chromium shows the person\'s lines (r8)', async () => {
    const menu = page(
      [
        '<table><thead><tr><th>Loaf</th><th>Price</th></tr></thead><tbody>',
        '<tr><td><strong>Country sourdough</strong><br><small>Crackling crust, open crumb</small></td><td>$9</td></tr>',
        '<tr>\n  <td>\n    <strong>Milk bread</strong>\n    <p class="note">Soft and sweet.</p>\n  </td>\n  <td>$8</td>\n</tr>',
        '<tr><td>Almond croissant</td><td>Twice-baked<br>Contains nuts</td><td>$5</td></tr>',
        '<tr><td>$4</td><td><h3>Morning bun</h3>Orange zest</td></tr>',
        '</tbody></table><p>Prices include delivery.</p>',
      ].join('\n'),
    );
    const before = (await chromium.shownText(menu, none)).text;
    for (const [line, row] of [
      ['Crackling crust, open crumb', 'Country sourdough\n$9'],
      ['Soft and sweet.', 'Milk bread\n$8'],
      ['Twice-baked', 'Almond croissant\nContains nuts\n$5'],
      ['Contains nuts', 'Almond croissant\nTwice-baked\n$5'],
      ['Morning bun', '$4\nOrange zest'],
    ] as const) {
      const q = await open(menu);
      const out = await q.answer(q.offered!.split('\n').map((l) => (l === line ? '' : l)).join('\n'));
      expect(out.artifactId, line).toBeDefined();
      const shown = await shows(out.artifactId!);
      // Each cell is a box of its own: its neighbours stay apart across boxes, as they were.
      expect(shown, line).toContain(row);
      expect(shown.replace(/\s+/g, ''), line).toBe(before.replace(line, '').replace(/\s+/g, ''));
    }
  });

  it('a space the person types at a changed line\'s edge, or keeps beside a link they remove, shows beside the text the page glues on (r8)', async () => {
    for (const [html, answer, shown] of [
      ['<p><b>Hello</b><font>world</font></p>', 'T\nHello\n there', 'Hello there'],
      ['<p><b>Hello</b><font>world</font></p>', 'T\nHi \nworld', 'Hi world'],
      ['<p><b>Sale,</b><font><a href="/d">$20</a> menu</font></p>', 'T\nSale,\n[] menu', 'Sale, menu'],
      // The round-7 verifier's three: a removed first link, and a trailing space after a kept one (round 7 ran them together).
      ['bread. here, —<a href="/c" id="k">  x,<svg width="4" height="4"><title>Tip</svg>ok🚀: today, Call?</a>\nhere: Intro here! open', 'T\nbread. here, — [(x,]\n[] here: Intro here! open', 'bread. here, — (x,\nhere: Intro here! open'],
      ['<sub>  <a>  Order <a href="/c" id="k">Intro, ok🚀: &nbsp;,<button type="button"> </button>$20</a>  menu Call, here</a></sub>', 'T\nOrder [Intro, ok🚀:  ,]\n[] menu Call, here', 'Order Intro, ok🚀:  ,\nmenu Call, here'],
      ['<blockquote><ins><small> <a href="/c" id="k"><a href="/b">\nprice,</a></a></small> sale,</ins>now: Order us! </blockquote>', 'T\n[price,] \nx Order us!', 'price, x Order us!'],
    ] as const) {
      const out = await (await open(page(html))).answer(answer);
      expect(await shows(out.artifactId!), html).toBe(shown);
    }
    // At a button's content edge a space never shows: one typed there is refused where the button touches the text beside
    // it (the person is told to leave it out), and needs nothing where a space outside the button already parts them.
    expect(await rejected((await open(page('<p><button type="button">Order.</button>$20: Order</p>'))).answer('T\n(Order. \n$20: Order'))).toBe(
      'Line 2: a space at the end of this line would be inside a button, where browsers do not show it, so it cannot part the line from the text after the button; leave the space out. As first offered, line 2 read "Order.".',
    );
    const out = await (await open(page('<p>Pay <button type="button">Now</button></p>'))).answer('T\nPay\n Later');
    expect(await shows(out.artifactId!)).toBe('Pay\nLater');
  });

  it('an emptied element holding a table cell is kept, so deleting its words is written, not refused for another number of cells (r8)', async () => {
    const html = page('<table><tr><td>Menu<sub><td></td> Fresh bread</sub><td>Sale</td></tr></table>');
    const before = (await chromium.shownText(html, none)).text;
    const out = await (await open(html)).answer('T\nMenu\n\nSale');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace(' Fresh bread', ' '));
    expect((await shows(out.artifactId!)).replace(/\s*\t\s*/g, '\t')).toBe(before.replace('Fresh bread', '').trim().replace(/\s*\t\s*/g, '\t'));
  });

  it('an inline block\'s last block line, deleted beside the next inline block, is written: the two blocks stay apart across boxes (r10; round 8 and 9 refused it)', async () => {
    // A visitor sees "Pro" and "$29" in boxes of their own, before and after: innerText read the deleted block's line
    // breaks against the space between the inline blocks, and refused this right write.
    const html = page('<div style="display:inline-block"><b>Pro</b><p>For teams</p></div> <div style="display:inline-block">$29</div>');
    const out = await (await open(html)).answer('T\nPro\n\n$29');
    expect(await shows(out.artifactId!)).toBe('Pro\n$29');
    // A button's content is an inline block: its padding parts "$20" from "Total" as it parted "now" (round 8 and 9
    // refused this deletion, reading innerText's "Pay $20Total").
    const button = await (await open(page('<p>Pay <button type="button"><b>$20</b> <label>now</label></button>Total</p>'))).answer('T\nPay\n$20\n\nTotal');
    expect(await shows(button.artifactId!)).toBe('Pay\n$20\nTotal');
  });

  it('an address and opening hours a white-space style breaks over lines keep their breaks beside a word changed in place of another (r11 verifier)', async () => {
    // Round 11 refused "12" to "14", "London" to "Leeds" and "6pm" to "7pm" (a browser would show on one line what it
    // showed on separate lines), and stored "Street" to "Road" with the address on one row.
    const address = page('<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>');
    for (const [from, to] of [['12', '14'], ['London', 'Leeds'], ['Street', 'Road']] as const) {
      const out = await (await open(address)).answer(`T\n${'Crumb & Co. 12 Baker Street London NW1 6XE'.replace(from, to)}`);
      expect(await shows(out.artifactId!), to).toBe('Crumb & Co.\n12 Baker Street\nLondon NW1 6XE'.replace(from, to));
    }
    const hours = page('<p style="white-space:pre-line">Mon–Fri 7am–6pm\nSat 8am–4pm\nSun closed</p>');
    const out = await (await open(hours)).answer('T\nMon–Fri 7am–7pm Saturday 8am–5pm Sun closed');
    expect(await shows(out.artifactId!)).toBe('Mon–Fri 7am–7pm\nSaturday 8am–5pm\nSun closed');
    // Two words glued beside a kept break keep it: the characters on both sides of the break are the person's own,
    // side by side as before (round 12's first fix wrote one space there, and the arbiter refused it).
    const glued = await (await open(address)).answer('T\nCrumb & Co. 12 BakerStreet London NW1 6XE');
    expect(await shows(glued.artifactId!)).toBe('Crumb & Co.\n12 BakerStreet\nLondon NW1 6XE');
  });

  it('punctuation glued to a line\'s last word in a box of its own is written into that box (r11 verifier)', async () => {
    // Round 11 wrote the "!" outside the price, a new flex item a visitor sees apart, and refused every such answer.
    const menu = page('<ul style="width:400px"><li style="display:flex;justify-content:space-between"><span>Cacio e pepe</span><span>£13</span></li></ul>');
    const out = await (await open(menu)).answer('T\nCacio e pepe£13!');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(menu.replace('£13</span>', '£13!</span>'));
    const chips = page('<style>.chip{display:inline-block;padding:2px 8px;margin-right:4px}</style><p>Tags: <span class="chip">New</span><span class="chip">Data</span></p>');
    const chip = await (await open(chips)).answer('T\nTags: NewData!');
    expect(await shows(chip.artifactId!)).toBe('Tags:\nNew\nData!');
  });

  it('vertical and turned text: a typed space a flex item\'s edge drops is asked again, and words glued as the line has them are written (r12 verifier)', async () => {
    // Round 12 judged every pair of neighbours as though their text ran across the page, so in vertical or turned text
    // two flex items were never on one row: it stored these spaces, which a visitor never sees ("Sign intoday").
    for (const [html, answer, glue] of [
      ['<div style="writing-mode:vertical-rl;display:flex;height:400px">Already registered?<a href="/l">Sign in</a></div>', 'T\nAlready registered?[Sign in] today', 'Sign intoday'],
      ['<div style="writing-mode:vertical-lr;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', 'T\nFresh[bread] daily', 'Freshbreaddaily'],
      ['<div style="writing-mode:sideways-rl;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', 'T\nFresh[bread] daily', 'Freshbreaddaily'],
      ['<div style="position:absolute;left:0;top:200px;transform:rotate(-90deg);transform-origin:left top;display:flex"><span>Scroll</span><a href="/more">down</a></div><p style="margin-left:80px">Body</p>', 'T\nScroll[down] now\nBody', 'Scrolldownnow'],
      ['<div style="position:absolute;left:40px;top:120px;transform:rotate(90deg);transform-origin:left top;display:flex">Find<a href="/m">menu</a></div><p style="margin-left:80px">Body</p>', 'T\nFind our [menu]\nBody', 'Find ourmenu'],
    ] as const) {
      const msg = await rejected((await open(page(html))).answer(answer));
      expect(msg, html).toContain('because a browser would run words together that your lines keep apart');
      expect(msg, html).toContain(glue);
    }
    // Round 12 refused these, reading a line break between glued flex items set top to bottom.
    const glued = await (await open(page('<div style="writing-mode:vertical-rl;display:flex;height:300px"><span>Fresh</span><a href="/n">New</a></div>'))).answer('T\nFresh[New]Fresh');
    expect(await shows(glued.artifactId!)).toBe('FreshNewFresh');
    const ja = page('<div lang="ja" style="writing-mode:vertical-rl;height:300px;display:flex"><span>営業時間</span><b>七時から</b></div><div lang="ja" style="writing-mode:vertical-rl;height:300px"><p>毎朝五時に焼きたてのパンをお届けします。</p></div>');
    const jaOut = await (await open(ja)).answer('T\n営業時間八時から\n毎朝六時に焼きたてのパンをお届けします。');
    expect(await shows(jaOut.artifactId!)).toBe('営業時間八時から\n毎朝六時に焼きたてのパンをお届けします。');
    // A space typed where a turned label's words run in one flow of text is written.
    const label = page('<div style="position:absolute;left:0;top:200px;transform:rotate(-90deg);transform-origin:left top">Scroll down</div><p style="margin-left:80px">Body</p>');
    expect(await shows((await (await open(label)).answer('T\nScroll down now\nBody')).artifactId!)).toBe('Scroll down now\nBody');
    // Far apart along a vertical or turned line, the second before the first in one row (row-reverse, order): not
    // offered, as in another order (round 13 offered these and stored "Fresh rye", which a visitor reads "rye … Fresh").
    for (const html of [
      '<div style="writing-mode:vertical-rl;display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:5em;height:500px;font:20px Arial"><span>Fresh</span> <span>bread</span></div>',
      '<div style="writing-mode:vertical-rl;display:flex;gap:5em;height:500px;font:20px Arial"><span>Fresh</span> <span style="order:-1">bread</span></div>',
      '<div style="position:absolute;left:30px;top:450px;transform:rotate(-90deg);transform-origin:left top;display:flex;flex-direction:row-reverse;justify-content:space-between;width:400px;font:20px Arial"><span>Fresh</span> <span>bread</span></div>',
    ]) {
      const q = await open(page(html));
      expect(q.offered, html).toBe('T');
      expect(q.prompt, html).toMatch(/: a browser shows its words run together or in another order: "Fresh bread"\.$/);
    }
  });

  it('a link that rests glued to the words after it and is nudged apart only at the start of its cycle is judged where it rests: a typed space it drops is asked again (r12 verifier)', async () => {
    const nudge = page('<style>@keyframes nudge{0%{transform:translateX(-14px)}8%,100%{transform:none}}.n{display:inline-block;margin-left:24px;animation:nudge 3s infinite}</style><p style="display:flex">Already have an account?<a class="n" href="/l">Sign in</a></p>');
    const msg = await rejected((await open(nudge)).answer('T\nAlready have an account?[Sign in] today'));
    expect(msg).toContain('because a browser would run words together that your lines keep apart');
    expect(msg).toContain('Sign intoday');
  });

  it('neighbours across a box\'s edge offset across their line: a typed space the edge drops is asked again saying why, and a row a visitor reads in the other order is not offered (r13 verifier)', async () => {
    // Round 12 and 13 read such a pair as on rows of their own, apart across boxes, and stored these spaces, which a
    // visitor never sees ("Sign intoday", "Freshbread"), and "Fresh rye", which a visitor reads "rye Fresh".
    for (const [html, answer] of [
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Already have an account?</span><a href="/l" style="position:relative;top:14px">Sign in</a></p>', 'T\nAlready have an account?[Sign in] today'],
      ['<p style="display:flex;align-items:flex-start;font:20px Arial"><span>Fresh</span><span style="margin-top:14px">bread</span></p>', 'T\nFresh bread'],
      ['<div style="writing-mode:vertical-rl;display:flex;align-items:flex-start;height:300px;font:20px Arial"><span>Fresh</span><span style="margin-block-start:14px">bread</span></div>', 'T\nFresh bread'],
    ] as const) {
      expect(await rejected((await open(page(html))).answer(answer)), html).toContain('because a browser shows the words there offset from each other across their line (one raised or lowered beside the next, at the edge of a box), so it cannot tell whether they would stand apart as your lines have them');
    }
    const reversed = await open(page('<p style="display:flex;flex-direction:row-reverse;justify-content:flex-end;align-items:flex-start;gap:6px;font:20px Arial"><span>Fresh</span> <span style="margin-top:14px">bread</span></p>'));
    expect(reversed.offered).toBe('T');
    expect(reversed.prompt).toMatch(/: a browser shows its words run together or in another order: "Fresh bread"\.$/);
    const staggered = await open(page('<h1 style="display:flex;align-items:flex-start;font:40px Arial"><span>Bake</span> <span style="margin-top:24px">better</span> <span>bread</span></h1><p>We bake every morning.</p>'));
    expect(staggered.offered).toBe('T\nWe bake every morning.');
    expect(staggered.prompt).toMatch(/: a browser shows its words offset from each other across the line \(one raised or lowered beside the next, at the edge of a box\), so byway cannot tell whether they stand apart: "Bake better bread"\.$/);
  });

  it('a card a 3D transform leaves flat (AOS\'s flip at rest) is offered and written; one truly turned in 3D that hides its overflow is named as turned in a way byway cannot measure (r13 verifier)', async () => {
    // Round 13 read perspective(2500px) rotateY(0) as a turn in 3D: such a card that hides its overflow kept nothing, so
    // its lines were not offered, and the prompt said they were hidden from sight.
    const aos = '<style>[data-aos=flip-left]{transform:perspective(2500px) rotateY(-100deg);transition:transform .4s}[data-aos=flip-left].aos-animate{transform:perspective(2500px) rotateY(0)}.c{overflow:hidden;padding:24px;width:320px}</style>';
    const q = await open(page(`${aos}<div class="c" data-aos="flip-left"><h3>Brand identity</h3><p>Logos, type and colour.</p></div><script>addEventListener('load', () => document.querySelectorAll('[data-aos]').forEach((e) => e.classList.add('aos-animate')));</script>`));
    expect(q.offered).toBe('T\nBrand identity\nLogos, type and colour.');
    const out = await q.answer('T\nBrand identity\nLogos, type and colour that last.');
    expect(await shows(out.artifactId!)).toBe('Brand identity\nLogos, type and colour that last.');
    const turned = await open(page('<div style="transform:perspective(400px) rotateY(30deg);overflow:hidden;width:400px"><h3>Fresh bread</h3></div><p>After</p>'));
    expect(turned.offered).toBe('T\nAfter');
    expect(turned.prompt).toMatch(/: a browser shows it in a box turned in a way byway cannot measure \(in 3D\), so byway cannot tell what of it that box cuts off: "Fresh bread"\.$/);
  });

  it('a line an ellipsis cuts in a box scaled down or shrunk by CSS zoom is not offered, and words pushed into the row a box of fixed height cuts under zoom are asked again (r13 verifier)', async () => {
    // Round 13 offered these truncated lines and stored "Fresh sourdough bread yliad", which a visitor sees as
    // "Fresh sourdough bread yl…", and stored words wrapped into a row a zoomed box cuts.
    for (const wrap of ['transform:scale(0.9);transform-origin:left top', 'zoom:0.9']) {
      const q = await open(page(`<div style="${wrap}"><p style="width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:16px Arial;margin:0">Fresh sourdough bread daily</p><p>Second line</p></div>`));
      expect(q.offered, wrap).toBe('T\nSecond line');
    }
    const zoomed = await open(page('<div style="zoom:0.8"><p style="width:220px;height:28px;overflow:hidden;font:16px/20px Arial;margin:0">Fresh bread every morning</p><p>Second line</p></div>'));
    expect(zoomed.offered).toBe('T\nFresh bread every morning\nSecond line');
    expect(await rejected(zoomed.answer('T\nFresh bread every morning with our sourdough starter\nSecond line'))).toMatch(/because a style on this page would hide "[^"]+" from sight there/);
  });

  it('where the reader misreads the page, the edit is asked again with the browser\'s reason, never mis-written', async () => {
    for (const [html, answer, problem] of [
      // Browsers move the font out of the table, right after "Middle".
      ['<div>Lead<p>Middle</p><table><tr><font>F</font><td>Cell</td></tr></table></div>', 'T\nLead\n\nF\nCell', 'byway could not put line 3 on this page exactly as you wrote it, because a browser would run words together that your lines keep apart: it would show "LeadF / Cell". Change line 3 again, or leave it as it was offered. As first offered, line 3 read "Middle".'],
      // A <b> inside a MathML <title> breaks out of it, so "Text" shows.
      ['<p><math><title><b>Text</b></title></math><span> b </span><font>C</font></p>', 'T\nText\n\nC', 'byway could not put line 3 on this page exactly as you wrote it, because a browser would run words together that your lines keep apart: it would show "TextC". Change line 3 again, or leave it as it was offered. As first offered, line 3 read "b".'],
    ] as const) {
      const q = await open(page(html));
      expect(await rejected(q.answer(answer)), html).toBe(problem);
      expect(await b.store.events(q.run.runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));
    }
    expect(b.gateway.requests).toEqual([]);
  });

  it('a line a browser does not show is not offered, and stays byte for byte; the prompt says so', async () => {
    const html = page('<p>X<svg width="9" height="9"><title>Tip</p><p>Hello</p>');
    const q = await open(html);
    // An svg <title> left open over the paragraph's end hides "Tip" and everything after it in a browser.
    expect(q.offered).toBe('T\nX');
    // The prompt names each line not offered, and why (r10; round 9 named none).
    expect(q.prompt).toMatch(/ These lines of the page are not offered, because a browser does not show them as one line here, and stay as they are: not shown on this page at all \(hidden, closed, or shown only on another screen size\): "Tip", "Hello"\.$/);
    const out = await q.answer('T\nX marks');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace('<p>X<svg', '<p>X marks<svg'));
    // A line a browser shows, but not in one piece with exactly its words, is not offered either, and the prompt says
    // that, not that it is hidden (r8). Flex items a visitor sees glued, as the line has them, are one piece (r10).
    const flex = await open(page('<div style="display:flex;flex-direction:row-reverse;justify-content:flex-end"><span>Second</span> <span>First</span></div><div style="display:flex"><span>Glued</span><span>Here</span></div><p>Shown</p>'));
    expect(flex.offered).toBe('T\nGluedHere\nShown');
    expect(flex.prompt).toMatch(/: a browser shows its words run together or in another order: "Second First"\.$/);
    const hidden = page('<div hidden>Menu</div><details><summary>More</summary><p>Inside</p></details><dialog>Closed</dialog><p class="x" style="display:none">Styled away</p><p>After</p>');
    const h = await open(hidden);
    expect(h.offered).toBe('T\nMore\nAfter');
    const out2 = await h.answer('T\nMore\nAfter all');
    expect(await b.store.artifacts.getText(out2.artifactId!)).toBe(hidden.replace('<p>After</p>', '<p>After all</p>'));
  });

  it('a heading a script splits into letters and a section a script slides into view are offered and written; a slide never shown is named as moved out of view (r10 verifier)', async () => {
    // Round 10 left the split heading's marks in the letters' own elements, so it placed no line of such a page; it read
    // the sliding section where it waited, off the page, and said it was hidden "for screen readers, or until a visitor
    // opens it".
    const tall = '<div style="height:1500px"></div>';
    const html = page(
      [
        '<style>body{overflow-x:hidden}.s{transition:transform .6s;transform:translate3d(100%,0,0)}.s.in{transform:none}</style>',
        '<h1 class="split">Fresh bread</h1>',
        tall,
        '<div class="s"><h3>Websites</h3></div>',
        tall,
        '<div style="width:300px;overflow:hidden"><div style="display:flex"><p style="flex:0 0 300px;margin:0">Slide one</p><p style="flex:0 0 300px;margin:0">Slide two</p></div></div>',
        '<p>Seeded rye</p>',
        '<script>document.querySelectorAll(".split").forEach((el) => { const t = el.textContent; el.textContent = ""; [...t].forEach((c) => { const s = document.createElement("span"); s.className = "ch"; s.textContent = c; el.appendChild(s); }); }); const go = () => document.querySelectorAll(".s").forEach((e) => { if (e.getBoundingClientRect().top < innerHeight - 50) e.classList.add("in"); }); addEventListener("scroll", go); go();</script>',
      ].join(''),
    );
    const q = await open(html);
    expect(q.offered).toBe('T\nFresh bread\nWebsites\nSlide one\nSeeded rye');
    expect(q.prompt).toMatch(/: hidden from sight \(for screen readers, moved out of view, or until a visitor opens it\): "Slide two"\.$/);
    const out = await q.answer('T\nFresh bread daily\nWebsites\nSlide one\nSeeded spelt');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace('>Fresh bread<', '>Fresh bread daily<').replace('Seeded rye', 'Seeded spelt'));
  });

  it('text a style hides from sight, though a browser lays it out, never takes the person\'s words: its line is not offered, and stays byte for byte (r9)', async () => {
    // The round-8 verifier's cases: Bootstrap's screen-reader-only class in a rating, a button and a card link; opacity 0;
    // font size 0; and a gap that is only a screen-reader-only space, which shows as none. Round 8 offered these lines and
    // wrote "Rated 5 by every single baker" as "Rated <span class="sr">5</span> by every single baker", whose "5" no
    // sighted visitor sees.
    const vh = '<style>.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style>';
    const html = page(
      [
        vh,
        '<p>Rated 4.5<span class="visually-hidden"> out of 5</span> stars</p>',
        '<form><button type="submit" class="btn btn-primary">Send message <span class="visually-hidden">to Saltbox</span></button></form>',
        '<div class="card"><h3>Quiet interfaces</h3><a href="/essays/quiet" class="stretched-link">Read more<span class="visually-hidden"> about quiet interfaces</span></a></div>',
        '<p>Sale<span style="opacity:0"> ends</span> today</p>',
        '<p><span style="font-size:0">Hidden</span>Shown</p>',
        '<p>Sale<span class="visually-hidden"> </span>today</p>',
        '<p>Fresh bread daily</p>',
      ].join('\n'),
    );
    const q = await open(html);
    expect(q.offered).toBe('T\nQuiet interfaces\nFresh bread daily');
    expect(q.prompt).toMatch(
      / These lines of the page are not offered, because a browser does not show them as one line here, and stay as they are: part of it is hidden \(from sight, for screen readers, or not shown at all\) or cut off: "Rated 4\.5 out of 5 stars", "Send message to Saltbox", "Read more about quiet interfaces", "Sale ends today", "HiddenShown"; a browser shows its words run together or in another order: "Sale today"\.$/,
    );
    const out = await q.answer('T\nQuiet interfaces, in practice\nWarm bread daily');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace('<h3>Quiet interfaces</h3>', '<h3>Quiet interfaces, in practice</h3>').replace('Fresh bread', 'Warm bread'));
  });

  it('a page a browser shows differently when the answer comes is asked again as read differently, not as lines added or dropped (r9)', async () => {
    // The question's two reads see a stylesheet that hides the promotion, the write's do not (as when an allowlisted CDN
    // answers once and not again). The person kept the three lines they were offered.
    let reads = 0;
    const drift: PageRenderer = { ...chromium, shownText: (html, resolve, opts) => chromium.shownText(++reads <= 2 ? html.replace('</head>', '<style>.promo{display:none}</style></head>') : html, resolve, opts) };
    const bench = await voiceBench([], { pages: drift });
    try {
      const html = page('<p>Fresh bread</p><p class="promo">Half price today</p><p>Order by nine</p>');
      const q = await VoiceQuestion.open(bench, await benchRun(bench, 'web-page'), await putWork(bench, 'web-page', html));
      expect(q.offered).toBe('T\nFresh bread\nOrder by nine');
      expect(await rejected(q.answer('T\nWarm bread\nOrder by nine'))).toBe(
        'This page is now read with 4 lines, where this question offered 3 (a browser shows it differently than when the question was asked, as when a stylesheet or font it loads comes back differently, or byway reads it differently), so byway cannot tell which lines you changed. The page is now read differently from line 3: it reads "Half price today". Answer again with 4 lines, one for each line the page has now.',
      );
    } finally {
      bench.close();
    }
  });

  it('a page with a marquee is read the same way each time, so its lines can be changed (r9)', async () => {
    // The marquee's text moves; measured where it happened to be, the page and its marked copy read differently and no
    // line could be changed (found by the round-9 links runs).
    const html = page('<div><a href="/t0"><b><i class="icon"></i></b></a>\n   Fresh</div>\n<p>Order <a href="/t3">Call<marquee>Call</a>Order\n caf&eacute;</marquee>bread</a> six Fresh</p>');
    const q = await open(html);
    expect(q.offered).toBe('T\nFresh\nOrder [Call]\nCallOrder café\n[bread] six Fresh');
    const out = await q.answer('T\na b Fresh\nOrder [Call]\nCallOrder café\n[bread] six Fresh');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace('   Fresh', '   a b Fresh'));
  });

  it('a canvas\'s fallback, which Chromium shows with JavaScript off but a visitor does not see, is not offered and stays byte for byte (r9)', async () => {
    const html = page('<p>Sales by month: <canvas width="300" height="150">No chart: sales rose <b>12%</b>.</canvas> Updated daily</p>');
    const q = await open(html);
    expect(q.offered).toBe('T\nSales by month:\nUpdated daily');
    const out = await q.answer('T\nSales by week:\nUpdated daily');
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe(html.replace('month', 'week'));
  });

  it('a write that would put the person\'s words where a style hides them from sight is asked again, naming the line (r9)', async () => {
    // A box that clips what overflows it: a longer first line pushes the second line out of sight.
    const html = page('<div style="width:120px;height:40px;line-height:20px;overflow:hidden"><div>One</div><div>Two</div></div>');
    const q = await open(html);
    expect(q.offered).toBe('T\nOne\nTwo');
    expect(await rejected(q.answer('T\nOne two three four five six\nTwo'))).toBe(
      'byway could not put line 2 on this page exactly as you wrote it, because a style on this page would hide "Two" from sight there (a browser lays that text out, as for a screen reader, but does not show it). Change line 2 again, or leave it as it was offered. As first offered, line 2 read "One".',
    );
    expect(await b.store.events(q.run.runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));
  });

  it('a line a style breaks over two screen lines is written, its break kept where the words around it were kept', async () => {
    const html = page('<style>.b{display:block}</style><h1>Fresh <span class="b">bread daily</span></h1>');
    const out = await (await open(html)).answer('T\nWarm bread daily');
    expect(await shows(out.artifactId!)).toBe('Warm\nbread daily');
    // An address a white-space style breaks over lines keeps every break where only a word changed (r10; round 9 put
    // it on one line), and the browser shows it so.
    const address = page('<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>');
    const moved = await (await open(address)).answer('T\nCrumb & Co. 12 Baker Street London NW2 6XE');
    expect(await b.store.artifacts.getText(moved.artifactId!)).toBe(address.replace('NW1', 'NW2'));
    expect(await shows(moved.artifactId!)).toBe('Crumb & Co.\n12 Baker Street\nLondon NW2 6XE');
  });

  it('a page that navigates away as it loads cannot be read, so its VOICE fails plainly, not with a retried error (r8)', async () => {
    const err = await open('<!doctype html><html><head><title>T</title><meta http-equiv="refresh" content="0;url=about:blank"></head><body><h1>Head</h1></body></html>').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('The page navigates away as it loads (a meta refresh, for example), so the text it shows could not be read.');
  });

  it('with no page renderer, a page\'s VOICE fails plainly: it never writes a page no browser checked', async () => {
    const bare = await voiceBench();
    try {
      const run = await benchRun(bare, 'web-page');
      const work = await putWork(bare, 'web-page', page('<h1>Head</h1>'));
      const err = await VoiceQuestion.open(bare, run, work).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StepError);
      expect((err as Error).message).toBe('The words on a web page cannot be written in this step: no page renderer is configured, and byway writes a page only when a browser shows it as you wrote it.');
      const finish = await finishHumanStep(bare.deps, { run, call: stepCall(run, 'voice'), step: voiceStep(), kind: 'write', resolution: { checkpointId: 'cp', text: 'T\nNew head' }, ports: { artifact: work }, initialText: 'T\nHead' }).catch((e: unknown) => e);
      expect(finish).toBeInstanceOf(StepError);
      expect(await bare.store.events(run.runId)).not.toContainEqual(expect.objectContaining({ type: 'artifact' }));
    } finally {
      bare.close();
    }
  });
});

describe('keepsVoice on a web page (F07)', () => {
  const fixSpec: StepSpec = { id: 'polish', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const voiced = '<!doctype html><html><head><title>T</title></head><body><h1>New head</h1><p>Please <a href="/t">read the terms</a> today.</p></body></html>';
  const fix = async (after: string) => {
    const run = await benchRun(b, 'web-page');
    const artifact = await putWork(b, 'web-page', voiced);
    b.gateway.complete = async (req) => {
      b.gateway.requests.push(req);
      return { text: '```html\n' + after + '\n```', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: 'l1' };
    };
    return modelStep(b.deps, { run, call: { key: `${run.runId}/polish/-/1`, stepId: 'polish', stage: 'D3' }, step: fixSpec, ports: { artifact, voice: await kept('T\nNew head\nPlease [read the terms] today.') }, refs: [] });
  };

  it('refuses a write that adds a claim or retargets a link; a class change passes', async () => {
    await expect(fix(voiced.replace('today.', 'today. Now 50% off!'))).rejects.toThrow(/every line of the page's text/);
    await expect(fix(voiced.replace('href="/t"', 'href="/elsewhere"'))).rejects.toThrow(/every link's words and address/);
    const out = await fix(voiced.replace('<h1>', '<h1 class="big">'));
    expect(await b.store.artifacts.getText(out.artifactId!)).toContain('<h1 class="big">New head</h1>');
  });
});
