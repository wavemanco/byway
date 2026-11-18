/**
 * A checkpoint's answer, signed by byway's app (backlog row B-188). Temporal's port answers any program on the
 * computer, which could send a run the update that answers its checkpoint, and an answer can move money: the "use
 * more of the budget?" question is a checkpoint. So the app signs each answer it sends with this start's key (the
 * per-start secret, which `pnpm start` hands to the app and to the worker and keeps off disk and out of Temporal), and
 * the worker records an answer only with a valid signature. The signature covers the run, the checkpoint and what the
 * answer says, so it cannot be moved to another checkpoint or another answer; once its checkpoint is answered, a copy
 * read from Temporal's history answers nothing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckpointResolution } from '@byway/contracts';

/** What a signature covers, in a fixed order. */
const covered = (runId: string, r: CheckpointResolution): string => JSON.stringify([runId, r.checkpointId, r.choice ?? null, r.text ?? null, r.approved ?? null]);

export function signAnswer(key: string, runId: string, resolution: CheckpointResolution): string {
  return createHmac('sha256', key).update(covered(runId, resolution), 'utf8').digest('base64url');
}

/** True when the answer carries this start's signature for this run and checkpoint and what it says. */
export function answerSigned(key: string, runId: string, resolution: CheckpointResolution): boolean {
  if (typeof resolution.signature !== 'string') return false;
  const want = Buffer.from(signAnswer(key, runId, resolution), 'utf8');
  const got = Buffer.from(resolution.signature, 'utf8');
  return want.length === got.length && timingSafeEqual(want, got);
}
