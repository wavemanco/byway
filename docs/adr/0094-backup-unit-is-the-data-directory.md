# ADR-0094: The backup unit is the whole data directory

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 16:30 |
| **Track** | System |
| **Related** | [ADR-0066](0066-product-persistence-sqlite-cas.md), [ADR-0030](0030-own-model-gateway-sole-egress.md), [ADR-0055](0055-instrument-firewall-and-exposure.md) |

## Context

[ADR-0066](0066-product-persistence-sqlite-cas.md) chose SQLite records and content-addressed artifact files in `BYWAY_DATA_DIR`, and listed "one file to back up" among its consequences. Nothing else described a backup or a restore. The 2026-10-08 external review asked for a defined backup unit and a tested recovery (release action 4, R4). Its verification confirmed this and found the one written statement wrong:

- The store runs SQLite in WAL mode (`packages/store/src/db.ts`). Commits sit in `byway.sqlite-wal` until SQLite folds them into the main file. With the store open, a copy of `byway.sqlite` alone had no tables (probe P3).
- The persisted set is more than one file. It holds `byway.sqlite` with its `-wal` and `-shm` files, `artifacts/`, `ledger.jsonl` and `ledger.jsonl.head`, the exposure register `exposure.jsonl` (CR12), the engine's `temporal.sqlite` and `bin/`, byway's copy of the Temporal CLI.
- These are written independently, so a partial restore mixes states, and each mix fails differently. A store ahead of the engine ends the missing runs plainly at the next start (OPS-1). A store behind the engine, an engine ahead of the store on the same run and missing artifact files are not reported. A missing or older ledger resets spend, so the caps admit spend again (probes P1 and P5). Making spend fail closed is review finding F03.

Accepted ADRs are not edited, so this record corrects ADR-0066.

## Decision

- **The backup unit is the whole data directory (corrects [ADR-0066](0066-product-persistence-sqlite-cas.md)'s "one file to back up").** A backup is a copy of every file and folder in `BYWAY_DATA_DIR`. It is taken after byway has stopped and after checking that its engine has stopped too: nothing listens on the Temporal port (`BYWAY_TEMPORAL_PORT`, default 7233) and no Temporal CLI process remains, because a server left over from an unclean stop can still be writing `temporal.sqlite`. `bin/` may be left out.
- **A restore replaces the whole directory,** with byway and its engine stopped. Mixing files from different backups is not supported, and the README names what each mix does.
- **The README states the spend caveat until F03 lands.** After an older backup is restored, spend since that backup is not counted against the caps. The README says so and points to the providers' own dashboards.
- **The procedure is tested.** `scripts/test/backup.test.ts` uses the real store, ledger and exposure register. It shows that a single-file copy taken while byway runs lacks committed data, and that a whole-directory copy taken after the store closes reopens with the same records, artifacts, spend and exposure. It also requires the README to name every file they write and to keep the caveat.

## Alternatives considered

- **Back up `byway.sqlite` and `artifacts/` only.** This loses commits still in the WAL, the spend ledger, the exposure register and the engine's run state.
- **Copy while byway runs.** The files are written independently, so a copy can mix moments. SQLite's own online backup would make the database consistent, but not the ledger, the artifacts and the engine with it.
- **An online backup command** (a database snapshot, a manifest, a ledger head kept outside the directory). This is more than a local single-user app needs now, and its accounting part overlaps F03.

## Consequences

**Positive**

- One documented unit, and a test that a copy taken that way comes back intact.
- The README now lists every file in the data directory.

**Negative**

- byway must be stopped for a backup.
- Partial restores are still detected only in part. The verification designs a read-only data-directory report at start and a two-way store and engine reconcile (cluster R, item 5); neither is part of this change.
- Until F03 lands, restoring an older ledger lets the caps admit spend again. The README says so.

## Evidence

- [External review verification (2026-10-08)](../reviews/2026-10-08-external-review-verification.md): finding R4, and cluster R's design (item 5, backup unit and restore).
- The external review, read-only at `C:\Users\arvik\code\byway_review\byway-review.md`: "Release and maintenance actions", item 4.
- `scripts/test/backup.test.ts`, and the README's "Back up and restore" section.
