/**
 * VOICE writes the person's copy exactly, without a model (F07, ADR-0081), and keepsVoice holds it exactly against
 * later machine writes. Activities on their own, against a temp store and a scripted gateway that records every call.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnswerRejected, StepError } from '../src/activities/failures.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { relayLink } from '../src/activities/relay.ts';
import { joinCodeDiff, serializeJson, splitCodeDiff } from '../src/formats.ts';
import type { StepSpec } from '../src/types.ts';
import { benchRun, putWork, storyboard, voiceBench, VoiceQuestion, voiceStep, type VoiceBench } from './helpers/voice-activity.ts';

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench();
});
afterEach(() => b.close());

const json = async (id: string) => JSON.parse(await b.store.artifacts.getText(id)) as Record<string, unknown>;
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
    const out = await modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact, critique: '- Cut shot 2.', ...(voice !== undefined ? { voice } : {}) }, refs: [] });
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
    const out = await relayLink(b.deps, { run, call: { key: `${run.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' }, step: relay, ports: { artifact, voice: script }, shot: 1 });
    const stored = await json(out.artifactId!);
    expect(stored.voiceover).toBe(script);
    expect(((stored.storyboard as { clipArtifactId?: string }[])[0]!.clipArtifactId)).toBeDefined();
    const notes = (await b.store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
    expect(notes).toEqual([undefined]);
  });
});
