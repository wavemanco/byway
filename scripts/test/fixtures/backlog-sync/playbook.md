# Playbook: people, roles and outside actions

A fixture in the backlog format of 2026-10-23, for scripts/test/backlog-format.test.ts and scripts/test/route-map.test.ts.

## 1. People and roles

Anyone below marked **independent** must sign an independence attestation.

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PB-01 | **Independent Integrity Monitor** | open | low | study1-stage0, pilot | owner | no: the research track resumes | M | outside-action | milestone | Contracted before the pilot. | — | **What they do:** holds every study key. **Independence:** independent; not an author. **Source:** ADR-0044 | — | before 2026-10-07 |

## 2. Outside actions

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PB-02 | **Protect the product's provider keys before the first live run** | open | high | first-live-use | owner | no: the owner's step in each provider's console | S | outside-action | milestone | Before the first live run. | — | **Why:** a key with no limit can spend without bound. **Deadline:** before the first live run | `.env.agents` | 2026-10-21 |
| D9 (a) | **Funding, patents and legal entity** (D9) | open | medium | study1-stage0, distribution | owner | small choice: whether any patent is filed | S | owner-decision | owner-decision | Before Stage 0. | — | **Why:** the first disclosure must be complete. | — | before 2026-10-07 |
| D24 (a) | **Fill in the product-consequences table** ("Worse" rows). | open | low | confirmatory | owner | no: the research track resumes | S | owner-decision | owner-decision | Before Stage 1. | — | **Why:** CR10 requires it in the Stage 1. **Decision:** D24 | — | before 2026-10-07 |

## 3. Milestones (realistic central timeline, estimates)

| ID | Item | Status | Priority | Milestone | Who | Land now | Size | Kind | Trigger type | Trigger | Waits on | Details | Files | Filed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PB-03 | Stage 0 public registration | open | low | study1-stage0 | owner | no: the research track resumes | XL | outside-action | date | ~2027-02-01. | PB-01, D1 (a) | **Target:** ~2027-02-01 | — | before 2026-10-07 |
