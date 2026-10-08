# ADR-0078: Runs started by an older engine version end plainly when the engine changes

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), after the Phase 4 review; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 23:00 |
| **Track** | System |

## Context

Run histories persist in the local Temporal database. Any change to the workflow code then breaks the replay of runs that are waiting for a person. Their answers fail after a timeout, and Cancel reports success but does nothing (ENG-11, RUN-1). Keeping old workflow bundles and one worker per bundle would preserve such runs, but it is heavy for a local tool.

## Decision

- Each run records the hash of the workflow bundle that started it.
- When the worker starts, open runs started under another hash are terminated and marked failed with: "This run was started by an older version of byway and cannot continue. Start it again." Their questions are withdrawn.
- Deliberate in-place interpreter changes may use Temporal's `patched()`, so open runs keep working.

## Alternatives considered

- **One worker per historical bundle** — preserves runs, at the cost of storing bundles and running extra workers.

## Consequences

**Positive**

- No run hangs silently after an update, and the user is told what happened.

**Negative**

- Updating byway ends the runs that are waiting for a person; they have to be started again.

## Evidence

- Phase 4 review findings ENG-11 and RUN-1 (verified 2026-10-07).
