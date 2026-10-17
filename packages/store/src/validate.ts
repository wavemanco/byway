/**
 * Input checks at the store boundary. The contracts are TypeScript types, which vanish at runtime; the web app and the
 * runner's activities hand the store data that crossed JSON and process boundaries, so the store checks what it writes.
 */
import { MEDIA, type CheckpointKind, type Medium, type RunEventType, type RunStatus } from '@byway/contracts';
import { StoreError } from './errors.ts';

/** True when the list `L` names every member of the union `T`. */
type Covers<T, L extends readonly T[]> = [Exclude<T, L[number]>] extends [never] ? true : false;

export const RUN_STATUSES = ['queued', 'running', 'waiting', 'paused', 'done', 'failed', 'cancelled'] as const satisfies readonly RunStatus[];

export const RUN_EVENT_TYPES = [
  'run-started',
  'step-started',
  'step-finished',
  'step-failed',
  'checkpoint-opened',
  'checkpoint-resolved',
  'artifact',
  'loop-iteration',
  'cost',
  'run-finished',
  'run-failed',
  'run-cancelled',
  'run-paused',
  'run-resumed',
  'model-declined',
] as const satisfies readonly RunEventType[];

export const CHECKPOINT_KINDS = ['pick', 'select', 'react', 'confirm', 'compare', 'directive', 'write', 'choose'] as const satisfies readonly CheckpointKind[];

// A member added to a contract union but not listed above fails the typecheck here instead of being refused at runtime.
true satisfies Covers<RunStatus, typeof RUN_STATUSES>;
true satisfies Covers<RunEventType, typeof RUN_EVENT_TYPES>;
true satisfies Covers<CheckpointKind, typeof CHECKPOINT_KINDS>;

/** "Small JSON payload; large content goes to artifacts" (RunEvent.data): the store enforces the "small". */
export const MAX_EVENT_DATA_BYTES = 64 * 1024;

/** A memo value is a reference (an artifact id, a small JSON summary), never the content it refers to. */
export const MAX_MEMO_VALUE_BYTES = 64 * 1024;

/** A memo value: a string, small enough that it is plainly a reference and not content (Store.setMemo). */
export function memoValue(value: unknown): string {
  const v = text('memo value', value);
  const size = Buffer.byteLength(v, 'utf8');
  if (size > MAX_MEMO_VALUE_BYTES) {
    throw invalid(`a memo value is ${size} bytes, over the ${MAX_MEMO_VALUE_BYTES}-byte limit; store the content as an artifact and memo its id`);
  }
  return v;
}

export function invalid(message: string): StoreError {
  return new StoreError('invalid', message);
}

export function oneOf<T extends string>(what: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw invalid(`unknown ${what} ${JSON.stringify(value)}; expected one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function medium(value: unknown): Medium {
  return oneOf('medium', value, MEDIA);
}

export function nonEmpty(what: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`${what} must be a non-empty string`);
  return value;
}

export function text(what: string, value: unknown): string {
  if (typeof value !== 'string') throw invalid(`${what} must be a string`);
  return value;
}

export function usd(what: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid(`${what} must be a finite, non-negative number of USD, got ${String(value)}`);
  return value;
}

export function optionalIndex(what: string, value: unknown): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(`${what} must be a non-negative integer, got ${String(value)}`);
  return value as number;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** JSON text for an event payload: a plain object, serializable, and small. */
export function eventData(value: unknown): string {
  if (!isPlainObject(value)) throw invalid('event data must be a plain object');
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch (e) {
    throw new StoreError('invalid', `event data is not JSON-serializable: ${(e as Error).message}`, { cause: e });
  }
  const size = Buffer.byteLength(json, 'utf8');
  if (size > MAX_EVENT_DATA_BYTES) {
    throw invalid(`event data is ${size} bytes, over the ${MAX_EVENT_DATA_BYTES}-byte limit; store large content as an artifact and put its id in the event`);
  }
  return json;
}
