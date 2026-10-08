/**
 * The typed boundaries around the person's copy (ENG-6, ADR-0081), with faults forced inside the runner's own copy
 * code (copy.ts is wrapped so a test can make one of its functions throw):
 * - a fault in VOICE's pure code is a question asked again, never a failed or retried step;
 * - a fault in a keepsVoice check is a plain, final step failure, so a paid call is never repeated;
 * - a fault reading the copy to offer is a plain, final step failure (no paid call is involved).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { AnswerRejected, StepError, toFailure } from '../src/activities/failures.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { serializeJson } from '../src/formats.ts';
import { FAILURE, type StepSpec } from '../src/types.ts';
import { benchRun, putWork, storyboard, voiceBench, VoiceQuestion, type VoiceBench } from './helpers/voice-activity.ts';

/** Which copy.ts function throws, if any. */
const fault = vi.hoisted(() => ({ in: undefined as string | undefined, problem: undefined as string | undefined }));

vi.mock('../src/copy.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/copy.ts')>();
  const boom = (name: string) => {
    if (fault.in === name) throw new Error(`forced fault in ${name}`);
  };
  return {
    ...real,
    applyCopy: (...a: Parameters<typeof real.applyCopy>) => (boom('applyCopy'), real.applyCopy(...a)),
    extractCopy: (...a: Parameters<typeof real.extractCopy>) => (boom('extractCopy'), real.extractCopy(...a)),
    readPageEdit: (...a: Parameters<typeof real.readPageEdit>) => (boom('readPageEdit'), real.readPageEdit(...a)),
    pageVoiceSuffix: (...a: Parameters<typeof real.pageVoiceSuffix>) => (boom('pageVoiceSuffix'), real.pageVoiceSuffix(...a)),
    roundTripProblem: (...a: Parameters<typeof real.roundTripProblem>) => fault.problem ?? real.roundTripProblem(...a),
    lockCopy: (...a: Parameters<typeof real.lockCopy>) => {
      boom('lockCopy');
      const check = real.lockCopy(...a);
      return (after: string) => (boom('lockCheck'), check(after));
    },
  };
});

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench();
});
afterEach(() => {
  fault.in = undefined;
  fault.problem = undefined;
  b.close();
});

const OPTIONS = serializeJson({ options: [{ title: 'Bread club', pitch: 'Fresh bread at seven.', rationale: 'Mornings matter.' }] });

describe('VOICE: a fault in the pure copy code is asked again (ENG-6)', () => {
  it('names the fault and quotes how the changed lines were first offered; no model, nothing stored', async () => {
    const q = await VoiceQuestion.open(b, await benchRun(b, 'options'), await putWork(b, 'options', OPTIONS));
    fault.in = 'applyCopy';
    const err = await q.answer(q.offered!.replace('Pitch: Fresh bread at seven.', 'Pitch: Fresh bread at six.')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnswerRejected);
    expect((err as Error).message).toMatch(/^byway could not place this edit \(forced fault in applyCopy\)\. Change those lines again, or leave them as they were offered\. As first offered, line 3 read "Pitch: Fresh bread at seven\."\.$/);
    // The workflow reads it as a rejected answer: asked again, never retried, never a failed step.
    const failure = toFailure(err) as ApplicationFailure;
    expect(failure.type).toBe(FAILURE.rejected);
    expect(failure.nonRetryable).toBe(true);
    expect(b.gateway.requests).toEqual([]);
    expect((await b.store.events(q.run.runId)).filter((e) => e.type === 'artifact')).toEqual([]);
  });

  it('sending the offered copy back always succeeds', async () => {
    const q = await VoiceQuestion.open(b, await benchRun(b, 'options'), await putWork(b, 'options', OPTIONS));
    fault.in = 'applyCopy';
    expect((await q.answer(q.offered!)).artifactId).toBeUndefined();
  });

  it('the round trip is checked before an unchanged-bytes write is skipped', async () => {
    const run = await benchRun(b, 'prose');
    const work = await putWork(b, 'prose', '# Memo\n\nMine.\n');
    const q = await VoiceQuestion.open(b, run, work);
    q.offered = undefined; // a finish with no first offer to compare against: only the write itself can be skipped
    fault.problem = 'byway could not write your words back exactly as you wrote them.';
    await expect(q.answer('# Memo\n\nMine.')).rejects.toThrow(AnswerRejected);
    fault.problem = undefined;
    expect((await q.answer('# Memo\n\nMine.')).artifactId).toBeUndefined();
  });

  it('a fault reading the copy to offer is a plain, final step failure', async () => {
    fault.in = 'extractCopy';
    const err = await VoiceQuestion.open(b, await benchRun(b, 'options'), await putWork(b, 'options', OPTIONS)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('byway could not read the copy of this work (forced fault in extractCopy).');
    expect((toFailure(err) as ApplicationFailure).nonRetryable).toBe(true);
  });
});

describe('keepsVoice: a fault in the check never repeats a paid call', () => {
  const fixSpec: StepSpec = { id: 'apply-cut', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const before = storyboard({ voiceover: 'Mine.', storyboard: [{ shot: 1, caption: 'a' }] });
  const fix = async () => {
    const run = await benchRun(b, 'media');
    const artifact = await putWork(b, 'media', before);
    b.gateway.complete = async (req) => {
      b.gateway.requests.push(req);
      return { text: '```json\n' + before + '\n```', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: 'l1' };
    };
    return modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact, voice: 'Mine.' }, refs: [] }).catch((e: unknown) => e);
  };

  it('a fault after the model answered: exactly one call, then a final step failure', async () => {
    fault.in = 'lockCheck';
    const err = await fix();
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('byway could not check this write against your words (forced fault in lockCheck).');
    expect((toFailure(err) as ApplicationFailure).nonRetryable).toBe(true);
    expect(b.gateway.requests).toHaveLength(1);
  });

  it('a fault locking the deck: no call at all', async () => {
    fault.in = 'lockCopy';
    expect(await fix()).toBeInstanceOf(StepError);
    expect(b.gateway.requests).toHaveLength(0);
  });
});

describe('VOICE on a page: the same boundaries', () => {
  const PAGE = '<!doctype html><html><head><title>T</title></head><body><h1>Head</h1><p>Sub</p></body></html>\n';

  it('a fault in the pure page code is asked again, quoting the offered lines that changed', async () => {
    const q = await VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', PAGE));
    fault.in = 'readPageEdit';
    const err = await q.answer('T\nNew head\nSub').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnswerRejected);
    expect((err as Error).message).toBe('byway could not place this edit (forced fault in readPageEdit). Change those lines again, or leave them as they were offered. As first offered, line 2 read "Head".');
    expect(b.gateway.requests).toEqual([]);
    // The offered copy sent back still succeeds.
    expect((await q.answer(q.offered!)).artifactId).toBeUndefined();
  });

  it('a fault reading the page to ask about it is a plain, final step failure', async () => {
    fault.in = 'pageVoiceSuffix';
    const err = await VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', PAGE)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe('byway could not read the copy of this work (forced fault in pageVoiceSuffix).');
  });
});
