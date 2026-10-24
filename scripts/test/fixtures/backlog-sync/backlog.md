# Backlog

A fixture in the backlog format of 2026-10-23, for scripts/test/backlog-format.test.ts and scripts/test/route-map.test.ts. Its rows are made up from real ones, shortened.

## Plan to all clear

This section is the working memory of whichever agent runs the session. Nothing here repeats a row.

**Steps, in order**

1. **Records after block 2**: B-004 (now closed).
2. **The follow-up branch**: B-001 and F01 (a).
3. **The first live runs**, with the owner: B-003.
4. **Study 1's arms, when the research track resumes**: B-BoN (a) and H1c (a).

## Launch checklist (real runs with real keys)

Before each run of a new kind, the agent running the session goes through that group with the owner.

### Before the first live run

- [x] **Owner with the agent.** Merge block 2 to main before any run with real keys. *Settles:* B-004.
- [ ] **Agent.** Redact an adapter error's cause and stack before Temporal stores them.
  *Settles:* B-001, F03 (a).
- [ ] **Owner.** Protect the keys: a spending limit in each provider's console. *Settles:* PB-02.

### The first live run (C4 on Balanced)

- [ ] **Owner.** Run C4 on Balanced first. *Settles:* B-003, B-005.

## Review checklist (the external review of 2026-10-08)

Every item of the external review that the trace left open, each with the row that carries it.

### Findings (F01 to F20)

- [x] **F01** The output ports of audit, a one-shot gate and each were defined twice. *Closed:* 9d403f8.
- [ ] **F01** Runner.start and the workflow do not check the product rules. *Row:* F01 (a). *When:* before composed recipes are offered to anyone besides the owner.
- [ ] **F03** When a call's holder dies between settlement and its memo save, the next attempt buys the call again. *Row:* F03 (a). *When:* a live run's ledger shows it.

### Recommendations (X- and SUB- items)

- [ ] **X-VAL-4** The review ran no static security scan, fuzzing or power-loss campaign. *Rows:* X-VAL-4 (a), B-002.

## Product follow-ups (found while building v1)

Found while building v1; each row says when it is picked up.

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B-001 | An adapter error's cause reaches the engine's history unredacted | open | high | first-live-use | agent | yes | M | fix | milestone | Before the first live run (Launch checklist). | — | **Why:** Temporal stores an activity error's `cause` and stack; a key in a cause would be kept (a \| b). | packages/runner/src/activities.ts | 2026-10-22 |
| F01 (a) | Runner.start and the workflow do not check the product rules (F01) | open | high | others-use | agent | small choice: refuse such a recipe at Runner.start, or only log it | M | fix | milestone | Before composed recipes are offered to anyone besides the owner. | — | **Why:** a recipe that reached Runner.start another way would run without them. | packages/runner/src/runner.ts | 2026-10-18 |
| F03 (a) | A counted re-buy when a call's holder dies between settlement and its memo save | open | medium | first-live-use, others-use | agent | no: a live run's ledger that shows it | M | fix | event | A live run's ledger shows a counted re-buy. | — | **Why:** both buys are counted; see [ADR-0099](adr/0099-waits.md). | packages/gateway/src/spend.ts | 2026-10-18 |
| B-002 | Dependency advisories and a static security scan | open | medium | others-use | agent | small choice: whether the weekly run only reports an advisory or also fails on it | S | build | milestone | Before anyone besides the owner uses byway with real keys. | — | **Why:** pnpm audit reads only GitHub's global advisory database. | .github/workflows/verify.yml | 2026-10-21 |
| B-003 | First live run with real keys and real money | partly | high | first-live-use | owner | no: the owner's keys and spending limits | M | outside-action | other-row | The owner's steps before the first live run are done. | PB-02 | **Why:** only a real run settles what the fakes cannot. | — | before 2026-10-07 |
| B-005 | The ledger against the providers' dashboards after the first runs | open | high | first-live-use | both | no: the first live run's ledger | M | measure | event | After each live run. | B-003 | **Why:** prices.ts is copied by hand; a cell may hold </script><script>alert(1)</script>, $& and $1, and naïve “quotes”. | — | 2026-10-22 |

## Ways to run byway (owner direction, 2026-10-17)

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B-006 | Run byway inside coding agents, on the person's own subscription | open | low | agent-layer | owner | no: a design brief and an ADR the owner schedules | XL | research-decision | event | After the first live run (ADR-0064). | B-003 | **Why:** people then use byway where they already work. **Where:** a new package. | — | 2026-10-17 |

## Study 1 protocol v1.2 edits (found while building the engine)

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ST9 (a) | ST9's threshold in §5.6 should name the judge tier | open | low | study1-stage0 | agent | no: the research track resumes | S | docs | event | When the research track resumes (ADR-0108). | — | **Why:** the engine relaxes it, clause-scoped. | docs/study1/protocol-v1.1-draft.md | before 2026-10-07 |
| B-BoN (a) | Compute-matched best-of-N arm (B-BoN) | open | low | pilot | agent | no: the research track resumes | M | build | event | When the research track resumes (ADR-0108). | — | **Why:** the arm sets byway against best-of-N at matched compute. | docs/study1/protocol-v1.1-draft.md | before 2026-10-07 |
| H1c (a) | H1c test + positive control | open | medium | confirmatory | agent | no: the pilot's data | M | test | other-row | Once the Integrity Monitor is contracted (PB-01). | PB-01 | **Why:** the test is read against a positive control. | — | 2026-10-12 |

## Deferred decisions (non-code)

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 (a) | D1 Baseline set | open | medium | study1-stage0 | owner | no: the research track resumes | S | owner-decision | milestone | Before Stage 0. | — | **Default until decided:** B-Skill + B-Outside + B-BoN, gated behind H1a. **Deadline:** Before Stage 0 | — | before 2026-10-07 |
| X-VAL-4 (a) | The review ran no fuzzing or power-loss campaign | open | low | distribution | agent | no: a distribution plan | L | test | milestone | Before any distribution. | B-002 | **Why:** the review named them as not run. | — | 2026-10-18 |
| B-007 | Templates for the Study 1 research arms' prompt ids | open | low | none | agent | yes | S | build | now | Whenever an agent picks it up. | — | **Why:** a product run of one would fail with unknown-template. | packages/prompts | 2026-10-07 |

## Done since the route map of 2026-10-18

The entries the route map of 2026-10-18 listed as open, and the rows closed since.

| Item (as the route map named it) | Where it landed | Its row |
|---|---|---|
| B-004 Merge block 2 to main | 65825f4 | Closed |
| Cancel stops calls already in flight | 333728a, c1fc822 (ADR-0111) | Closed |
| Gateway mock's fenced-block reader | 246a3e2, 87806a4 | Closed |
