# Playbook: people, roles and outside actions

Everything outside the code that the research program needs: who must be found, what they do, what has to happen outside this repository, and by when. Prices live in the [backlog](backlog.md). Decisions are in the [ADR log](adr/README.md); the study design is [Study 1 protocol v1.1](study1/protocol-v1.1-draft.md).

Recorded at the user's request on 2026-10-07 ([ADR-0062](adr/0062-code-first-work-mode.md)). Dates are targets from the protocol's realistic timeline, not commitments.

## 1. People and roles

Independence matters. The charter ([ADR-0044](adr/0044-appoint-independent-integrity-monitor.md) to [ADR-0057](adr/0057-tamper-evident-record-and-disclosure.md)) requires several of these people to have no stake in the product. Anyone below marked **independent** must sign an independence attestation (no equity, options, advisory or paid product role, and no product beta access).

| Role | What they do | Independence | Needed by | Source |
|---|---|---|---|---|
| **Independent Integrity Monitor** | Paid methodologist, not an author. Holds every study key; alone sees pilot and interim arm effects; runs or commissions the confirmatory analysis; co-signs deviations and research-citing claims; can publish registered results (plus a dissent) if a deadline is missed; publishes a yearly integrity report. Fixed fee. | Independent; not an author | Contracted before any pilot spend (target ~mid-November 2026) | ADR-0044, protocol §11, D7 |
| **Deputy key-holder** | Second key-holder; acts on all scripted Monitor steps if the Monitor is unavailable; receives keys if the Monitor is replaced. | Independent; not an author | With the Monitor | D7 |
| **Guarantor** | Non-conflicted author who signs ICMJE's full-access and responsibility statement. Must be a different person from the Monitor and the deputy. | No financial conflict | Before Stage 2 | ADR-0052, D7 |
| **Academic co-investigator** | Provides the IRB route (and Prolific's academic rate only if their institution pays). Can be the deputy (as a non-author) or the guarantor (as an author), not both. | Depends on role | IRB submission ~November 2026 | D7, D8 |
| **Independent copywriter** | Screens the sampling frame, codes strata, fictionalizes the briefs and writes the fixed copy decks under a written rulebook; blind to hypotheses; never sees generated pages; keeps a hash-chained edit log. Calibrated on the public engineering briefs. Writes the 12 development briefs before the pilot and the 72 confirmatory briefs during Stage 1 review. | Independent | Contracted ~October–November 2026 | ADR-0049, protocol §4 |
| **Independent designer** | Picks the critic-calibration exemplars, builds the defect gold pairs and the positive-control exemplar pairs, all under preregistered rules. | Independent | Before the freeze | ADR-0048, D20 |
| **Second transcriber** | Transcribes the article's prompts word for word from the live page, independently of the user; the two transcriptions are reconciled. The Monitor can do this once contracted. | Outside the team | By 2026-11-30 | D2 |
| **Outside baseline owner** | Owner of a competing open-source design-quality approach, invited under a registered rule after the Monitor is contracted. Gets the engineering briefs, one supervised dry run, the same repair cap as C1-H, a published adapter spec and an irrevocable licence clause. | Competitor | Invitations after the Monitor is in post | ADR-0048 |
| **Lay raters** | Prolific participants, US and UK, desktop only; forced-choice pairs; 30-minute sessions at $15/h. | Screened for conflicts; told not to use AI tools | Pilot (~Feb 2027) and confirmatory rating | Protocol §7 |
| **Expert designer panel** | 20 designers, ≥3 years' experience, portfolio-verified, recruited outside the team's network; about 3 hours each over 2–3 sessions; estimates only (no verdicts). | Screened for conflicts | Confirmatory rating | Protocol §7.6, D21 |
| **Detector coders (2)** | Label 150 pages to validate the tell detector (κ ≥ .70). | Independent | During Stage 1 review | Protocol §6 |
| **Statistician (optional)** | Runs the confirmatory analysis if the Monitor contracts one under the same independence test. | Independent | Analysis phase | ADR-0052 |
| **Red team (3–5)** | Paid outside reviewers (base fee plus a bounty per verified error), at least one from a competing approach; review the manuscript and arm-specific code paths; report published. | Outside the team | Before Stage 1 and before Stage 2 submission | ADR-0053 |
| **CODECHECK** | Independent reproduction of the analysis pipeline, issuing a certificate with a DOI. | Independent | Before Stage 2 | ADR-0052 |
| **Legal reviewer** | Monitor contract (six CR1 powers, results escrow, publication freedom), publication-freedom clause for all deals, licence review. | n/a | Before contracting the Monitor | ADR-0057 |
| **Recruiting vendor** | One third-party vendor recruits the experts, the designer, the coders and the Study 1b operators. | Independent of the team | Before those roles are needed | Protocol v1.1 resolutions |
| **Study 1b designer-operators (8)** | Run human-in-the-loop C1 (VISION, picks, CUT, TELLS, VOICE) under scripted procedures in Study 1b, a separate Registered Report. | Not told the hypotheses | Study 1b | D15 |
| **Journal editors** | Answer the venue questions that decide the go/no-go (section 2). | n/a | October 2026 | D4 |
| **Article author / publisher** | Confirm the transcribed prompts and permit their publication. | n/a | By 2026-11-30 | D2 |

## 2. Outside actions

| Action | Why | Owner | Deadline | Source |
|---|---|---|---|---|
| **Ask PLOS ONE Registered Reports and Royal Society Open Science** in writing: (i) is sealed generation before in-principle acceptance acceptable? (ii) is a registered successor-model rule acceptable? (iii) is there a minimum power per test, including secondary and equivalence tests? (iv) may the Monitor send the sealed pilot report straight to the editor, and can reviewers keep effect-related remarks confidential? (v) article charges, and are Stage 1 and 2 charged separately? (vi) Stage 1 turnaround? (vii) conflict-of-interest terms for equity-holding authors? | Go/no-go: generation will probably have to happen before acceptance because the models may retire from September 2027. If neither venue accepts sealed generation, stop before any pilot spend. | User (Claude can draft the emails) | October 2026 | D4, ADR-0045 |
| **Transcribe the article's prompts** (B-Random, SEED, the critic-loop worker prompt, ASSET) from the live page, with a second independent transcriber; ask the author to confirm and permit publication. If permission has not arrived by the freeze, register by hash and share confidentially with the Monitor, editor and reviewers. | The baselines must be verbatim; the PDF crops words at the page edge. | User + second transcriber | 2026-11-30 | D2 |
| **IRB submission** (academic co-investigator's IRB, or an independent IRB); consent form names the commercial sponsor and says the pages were AI-generated. | Ethics approval before any rating. | User | November 2026 | D8, ADR-0057 |
| **Anthropic organization account**, one workspace per arm, dedicated spend-capped keys per study at every provider. | Per-key usage reconciliation (CR7) is unavailable to individual accounts; workspaces isolate caches. | User | Before the pilot | ADR-0050 |
| **Ask providers for higher rate and spend limits** before confirmatory generation (~$15–20k in about 10 days, bursty). | New organizations start in low tiers. | User | Before confirmatory generation | Protocol feasibility review |
| **Public record for the charter** while the repository is private: a public mirror of the research ADRs, Program Registry and deviation log, plus DOI snapshots at each milestone, and published hashes of the private product ADRs. Signed commits (decided at the mirror step) and protected branches too. The ADR check already runs in CI on the private repository ([ADR-0103](adr/0103-adr-log-rule-and-ci.md)); it runs on the mirror too once that exists. | CR14 needs a public, tamper-evident record. | User + Claude | Before the brief draw (~November 2026) | D12, ADR-0060, ADR-0103 |
| **Funding, patents and legal entity**: decide and disclose (who pays for Study 1 and their role; whether any patent is filed; if so, file before Stage 1 and commit that it never delays publication). | The first disclosure must be complete. | User | Before Stage 0 | D9 |
| **Ratify the 15 by-continuation ADRs**, accept ADR-0034 to ADR-0038 as amended by protocol v1.1, and adopt exceptions SM-1 to SM-6, the port-rule wording for the tiled model view, and the CR11 magnitude-flag interpretation (co-signed by the Monitor). | Study 1 freezes these rules and the validator enforces them. | User | Before Stage 0 | D10 |
| **Confirm the baseline set** (default: the recommended B-Skill + B-Outside + B-BoN, all gated behind H1a). | Changes cost and the size of the test families. | User | Before Stage 0 | D1 |
| **Fill in the product-consequences table** ("Worse" rows). | CR10 requires it in the Stage 1. | User | Before Stage 1 | D24 |
| **Clear licences**: the frontend-design SKILL.md used by B-Skill; provider output terms before releasing generated pages. | Open release under CR13. | User + Claude | Before Stage 0 / release | D16 |
| **Rename the local ActAI folder** or retire it in favour of the code checkout. | The project is named byway ([ADR-0060](adr/0060-repository-byway-private-remote.md)). | User | Any time | ADR-0060 |

## 3. Milestones (realistic central timeline, estimates)

| Milestone | Target |
|---|---|
| Venue answers (go/no-go) | October 2026 |
| Monitor contracted; copywriter contracted | ~mid-November 2026 |
| Prompt registration; brief draw (drand round named in advance) | ~November–December 2026 |
| Stage 0 public registration | ~2027-02-01 |
| Pilot (Monitor-held) | February 2027 |
| Stage 1 submitted | ~2027-04-19 |
| Escrowed confirmatory generation | ~July 2027 (before Fable 5.1's earliest retirement, 2027-09-01) |
| In-principle acceptance | ~August–November 2027 |
| Stage 2 | ~2028 Q1 |
