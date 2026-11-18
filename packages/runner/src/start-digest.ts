/**
 * What a run's claim checks (backlog row B-188, activities/claim.ts): a digest of the run's whole workflow input, kept
 * with its record when Runner.start makes it. The input sits in Temporal's history for any program on the computer to
 * read, so what binds the claim to this start is not a secret but the input itself: a workflow started for the run with
 * any other recipe, profile, budget, routes or inputs has another digest, and stops at its first step.
 */
import { createHash } from 'node:crypto';
import type { RunInput } from './types.ts';

/** Keys in a fixed order, after JSON's own reading (undefined dropped), so Runner.start and the step digest one value. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v !== null && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
      : v;

export const startDigest = (input: RunInput): string =>
  `sha256:${createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(input)))), 'utf8').digest('hex')}`;
