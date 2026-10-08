/**
 * "Examples you admire" on the Recommendation screen, kept per problem for this tab's session (ADR-0082, R1). A budget
 * refusal sends the person to Settings (view/history.ts budgetProblem); the screen unmounts on the way, and examples
 * kept only in its state were lost. Pasted text is kept as text; an image as the artifact it was already stored as.
 * Cleared when the run starts.
 */
import { MAX_REF_TEXT, MAX_REFS } from '../view/refs.ts';
import { sessionSlot, type SessionSlot, type StorageSource } from './sessionSlot.ts';

export type KeptExample = { kind: 'text'; text: string } | { kind: 'image'; name: string; artifactId: string };

const ARTIFACT_ID = /^sha256:[0-9a-f]{64}$/;

export function decodeExamples(raw: unknown): KeptExample[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_REFS) return null;
  const out: KeptExample[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const e = item as Record<string, unknown>;
    if (e.kind === 'text' && typeof e.text === 'string' && e.text.length <= MAX_REF_TEXT) out.push({ kind: 'text', text: e.text });
    else if (e.kind === 'image' && typeof e.name === 'string' && typeof e.artifactId === 'string' && ARTIFACT_ID.test(e.artifactId)) out.push({ kind: 'image', name: e.name, artifactId: e.artifactId });
    else return null;
  }
  return out;
}

export function examplesSlot(intakeId: string, source?: StorageSource): SessionSlot<KeptExample[]> {
  return sessionSlot(`byway.examples.${intakeId}`, decodeExamples, source);
}
