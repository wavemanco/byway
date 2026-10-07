# Backlog

Items deliberately parked so the work can stay on code ([ADR-0062](adr/0062-code-first-work-mode.md)). People and outside actions are in the [playbook](playbook.md).

## Pricing (parked 2026-10-07)

All figures are estimates from the Study 1 design pass ([protocol v1.1 §13](study1/protocol-v1.1-draft.md)); none is a quote.

| Item | Estimate | Notes |
|---|---|---|
| **Study 1 core** at 72 briefs (pre-pilot, pilot, generation, lay and expert rating, Monitor, copywriter, red team, legal, compute, hosting) | ~$100k central (range ~$66–141k) | Up from the earlier ~$24k because generation was re-priced (the critic and finishing steps and the growing context were under-priced), rater sessions are 30 minutes, and the Monitor, copywriter, red team, legal, compute and hosting lines were added. |
| Cost probe on public engineering briefs | ~$1.4k | Once the registry entry and spend gate exist. Replaces the token assumptions. |
| Pilot (all arms, 12 sealed development briefs, ~1,500 lay judgments) | ~$5.5k | Only after the Monitor is contracted. |
| Integrity Monitor | ~$10–20k (80–150 hours) | Fixed fee. |
| Red team | ~$1–3k per round, two rounds | |
| Charter add-ons overall | ~$5–15k | |
| Compute-matched best-of-N arm (B-BoN) | ~$6k | Part of the recommended baseline set (D1). |
| Frontend-design skill arm (B-Skill) | ~$3k | Part of the recommended baseline set (D1). |
| Outside baseline (B-Outside) | ~$2.6k + coordination | Required by CR5 in some form. |
| H1c test + positive control | ~$1.7k | Accepted (ADR-0061). |
| Regeneration reserve | ~$15–20k, contingent | Only if Stage 1 reviewers change the generation protocol after escrowed generation. |
| Lean variant (60 briefs) | saves ~$8–9k | Not chosen: 72 briefs accepted (ADR-0061). |
| GPT-5.6 Sol worker arm | ~$2–2.5k | Deferred to Paper 2 (ADR-0061). |
| Study 1b (C1-HITL, 8 operators) | ~$13–17k | Decoupled Registered Report (ADR-0061). |
| Quotes still needed | — | Monitor, copywriter, red team, legal, IRB, recruiting vendor, CODECHECK. |
| **Set the Study 1 spending ceiling** | — | After the cost probe and the quotes (D13). |

## Deferred decisions (non-code)

| Decision | Default until decided | Deadline |
|---|---|---|
| D1 Baseline set | Recommended: B-Skill + B-Outside + B-BoN, gated behind H1a. The harness supports every arm either way. | Before Stage 0 |
| D4 Registered Report venue | PLOS ONE if it accepts sealed pre-acceptance generation; otherwise RSOS; stop if neither does | October 2026 |
| D7 Monitor, deputy, guarantor | Three different people | Before any pilot spend |
| D8 Ethics route and rater population | Academic co-investigator's IRB; US and UK raters; disclose AI-generated pages; corporate Prolific account unless an institution pays | Before any rating |
| D9 Funding, patents, legal entity | — | Before Stage 0 |
| D10 Ratifications and charter interpretations | — | Before Stage 0 |
| D13 Spending ceiling | — | After the cost probe and quotes |
| D24 Product consequences ("Worse" rows) | Draft table in protocol v1.1 | Before Stage 1 |
