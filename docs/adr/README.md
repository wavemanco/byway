# Architecture Decision Records

Every architectural decision behind the Off-Center protocol, its testing harness, the research program and the product track, recorded at the user's request on 2026-10-06 ([ADR-0001](0001-record-architecture-decisions-as-adrs.md)). Earlier decisions were back-filled from the conversation record, the protocol files and the research reports, then checked against those sources by separate AI verification passes. These passes ran on Claude, the same model family that drafted the records (and the same family as the studies' worker and critic), so they are not independent human review.

## How to read this log

- **Status:** *Accepted* decisions are in force; *Proposed* ones are recommendations awaiting the user's decision.
- **Decided by** says who made the call, honestly: **User** (the user directed it), **User-approved** (Claude recommended, the user explicitly chose it), **By continuation ⚑** (Claude proposed it in delivered work and the user built on it without explicit approval; these need ratification), **Delegated** (Claude decided under authority the user delegated, e.g. "Let's code"; reversible and flagged for review) and **Pending**.
- Dates are local (UTC−7). Evidence links point to the [conversation record](evidence/conversation.md), the [protocol files](../../protocol/) and the research reports under [docs/research](../research/).
- New decisions get the next number. A changed decision is not edited in place: a new ADR supersedes it.

**79 records:** 72 accepted (15 of them by continuation, awaiting ratification; 17 delegated) and 7 proposed. ADR-0044 to ADR-0057 are the credibility charter (CR1–CR14).

## Process

| # | Decision | Status | Decided by | Date |
|---|---|---|---|---|
| [ADR-0001](0001-record-architecture-decisions-as-adrs.md) | Record architecture decisions as ADRs | Accepted | User | 2026-10-06 06:00 |
| [ADR-0003](0003-stay-faithful-park-off-path-findings.md) | Stay faithful to the article and park off-path findings in More to Explore | Accepted | User | 2026-10-05 21:07 |
| [ADR-0004](0004-parallel-research-adversarial-review-build-method.md) | Build the protocol through parallel research, adversarial review and a verification pass | Accepted | By continuation ⚑ | 2026-10-05 21:09 |
| [ADR-0005](0005-ground-configurations-in-use-case-research.md) | Ground the configurations in use-case research, run in parallel with the technique research | Accepted | User | 2026-10-05 21:15 |
| [ADR-0009](0009-api-key-fencing-constraints.md) | Fence API keys: separate capped keys in a gitignored file, never in artifacts | Accepted | By continuation ⚑ | 2026-10-05 21:25 |
| [ADR-0022](0022-four-ordered-sub-projects-spec-first.md) | Split the testing-app work into four ordered sub-projects under a spec-first design process | Accepted | By continuation ⚑ | 2026-10-05 23:48 |
| [ADR-0043](0043-research-credibility-without-compromise.md) | Research credibility takes precedence over product interests, without compromise | Accepted | User | 2026-10-07 00:31 |
| [ADR-0044](0044-appoint-independent-integrity-monitor.md) | Charter CR1: an Independent Integrity Monitor (paid methodologist, not an author) | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0045](0045-registered-reports-only-no-fallback.md) | Charter CR2: cited confirmatory studies run only as Registered Reports, no fallback; PCI RR excluded | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0046](0046-public-program-registry-gates-spend.md) | Charter CR3: a public Program Registry gates all spend; results due on fixed deadlines | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0047](0047-stage-0-before-pilot-unblinding.md) | Charter CR4: public Stage 0 before pilot unblinding; pilot arm effects go to the Monitor only | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0048](0048-equal-treatment-of-arms.md) | Charter CR5: equal treatment of arms (frozen baselines, repair-only changes, tuning ledger, outside baseline) | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0049](0049-no-team-held-unblinding-keys.md) | Charter CR6: the team holds no key that can unblind or shape a study | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0050](0050-external-verification-of-locks-and-runs.md) | Charter CR7: locks and runs verified externally | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0051](0051-scripted-decisions-and-rater-integrity.md) | Charter CR8: scripts make tilt-able decisions; every AI judge reported; raters screened | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0052](0052-independent-confirmatory-analysis.md) | Charter CR9: independent confirmatory analysis and code check | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0053](0053-claims-fixed-in-advance-and-red-team.md) | Charter CR10: claims fixed in advance, plus an outside red team | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0054](0054-computed-evidence-labels-and-claims-gate.md) | Charter CR11: computed evidence labels; no efficacy claims before Stage 2 | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0055](0055-instrument-firewall-and-exposure.md) | Charter CR12: evaluation instruments walled off from the product; exposure tracked | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0057](0057-tamper-evident-record-and-disclosure.md) | Charter CR14: tamper-evident record and full disclosure | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0060](0060-repository-byway-private-remote.md) | Version control: git repository named byway, private GitHub remote (wavemanco/byway) | Accepted | User | 2026-10-07 06:35 |
| [ADR-0062](0062-code-first-work-mode.md) | Code first: people, outside actions and pricing go to a playbook and a backlog | Accepted | User | 2026-10-07 09:40 |
| [ADR-0068](0068-contracts-first-parallel-build.md) | Build the product contracts-first, in parallel git worktrees | Accepted | Delegated | 2026-10-07 10:48 |

## Protocol

| # | Decision | Status | Decided by | Date |
|---|---|---|---|---|
| [ADR-0002](0002-techniques-become-blocks-wired-into-configurations.md) | Generalize the eight techniques into domain-general blocks wired into use-case configurations | Accepted | User | 2026-10-05 21:07 |
| [ADR-0006](0006-blocks-may-sit-out-with-reasons.md) | Blocks may sit out of a configuration, and every sit-out is declared with a reason | Accepted | User | 2026-10-05 21:15 |
| [ADR-0007](0007-eight-block-codes-anatomy-and-glue.md) | Eight block codes with a standard anatomy, plus glue connectors that are not blocks | Accepted | By continuation ⚑ | 2026-10-05 21:25 |
| [ADR-0008](0008-critic-blind-render-only-hidden-threshold.md) | CRITIC is a blind, render-only, frozen-prompt loop with a hidden threshold, plus calibration | Accepted | By continuation ⚑ | 2026-10-05 21:25 |
| [ADR-0010](0010-grammar-chassis-operators-wiring-compatibility.md) | Grammar: a Diverge → Deepen → Distill chassis, an operator set and a wiring-compatibility table | Accepted | By continuation ⚑ | 2026-10-05 21:27 |
| [ADR-0011](0011-typed-ports-and-hard-port-rules.md) | Sixteen typed ports and eight hard port rules | Accepted | By continuation ⚑ | 2026-10-05 21:27 |
| [ADR-0012](0012-loop-failure-semantics-and-budget-model.md) | Bounded runs: loop failure semantics defined once, and a budget model in calls and images | Accepted | By continuation ⚑ | 2026-10-05 22:17 |
| [ADR-0013](0013-default-rules-with-declared-exceptions.md) | Ten default rules and an ordering principle, relaxed only through declared exceptions | Accepted | By continuation ⚑ | 2026-10-05 22:17 |
| [ADR-0014](0014-seven-configurations-with-distinct-topologies.md) | Seven configurations with distinct topologies, one specification contract, a chooser and a recipe; the platform configuration (former C8) moved out | Accepted | By continuation ⚑ | 2026-10-05 22:24 |
| [ADR-0015](0015-success-judged-outside-the-loop.md) | Success is judged outside the loop, against a best-in-category bar, with disclosure held constant | Accepted | By continuation ⚑ | 2026-10-05 |
| [ADR-0016](0016-anchored-rubric-for-choosing-configurations.md) | Choose configurations with an anchored seven-criterion rubric plus inclusion and veto rules | Accepted | By continuation ⚑ | 2026-10-05 22:56 |
| [ADR-0017](0017-mark-additions-keep-c1-article-faithful.md) | Mark every protocol addition ⟨A⟩, label how sure each claim is, and keep C1's defaults article-faithful | Accepted | By continuation ⚑ | 2026-10-05 22:56 |
| [ADR-0018](0018-correctness-outside-v1-verify-parked.md) | Correctness stays outside v1: CRITIC judges taste only, C7 is 'adjacent', and VERIFY is parked | Accepted | By continuation ⚑ | 2026-10-05 22:56 |
| [ADR-0019](0019-variants-get-their-own-numbering.md) | Variants get their own number instead of changing an existing configuration | Accepted | User | 2026-10-05 23:27 |
| [ADR-0020](0020-c6a-fiction-sounding-board.md) | C6a Fiction Sounding Board, with C6's fiction line pointing to it | Accepted | User-approved | 2026-10-05 23:27 |

## Research design

| # | Decision | Status | Decided by | Date |
|---|---|---|---|---|
| [ADR-0023](0023-harness-supports-three-judging-modes.md) | The harness supports lay, expert-panel and automated/AI judging; the mix is decided per study | Accepted | User | 2026-10-05 23:49 |
| [ADR-0024](0024-evaluation-ladder-paper-one-scope.md) | Evaluation ladder: Paper 1 covers rungs 1+2 (C1 replication plus leave-one-block-out ablations); generalization is Paper 2 | Accepted | User-approved | 2026-10-05 23:54 |
| [ADR-0025](0025-model-access-four-providers.md) | Model access: Anthropic, OpenAI, Google Gemini and OpenRouter, with more added as needed | Accepted | User | 2026-10-05 23:55 |
| [ADR-0026](0026-budget-sized-from-power-analysis.md) | Size the Study 1 budget from a power analysis and show an itemized cost before any spend | Accepted | User-approved | 2026-10-05 23:56 |
| [ADR-0027](0027-publishability-invariants.md) | Publishability invariants: locked plan, full archive, interleaved randomized runs, blinded stimuli, judges kept apart from the loop | Accepted | By continuation ⚑ | 2026-10-06 00:20 |
| [ADR-0034](0034-headless-c1-confirmatory-arm.md) | Use a headless C1 ('C1-H') as Paper 1's confirmatory arm, and test human-in-the-loop C1 separately | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0035](0035-study-1-materials-and-arms.md) | Study 1 materials and arms: sampled briefs, a fixed human copy deck, three baselines, C1-H and five ablations | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0036](0036-study-1-outcomes-and-ai-judges.md) | Study 1 outcomes: lay pairwise judgments as primary, non-Claude AI judges as validated secondary measures | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0037](0037-confirmatory-analysis-and-multiplicity-plan.md) | Confirmatory analysis and multiplicity plan for Study 1 | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0038](0038-model-selection-pinning-and-routing.md) | Model selection, pinning and routing policy for the studies | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0061](0061-study-1-technical-choices-accepted.md) | Study 1 technical design choices: all recommendations in protocol v1.1 accepted | Accepted | User-approved | 2026-10-07 09:40 |

## System

| # | Decision | Status | Decided by | Date |
|---|---|---|---|---|
| [ADR-0028](0028-build-approach-a-own-engine.md) | Build approach A: own TypeScript engine, a local Lab, a hosted Judge app, and a separate evaluation side | Accepted | User-approved | 2026-10-06 06:00 |
| [ADR-0029](0029-temporal-runner-versioned-recipe-files.md) | A durable Temporal runner executes each configuration as a versioned recipe file | Accepted | User-approved | 2026-10-06 06:00 |
| [ADR-0030](0030-own-model-gateway-sole-egress.md) | An in-house model gateway handles every model call: it logs each call, caps spend and keeps keys out of sandboxes | Accepted | User-approved | 2026-10-06 06:00 |
| [ADR-0031](0031-hardened-docker-sandboxes-pinned-renderer.md) | Hardened Docker sandboxes and a pinned screenshot renderer; cloud sandboxes only for the big confirmatory batch | Accepted | User-approved | 2026-10-06 06:00 |
| [ADR-0032](0032-separate-python-evaluation-side.md) | A separate Python evaluation side runs AI judges (Inspect AI), metrics and statistics | Accepted | User-approved | 2026-10-06 06:00 |
| [ADR-0039](0039-data-layer-postgres-cas-parquet.md) | Data layer: Postgres and a content-addressed artifact store on WSL ext4, with Parquet data freezes for analysis | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0056](0056-open-source-study-engine.md) | Charter CR13: open-source the study engine (OSI) by the end of confirmatory data collection | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md) | Engine requirements for composition and credibility, built into the spine before the pilot | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0063](0063-code-workspace-outside-onedrive.md) | The code checkout lives outside OneDrive, at C:\Users\arvik\code\byway | Accepted | Delegated | 2026-10-07 09:45 |
| [ADR-0066](0066-product-persistence-sqlite-cas.md) | Product persistence: node:sqlite records and content-addressed artifact files outside the repo | Accepted | Delegated | 2026-10-07 10:48 |
| [ADR-0067](0067-product-c1-direct-html-builder.md) | In the product, C1 builds single-file HTML pages by direct model generation and renders them with Playwright | Accepted | Delegated | 2026-10-07 10:48 |
| [ADR-0070](0070-runner-workflows-precompiled-with-esbuild.md) | Precompile the runner's Temporal workflows with esbuild | Accepted | Delegated | 2026-10-07 10:52 |
| [ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md) | Runs started by an older engine version end plainly when the engine changes | Accepted | Delegated | 2026-10-07 23:00 |

## Product & program

| # | Decision | Status | Decided by | Date |
|---|---|---|---|---|
| [ADR-0021](0021-build-testing-app-on-evaluation-harness.md) | Build a testing app on an evaluation harness, with 'for dummies' runbooks per configuration and journal-grade testing protocols | Accepted | User | 2026-10-05 23:46 |
| [ADR-0033](0033-parallel-research-and-product-tracks.md) | Run two tracks in parallel: harness, evaluation and paper; and a product that draws on the harness | Accepted | User | 2026-10-06 06:00 |
| [ADR-0040](0040-plain-language-recipe-first-ux.md) | Plain-language vocabulary and a recipe-first UX that hides the block grammar | Proposed | Pending | 2026-10-06 00:17 |
| [ADR-0041](0041-shared-engine-pinned-research-versions.md) | One engine for research and product: studies pin frozen engine and recipe versions, the product evolves on newer ones, and human checkpoints bind per study | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0042](0042-product-north-star-recommend-or-compose.md) | Product north star: a user brings a problem; the product recommends a configuration or composes one | Accepted (direction) | User | 2026-10-07 00:31 |
| [ADR-0058](0058-design-time-composition-only.md) | Design-time composition through the validator only; composed recipes labelled Composed; runtime rewiring parked | Accepted | User-approved | 2026-10-07 06:35 |
| [ADR-0064](0064-product-v1-local-first-web-app.md) | Product v1 is a local-first web app on the shared engine | Accepted | Delegated | 2026-10-07 10:48 |
| [ADR-0065](0065-product-v1-scope.md) | Product v1 scope: all eight configurations, recommender, composer, computed labels, demo mode | Accepted | Delegated | 2026-10-07 10:48 |
| [ADR-0069](0069-product-c5-relay-and-honest-skips.md) | In the product, C5 relay links run on fal.ai video, one link per shot, and steps with no v1 executor finish as skipped | Accepted | Delegated | 2026-10-07 18:25 |
| [ADR-0071](0071-great-critic-falls-back-to-ok-without-references.md) | In the product, a GREAT-mode critic needs at least three references, and falls back to OK mode without them | Accepted | Delegated | 2026-10-07 18:40 |
| [ADR-0072](0072-great-critic-ranks-blind.md) | A GREAT-mode critic ranks the whole lineup without knowing which item is ours; the runner finds our rank | Accepted | Delegated | 2026-10-07 21:05 |
| [ADR-0073](0073-runner-semantics-where-the-spec-was-open.md) | Runner semantics chosen where the product spec was open | Accepted | Delegated | 2026-10-07 21:40 |
| [ADR-0074](0074-local-app-security-model.md) | Local app security model: a production server for use, a guarded dev server, and no unguarded local control planes | Accepted | Delegated | 2026-10-07 23:00 |
| [ADR-0075](0075-tells-swaps-chosen-per-instance.md) | The person chooses which cliché-sweep hits to swap, one by one | Accepted | Delegated | 2026-10-07 23:00 |
| [ADR-0076](0076-other-family-critic-and-exposure-register.md) | A different-family critic where a recipe asks for one, recorded in an exposure register | Accepted | Delegated | 2026-10-07 23:00 |
| [ADR-0077](0077-rank-gates-scale-with-the-lineup.md) | Hidden rank thresholds scale with the lineup actually used | Accepted | Delegated | 2026-10-07 23:00 |
| [ADR-0079](0079-phase-4-runner-records.md) | Runner decisions made while fixing the Phase 4 review | Accepted | Delegated | 2026-10-08 00:30 |

## Open decisions (not yet ADRs)

Choices that belong to the user and will become ADRs once decided. Since 2026-10-07 the non-code items are tracked in the [playbook](../playbook.md) (people and outside actions) and the [backlog](../backlog.md) (pricing and deferred decisions); this table is kept for history.

| Decision | Options | Recommendation | Decide when |
|---|---|---|---|
| Ratify the 15 ADRs accepted only by continuation (4, 7–18, 22, 27) | Ratify all as written / ratify with named changes / reopen specific ADRs | Review them in one pass. Start with the ones Paper 1 will freeze or the validator turns into hard gates: 8, 11, 12, 13, 15, 17 and 27, and include the port rule 4 exception C1-H needs for D3-auto on unpicked candidates. Ratifications are recorded as new ADRs (CR14). | Before the Study 1 spec is written, and in any case before Stage 0. |
| Spend on a pilot before the confirmatory run | All-arm pilot on the 12 development briefs (~$2.2k generation + ~$0.6k lay raters) / 3-arm pilot (~$0.8k generation) / r_methods' smaller pilot (8 briefs, ~60 raters, ~$500 lay) / no pilot | Approve the all-arm pilot once the cost estimator and per-run caps exist. It measures the cost and variance of every arm, and the confirmatory sample size depends on those numbers. Then set the confirmatory ceiling from measured costs (core ~$24k, lean ~$20k). | After the harness spine and cost estimator are built, before any paid model or rater spend. |
| Registered Report venue (route fixed by [ADR-0045](0045-registered-reports-only-no-fallback.md): RR only, no fallback, PCI RR excluded) | PLOS ONE Registered Reports (IPA; conflicts declared, not barred) / Royal Society Open Science direct RR (COI terms unchecked) / another journal on COS's RR list | Shortlist PLOS ONE and RSOS; check each one's conflict terms for equity-holding authors, scope for AI and design research, article fee and Stage 1 turnaround; record the choice as an ADR. | Study 1 design section; before Stage 0. |
| Ethics review route and rater population | An academic co-investigator's IRB / an independent or commercial IRB / self-declared exemption (fails ACL, NeurIPS and ACM expectations). Also open: rater geography (US/UK vs multinational), and whether participants are told all designs are AI-made. Under CR14 the IRB and consent form must name the commercial sponsor. | Use an academic co-investigator's IRB. It gives a credible exemption determination, and Prolific's academic fee (33.3% instead of 42.8%). Decide rater geography together with data residency. | Before Judge's consent screen is built and before any pilot rating. |
| Judge hosting provider and data residency | Vercel / Cloudflare Workers or Pages + R2 / a self-managed EU or UK VPS | Let the IRB route and rater geography decide. Use Vercel if an account exists and US data residency is acceptable. Serve stimuli from a separate cookieless origin in all cases. | System design section, after the ethics route is chosen. |
| Which OSI licence for the study engine (release itself decided by [ADR-0056](0056-open-source-study-engine.md)) | Apache-2.0 / MIT / another OSI licence; data CC-BY-4.0 | Apache-2.0 for the engine (explicit patent grant), CC-BY-4.0 for data. Check provider output terms; fictional brands only. | Before the spec fixes components. |
| Source of the baseline and seed prompts | User supplies the article's exact 'random', seed and image-generation prompts / use the paraphrases in the protocol files | Use the article's prompts verbatim. Paraphrases weaken the replication claim. | Before prompts are frozen on the development briefs. |
| Optional GPT worker arm in Study 1 | Include a GPT-5.6 Sol worker arm (C1-H vs B-Plain on 24 briefs, ~$2k) / defer to Paper 2 | Decide from measured pilot costs. Include it if the ceiling allows, because a single model family is an obvious reviewer objection. | After the pilot, when the confirmatory ceiling is set. |
| Who needs Lab access | Owner only, local, no login / owner plus a small team, with authentication / a hosted Lab | Owner plus a small team on local machines, with no public login in v1. The small team was confirmed on 2026-10-07 ([ADR-0043](0043-research-credibility-without-compromise.md)); who exactly needs access is still open. | App design section. |
| Find and contract the Integrity Monitor ([ADR-0044](0044-appoint-independent-integrity-monitor.md)) | Candidates from methods/metascience networks; contract with fixed fee, publication-freedom and results-escrow clauses | Claude drafts a search brief and contract outline; the user recruits. | Before any pilot spend. |
| How CR14's public record is published while the repository is private ([ADR-0060](0060-repository-byway-private-remote.md)) | A public mirror of research ADRs + registry / archived DOI snapshots at milestones / both | Both: a small public research mirror plus DOI snapshots at each milestone. | Before Stage 0. |
| Smallest effect of interest and equivalence margin | Keep ±0.08 with a written rationale / tighten and add briefs | Write the rationale first (a preference shift buyers would notice, or the D3-auto cost break-even) and let it set the margin; add briefs, not raters. | Study 1 design section; fixed in Stage 0. |
| Patents, funding and legal entity disclosure | File no patents on configurations, recommender or composer / file with full disclosure; state who funds Study 1 and its role | Decide so the first disclosure is complete; if filing, file before Stage 1 and commit that no filing delays publication. | Before Stage 0. |
| Anthropic organization account and dedicated study keys | Organization account (needed for per-key usage reconciliation, CR7) plus dedicated spend-capped keys per provider per study | Set up before the pilot. | Before the pilot. |
| Rename the local ActAI folder to byway | Rename now / at the end of a session / keep the folder name | Rename at the end of a working session (it moves the session's working directory); carry the Claude project memory across. | Any time. |
| The product's form and distribution (direction set by [ADR-0042](0042-product-north-star-recommend-or-compose.md): recommend or compose a configuration for the user's problem) | Portable layers (skills, MCP) inside existing hosts (04 cross-cutting finding #10) / a standalone app grown from Lab / the platform-guardrail channel through AI app builders and coding-agent vendors (05 §J) | Keep the engine host-agnostic, so recipes and the gateway can run behind a skill or an app. Defer the choice until pilot results are in. The portable-layer form is the cheapest first probe because it reuses the recipes. | When the product track gets its own spec, after the Study 1 pilot. |

## Out of scope

Items the editor considered and left out of the ADR set:

- Sweep A ADR 'The visual map is a single self-contained HTML artifact, published privately and republished in place': dropped as a publishing choice that is cheap to reverse. The map's existence is recorded in ADR 2, and the need to keep it in sync is in ADR 14.
- Sweep A proposed ADR 'Ship configurations as portable layers (skills, MCP)': moved to open_decisions (the product's form), because it turns on a product-track choice the user has not addressed.
- Sweep B proposed ADRs on pilot-first spending, the preregistration route and venue, the ethics/IRB route, open release and licensing, and Judge hosting and data residency: moved to open_decisions, because each needs a user choice the digests could not settle.
- Merged, not lost:
  - Sweep A and B's duplicate ADR-recording entries → ADR 1.
  - Lego blocks + protocol with configurations + C1 reproduces the design workflow → ADR 2.
  - Block set + glue → ADR 7.
  - Chassis + operators → ADR 10.
  - Loop semantics + budget model → ADR 12.
  - Seven configurations + C8 move → ADR 14.
  - ⟨A⟩ marking + C1 article-faithful defaults → ADR 17.
  - C7 adjacent + VERIFY parked → ADR 18.
  - Approach A + Lab/Judge faces → ADR 28.
  - Briefs + copy deck + arms → ADR 35.
  - Primary outcomes + AI judges → ADR 36.
  - WSL ext4 location + Postgres/CAS storage + analysis pipeline → ADR 39.
- User message 2026-10-06T06:59:07Z ('I asked a question here and never got a response.'): feedback on how the conversation was conducted, not an architectural decision. Recorded in ADR 24's context.
- User message 2026-10-06T03:59:07Z (read the article): the task's starting point, not an architectural decision. Claude's closing offer to turn the article into a skill or prompt file was not taken up.
- Entry 2026-10-06T13:05:16Z 'Use the Edit tool instead of inline Python.': labelled CLAUDE and absent from dialogue_user.md. It is tool or hook feedback about how files are edited, not a user decision.
- Entries tagged [ANSWER] at 2026-10-06T13:02:49Z–13:05:18Z: echoes of Claude's own transcript-extraction tool output, not user messages. Ignored, as were all [SYSTEM] entries.
- Single factual inconsistencies, kept as follow-ups rather than ADRs:
  - The README says 'eleven use cases', but Claude's delivery message says 15 (ADR 4).
  - The README says 'Everything both rounds found has been fixed', but no independent pass re-verified the final fix round (ADR 4).
  - The operator count drifts across files: 13 / 16 / 17 / 22 (ADR 10).
- Open inputs that are not decisions, kept as follow-ups:
  - copywriter and expert recruiting channels (ADR 35);
  - the Prolific account type, which follows from the IRB route;
  - the WSL memory cap and the sandbox network policy (ADR 31);
  - rater pay and question wording (ADR 36).

## Verification

Three separate AI sweeps (protocol, harness/product, every user directive) were merged by an AI editor; four AI verifier passes then tried to refute each record. All ran on Claude (same model family as the drafter), and their corrections were applied before the files were written, so no diffs were kept. 37 records were corrected (over-attribution softened, dates and quotes fixed, invented alternatives removed); 0 were removed.
