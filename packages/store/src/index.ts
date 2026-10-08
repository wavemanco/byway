/**
 * @byway/store: product persistence (spec §2 "Data", ADR-0066). Implements `Store` and `ArtifactStore` from
 * @byway/contracts with node:sqlite records and content-addressed artifact files in the product data directory.
 */
export { createStore, SqliteStore, DB_FILENAME, DEFAULT_WORKSPACE_BUDGET_USD, DEFAULT_WORKSPACE_NAME, type StoreOptions } from './store.ts';
export { FileArtifactStore, artifactPath } from './artifacts.ts';
export { assertSafeDataDir, defaultDataDir, resolveDataDir, unsafeLocationReason, type DataDirOptions, type Env, type UnsafeLocation } from './datadir.ts';
export { DEFAULT_BUSY_TIMEOUT_MS, openDatabase, writeTransaction, type OpenDatabaseOptions } from './db.ts';
export { ArtifactCorruptError, CheckpointResolvedError, StoreError, UnsafeDataDirError, type StoreErrorCode } from './errors.ts';
export { MIGRATIONS, SCHEMA_VERSION, migrate, type Migration } from './migrations.ts';
export { checkResolution, type ResolutionCheck } from './resolution.ts';
export { CHECKPOINT_KINDS, MAX_EVENT_DATA_BYTES, RUN_EVENT_TYPES, RUN_STATUSES } from './validate.ts';
