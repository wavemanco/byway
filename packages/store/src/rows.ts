/**
 * SQLite rows to contract records. Optional fields stored as NULL are left out of the record (not set to undefined),
 * so a record read back is structurally identical to the one the caller would write by hand.
 */
import type { SQLOutputValue } from 'node:sqlite';
import type {
  ArtifactRecord,
  CheckpointKind,
  CheckpointOption,
  CheckpointRecord,
  CheckpointResolution,
  Medium,
  RunEvent,
  RunEventType,
  RunRecord,
  RunStatus,
  Workspace,
} from '@byway/contracts';

export type Row = Record<string, SQLOutputValue>;
/** A column value; undefined only if a query stopped selecting a column the mapper reads. */
type Cell = SQLOutputValue | undefined;

// The schema guarantees these types; checking them anyway turns a query/mapper mismatch into a clear error.
function str(v: Cell): string {
  if (typeof v !== 'string') throw new TypeError(`expected a text column, got ${v === null ? 'NULL' : typeof v}`);
  return v;
}
function num(v: Cell): number {
  if (typeof v !== 'number' && typeof v !== 'bigint') throw new TypeError(`expected a numeric column, got ${v === null ? 'NULL' : typeof v}`);
  return Number(v);
}
const json = <T>(v: Cell): T => JSON.parse(str(v)) as T;

/** `{ [key]: f(v) }` when the column is not NULL, else `{}`: for spreading optional fields. */
function opt<K extends string, T>(key: K, v: Cell, f: (v: Cell) => T): { [P in K]?: T } {
  return v === null || v === undefined ? {} : ({ [key]: f(v) } as { [P in K]?: T });
}

export function toWorkspace(r: Row): Workspace {
  return { id: str(r.id), name: str(r.name), budgetUsd: num(r.budget_usd), createdAt: str(r.created_at) };
}

export function toRun(r: Row): RunRecord {
  return {
    id: str(r.id),
    workspaceId: str(r.workspace_id),
    recipeId: str(r.recipe_id),
    recipeHash: str(r.recipe_hash),
    profileId: str(r.profile_id),
    ...opt('intakeId', r.intake_id, str),
    title: str(r.title),
    problem: str(r.problem),
    medium: str(r.medium) as Medium,
    status: str(r.status) as RunStatus,
    budgetUsd: num(r.budget_usd),
    ...opt('outputArtifactId', r.output_artifact_id, str),
    ...opt('error', r.error, str),
    costUsd: num(r.cost_usd),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function toEvent(r: Row): RunEvent {
  return {
    runId: str(r.run_id),
    seq: num(r.seq),
    at: str(r.at),
    type: str(r.type) as RunEventType,
    ...opt('stepId', r.step_id, str),
    ...opt('candidate', r.candidate, num),
    data: json<Record<string, unknown>>(r.data),
  };
}

export function toCheckpoint(r: Row): CheckpointRecord {
  return {
    id: str(r.id),
    runId: str(r.run_id),
    stepId: str(r.step_id),
    ...opt('candidate', r.candidate, num),
    kind: str(r.kind) as CheckpointKind,
    prompt: str(r.prompt),
    ...opt('options', r.options, json<CheckpointOption[]>),
    ...opt('k', r.k, num),
    ...opt('initialText', r.initial_text, str),
    ...opt('artifactIds', r.artifact_ids, json<string[]>),
    status: str(r.status) as CheckpointRecord['status'],
    openedAt: str(r.opened_at),
    ...opt('resolvedAt', r.resolved_at, str),
    ...opt('resolution', r.resolution, json<CheckpointResolution>),
  };
}

export function toArtifact(r: Row): ArtifactRecord {
  return { id: str(r.id), mediaType: str(r.media_type), bytes: num(r.bytes), createdAt: str(r.created_at) };
}
