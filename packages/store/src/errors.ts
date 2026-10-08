import type { CheckpointRecord } from '@byway/contracts';

export type StoreErrorCode =
  /** The id names nothing (run, workspace, checkpoint, artifact, intake). */
  | 'not-found'
  /** A record with this id exists and differs from the one being created. */
  | 'already-exists'
  /** The checkpoint was resolved before; see {@link CheckpointResolvedError}. */
  | 'already-resolved'
  /** The checkpoint was withdrawn (its run was cancelled or failed); see {@link CheckpointWithdrawnError}. */
  | 'withdrawn'
  /** The input breaks the contract (bad enum value, malformed id, wrong resolution shape…). */
  | 'invalid'
  /** An artifact's bytes no longer match their content address, the file is gone, or a stored record no longer parses. */
  | 'corrupt'
  /** The data directory is inside OneDrive or a git working tree. */
  | 'unsafe-location'
  /** The database schema is newer than this build, or an applied migration was edited. */
  | 'schema'
  /** The store was closed. */
  | 'closed';

/**
 * Every failure the store raises on purpose. Callers branch on `code`, not on message text, so messages can stay
 * written for people (the runner surfaces them in the run timeline).
 */
export class StoreError extends Error {
  override name = 'StoreError';
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** Raised on read when an artifact's bytes do not hash to its id: never hand corrupted content to a step. */
export class ArtifactCorruptError extends StoreError {
  override name = 'ArtifactCorruptError';
  readonly artifactId: string;

  constructor(artifactId: string, message: string) {
    super('corrupt', message);
    this.artifactId = artifactId;
  }
}

/**
 * Raised when resolving a checkpoint that is already resolved. It carries the stored record so a retried caller (a
 * Temporal activity that ran twice) can tell its own earlier success from a genuine conflict.
 */
export class CheckpointResolvedError extends StoreError {
  override name = 'CheckpointResolvedError';
  readonly checkpoint: CheckpointRecord;

  constructor(checkpoint: CheckpointRecord) {
    super('already-resolved', `checkpoint "${checkpoint.id}" was already resolved at ${checkpoint.resolvedAt ?? 'an unknown time'}`);
    this.checkpoint = checkpoint;
  }
}

/**
 * Raised when answering a checkpoint that was withdrawn because its run was cancelled or failed. Deliberately not a
 * {@link CheckpointResolvedError}: a retried runner activity treats that one as its own earlier success, and an answer
 * to a withdrawn question is never a success (nobody will act on it). The UI shows "This question was withdrawn".
 */
export class CheckpointWithdrawnError extends StoreError {
  override name = 'CheckpointWithdrawnError';
  readonly checkpoint: CheckpointRecord;

  constructor(checkpoint: CheckpointRecord) {
    super('withdrawn', `checkpoint "${checkpoint.id}" was withdrawn because its run was cancelled or failed; it can no longer be answered`);
    this.checkpoint = checkpoint;
  }
}

/** Raised when the data directory would sit in a synced folder or a repository (ADR-0063, ADR-0066). */
export class UnsafeDataDirError extends StoreError {
  override name = 'UnsafeDataDirError';
  readonly path: string;
  readonly kind: 'onedrive' | 'git';

  constructor(path: string, kind: 'onedrive' | 'git', message: string) {
    super('unsafe-location', message);
    this.path = path;
    this.kind = kind;
  }
}
