# Implementation plan: the ponytail audit's findings

This plan is against main at 4d17899, dated 2026-10-24. The audit itself read e8e9322. Nothing is edited until you approve.

**Classes.** **P** means the finding is valid and the fix keeps behaviour as it is. **C** means it is valid but changes behaviour or a contract, so it needs your yes. Each bug's case was made to fail in a probe, and each candidate fix passed its suites in a probe copy.

**Baseline.** Every suite named below passed at e8e9322. There is one existing failure, recorded separately: under parallel load, runner files hit "Hook timed out in 10000ms" in beforeEach. They pass when run alone.

**Check** means the adversarial check with refuters (for money, keys and security, the engine, stored data). **Gate** means `pnpm verify` only.

## Batch 0: records (gate: `pnpm exec vitest run scripts/test`)

- Every finding becomes a backlog row with an ID, a trigger and its files. IDs start at B-135, or take a letter under F03 for #2 and #3.
- The rows name the triggers these fixes fire: B-038, B-044, B-045, B-107 and B-087.
- Step 3 gains batches A to E, and the Route Map is published again.

## Step 3 (report items 1 to 5): batches A to E

Each batch is its own commit. They share step 3's one check. Batch A changes the workflow hash, so the merge needs the read-only check that no run is queued, running, waiting or paused.

**A. Engine: a pause during a step that hits its budget.** #1 ENGINE-2 (P), ENGINE-3 (C), and RECIPES-9 (P), which rides here so the hash changes only once.
- Files: interpreter.ts, wording.ts, recipe limits.ts, and the pinned hash in build.test.ts.
- Your choice (ENGINE-3): should a gate with no retry ask "It did not pass the final check. Use it anyway?"
- Tests first, both failing today: a controls.ts case where Pause comes during a step that hits its budget, and a gate-mark case with no retry.
- Run before and after: controls, liveness, gate-mark, configurations, limits, build.
- Must not change: every other question still waits at a pause. Nothing starts after run-paused. The budget question's dedupe key and wording stay. C5 keeps GATE_FAILED_PROMPT.

**B. Spend book: Clear on a call that is being sent again.** #2 MONEY-1/DATA-1 (C), DATA-2 (P, same file), DATA-4 (P, tests only).
- Files: spend-book.ts, memory-book.ts, spend-book-suite.ts, and the comment in view/spending.ts. That comment edit fires B-038.
- Your choice, one of two:
  - (a) Hide the row while its call is in flight.
  - (b) Keep the row listed, and Clear does nothing until the call ends. This is smaller, and I recommend it. Optionally, its Clear button is hidden while the call is in flight.
- If you would rather this fix were written once, batch L can go first. That adds about 17 test files to step 3.
- Tests first:
  - A contract case: retain, then Clear, then abandon. It fails today because the cost is lost. Add variants that end the call with endLeases and with the lease running out.
  - The sweeps' row-set test.
  - The index-plan test, which fails today on a full SCAN.
  - A spy that confirms the FULL commits happen.
- Run: store, contracts, the gateway suite, web spending and api.
- Must not change: the exposure sums for other rows, the order and fields of records, Clear staying idempotent. No migration.

**C. Gateway: a cancelled attempt sends its call again.** #3 MONEY-2 (C), #15 MONEY-4 (P), MONEY-5 (P, from #20).
- Files: gateway.ts, the cancel comment in contracts, ledger.ts, index.ts, and a Later note in ADR-0111.
- Your choice (MONEY-2): once `cancel` fires, nothing is sent again. This widens the cancel contract.
- Tests first:
  - Cancelled attempts that then fail with ECONNRESET or with a 429, plus an image() version. All fail today with 2 sends.
  - A ledger line that is just `null`. It fails today with a TypeError.
- Run: the gateway suite, runner liveness and memo, ledger-faults, restore, backup.
- Must not change: the cut-off stays on `stop` alone. A call that was not cancelled keeps its one resend after a "maybe" failure. Ledger.append stays.

**D. Memo: an image bought twice.** #4 ENGINE-1 (P), together with B-045, whose trigger fires (B-044's fires too).
- Files: memo.ts.
- Tests first: try 1 fails unbilled, try 2 succeeds, then the step runs again. It fails today with 2 purchases. Also a store-backed check that the second try is admitted at once.
- Run: memo, overlap, asset-slots, declines.
- Must not change: the first write wins. PaidNotKept still stops the step. Critic shuffles keep separate keys.

**E. A Start sent again.** #5 WEB-1 (P), in the version that skips the check only when the budget is the same, not the report's version.
- Files: api.ts.
- Tests first: a resend after the run has spent $0.50, which fails today with a 400. A resend with a different budget is still refused.
- Run: api, start-identity, start-admission, run-identity.
- Must not change: the first Start's refusal text, the 409s, one run per id.

## After step 3, in order

Each batch runs the baseline suites named in its findings before and after the change.

| Batch | Findings | Files | Your choice | Check | Tests first | Must not change |
|---|---|---|---|---|---|---|
| F. Starting byway on Windows | #7 BUILD-1, #8 BUILD-2, #13 BUILD-3 (all P) | human.ts, serve.ts, extract-conversation.cjs | Add F to step 3, or run it right after? | yes (BUILD-3: gate) | errors matched by name across two store copies; port check before the build; a message with an image kept | the withdrawn-question error and its message; OPS-1's message |
| G. An answer with no usage | #16 MONEY-3 (C) | openai.ts, google.ts | Settle a delivered answer that has no usage at planning figures, marked assumed? Land before the first run on Best. | yes | three priced cases (fail today at $0) | answers that carry usage; the moderation block at $0 |
| H. C2's first step | #6 RECIPES-1 (C) | model-step.ts or estimate.ts, format.ts | (A) seed allowance of 8,000 tokens, or (B) budget covers the largest fan-out. Before the first C2 run. | yes | budget is at least the first fan-out's reservations, on every profile | reserving the whole allowance; C1's page seeds stay at 16,000 |
| I. Estimates | #10, #11, #17 (C), #12 (P), RECIPES-6, RECIPES-7 (C) | estimate.ts, its tests | Land after the first C4 and C3 runs? (#17 lowers the $2.50 the plan quotes for C3) | yes | the unit cases, then the end-to-end bound test on demo | configurations with explicit knobs keep their estimates |
| J. Artifacts and model errors | #14 WEB-4 (P), DATA-5 (P), #9 WEB-2 (C) | run-data.ts, artifacts.ts, model-errors.ts | WEB-2: an invalid-request error answers 400 now; wording for a 403 that cannot be retried later? | yes | damaged artifact skipped; temp file removed after ENOSPC; a 404 answers 400 | other store errors still throw; existing error mappings |
| K. Web, gate only | #18 WEB-3 (P), WEB-5 (C), WEB-8 (P) | text.ts, history.ts, schemas.ts | WEB-5: count days in local time, not UTC? | gate | clip.mp4; history tests with a pinned zone; limits pinned | the `txt` fallback, the time thresholds, the limit values |
| L. One spend book | #19 DATA-3 (C) | memory-book.ts, about 17 tests, manifests, ADR-0095 Later note | Delete the in-memory book? | quick | none; the whole gate on the SQLite book | gateway refuses to start without a book |
| M. Engine cleanup | ENGINE-4, -5, -6, -7, BUILD-6 (all P) | runner activities, types.ts, writes.ts, engine-runner.ts | none | yes | tests that pin the shared resolver and the memo scope; the engine-down error table | each guard's meaning; memo scope stays {runId, call.key} |
| N. Build cleanup, gate only | #20 WEB-7/BUILD-5, BUILD-4, BUILD-8, RECIPES-8, -11 (P), RECIPES-12/BUILD-7 (C) | http.ts, contracts store.ts, manifests, lockfile, cli, emitters | BUILD-7: raise the Node minimum to 24.2, or keep the helpers? | gate | typecheck; spawn the CLI through a junction | exit codes; one copy of zod 4.6.5 |

## Not taken

- **WEB-6, unsupported.** The two cross-site rules differ when Sec-Fetch-Site is empty, so merging them would loosen the dev guard. A tests-only check that ties the two rules together can ride in batch N.
- **RECIPES-10, unsupported.** prompt-shows.test.ts already ties the two role sets. If they drift, a composed step is refused at admission, before anything is paid.
- **Uncertain:** none.

## Verification

1. For each batch: write the failing test, watch it fail, fix, run the batch's suites, then `pnpm verify`.
2. Step 3:
   - one check over A to E (and F if you add it);
   - branch CI on both machines;
   - the merge, after the check that no run is open;
   - main's CI.
3. Later batches: their check, then branch CI, then the merge.

Count: 45 findings checked. 28 keep behaviour as it is, 15 need your approval, 2 are unsupported, none is uncertain. They go into 14 batches plus batch 0, and batches A to E join step 3.