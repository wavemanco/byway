# Block 2's check and re-checks: the probes they kept

The probes, mutation scripts and logs that block 2's adversarial check (fix/fx-block2 at 160c027) and the re-checks of its two fix rounds (160c027..da1cd21 and da1cd21..52237d3) ran, which their findings cite. The findings, votes and notes themselves are in [reports/block2-check-2026-10-23.md](../../reports/block2-check-2026-10-23.md) and [reports/block2-rechecks-2026-10-23.md](../../reports/block2-rechecks-2026-10-23.md). Brought in by Claude on 2026-10-28 from the session's scratchpad (backlog row B-086), byte for byte but for one change: in 15 probes, the stand-in keys they hand the gateway (made-up strings shaped like a fal, OpenAI or Google key, none a real key) are replaced with the gateway redactor's `[redacted]`, so the evidence check finds no key-shaped string (`scripts/test/adr-evidence.test.ts`). [copied.tsv](copied.tsv) gives each file's size and SHA-256 as the scratchpad held it, before that change, and where in the scratchpad it was. Each was scanned first for the owner's address, the organisation's details and any email address: no hits (the only address-shaped strings are protobuf type URLs in test logs).

The check's clones were deleted on 2026-10-23 (about 14:52 to 14:55 local); the probes inside them had been copied out first (14:44), and those copies are what is here under each clone's name. A probe imports the code it checked by a path inside its clone, as it stood then: it records what was run, and does not run today.

| Folder | Whose | What it holds |
|---|---|---|
| `check/lens-money/` | the money lens | MONEY-1's probe of an image whose wait ran out (`probe-money-waited-image.test.ts`), and MONEY-2's and MONEY-3's of a resumed clip (`probe-money-resume-done.test.ts`, `probe-money-takeover.test.ts`) |
| `check/refute-MONEY-1-0/`, `check/refute-MONEY-1-1/` | MONEY-1's refuters | each refuter's probe on the real gateway and memo path |
| `check/refute-MONEY-2-0/`, `check/refute-MONEY-2-1/` | MONEY-2's refuters | their probes of the resumed clip |
| `check/lens-workflow/` | the workflow lens | WORKFLOW-1's probe of a VOICE asked again after the final check's retry |
| `check/refute-WORKFLOW-1-0/`, `check/refute-WORKFLOW-1-1/` | WORKFLOW-1's refuters | their probes of the lock and the retry |
| `check/lens-store/` | the store lens | STORE-1's probe of the browser suite's seeded runs (`zz-probe-e2e-seed.test.ts`), and its own probes of the settle race, a downgrade and the migrations, which its account in the report describes |
| `check/refute-STORE-1-0/`, `check/refute-STORE-1-1/` | STORE-1's refuters | their browser-suite runs with and without the mutation, the server logs of those runs, and the second refuter's script and poll log |
| `check/refute-WEB-1-0/`, `check/refute-WEB-2-1/` | WEB-1's and WEB-2's refuters | the first's patch script, probe and output; the second's race script |
| `check/refute-PRICES-1-0/`, `check/rP11/` | PRICES-1's refuters | the first's fixed price report; the second's scale test, run in a second clone with a short name (rP11) so that vitest would start |
| `check/refute-PRICES-4-1/` | PRICES-4's second refuter | its probes of the price report against its saved copy of Google's pricing page (the copy is left out, below) |
| `check/lens-tests/` | the tests lens | its probes (TESTS-1 and TESTS-2), its mutation scripts and their logs, and in `out/` its runs of each package's tests and the typecheck |
| `check/refute-TESTS-1-0/`, `check/refute-TESTS-1-1/` | TESTS-1's refuters | their probes (the first refuter also ran the lens's `zz-lens-probe3.test.ts`, which is in `check/lens-tests/`) |
| `check/refute-TESTS-2-0/`, `check/refute-TESTS-2-1/` | TESTS-2's refuters | the first's probe, mutation script and full run; the second's mutation runs on the image and video paths |
| `check/critic/` | the completeness critic | CRITIC-1's probe of a waited error (`critic-probe-waited.test.ts.txt`), its counts of the waits, and its price report's output |
| `recheck/R-MONEY/` | the first re-check's money lens | kept beside its clone: R-MONEY-1's probe of a stopped clip's result look (`zz-rmoney-probe.test.ts`), MONEY-1's refuter case run again on the fix (`zz-rmoney-refute-money-1.test.ts`), and its probes of spend books written at schema versions 8 to 11 (`zz-rmoney-v*.test.ts`) |
| `recheck/refute-R-MONEY-1/` | R-MONEY-1's refuter | its probe (the same file was in its two clones, refute-R-MONEY-1-0 and rfm1-0) |
| `recheck2/R2-MONEY/` | the second re-check's money lens | its probe (`zz-r2m-probe.test.ts`, the same as the one in its clone b2rc2/mp), its mutation script and lists (`mut.py`, `muts*.json`), each mutation's log (R1b to R3e, among them R1b and R2g, which the backlog row "Block 2's second re-check: two code notes for the follow-up branch" cites) and the runs' summaries |

Left out, each on purpose:

- the clones' install logs, the compile and transform caches, and the copies of byway's own files the agents kept to restore after a mutation (`*.orig.ts`, the backlog copies, and the store lens's `main-src/`, which is main's `packages/store/src` at a938066 as git holds it);
- the engine data folders two lenses ran against (`lens-web-data/`, `refute-WEB-2-1-data/`: SQLite stores and a ledger of seeded runs), and the dev servers' logs, which no finding cites;
- the provider page one refuter saved (`refute-PRICES-4-1-pages/`), as for [price-pages/](../../price-pages/): the providers' pages, whose terms were not checked;
- the first re-check's records lens and the second's kept no probe outside their clones: their findings rest on the records themselves, which git holds.
