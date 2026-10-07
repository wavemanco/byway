# Study 1 Protocol v1.1: C1-H replication and leave-one-block-out ablations (landing pages)

**Program:** byway · **Paper:** 1 (ADR-0024: ladder rungs 1 and 2) · **Version:** v1.1 draft, 2026-10-07 · **Status:** not registered, and not yet ready for Stage 0. Three things must happen before Stage 0 can be filed: every blocking user decision (Appendix B.1) is closed and its marker removed; the article's prompts are transcribed (D2); and a human completes the verification log (Appendix B.3). This draft is written to the standard of a Stage 0 registration (CR4) and is meant to become the core of the Stage 1 Registered Report (CR2).

**Binding rules:** the credibility charter, CR1–CR14 (ADR-0044 to ADR-0057). Where this protocol and the charter differ, the charter governs.

**What this supersedes, where they conflict:** protocol v1 (2026-10-07); the research digests study1-draft.md, methods.md and measures.md (2026-10-06); and the proposed ADR-0034 to ADR-0038. Those ADRs need the user's acceptance in the amended form set out here (D10).

**Main changes from v1.** v1 had three AI review passes: a Registered Reports methods review, a charter-compliance audit and a feasibility review. In response, v1.1 makes these changes:
- **One hypothesis table.** Wherever a decision is still open, the table shows the recommended option. There are new decisions D17–D24.
- **Primary test and power.** The primary test is now defined in the text (§9.1). Every power figure is the simulated two-way test at the family's worst-case Holm level (§8).
- **Sealing.** The brief draw uses commit-reveal. Ratings are encrypted in the rater's browser. Only the Monitor evaluates pilot outputs. Each sealed material has its own key. Prompt hashes are registered before any paid run.
- **Decision rules.** Every check now has a binding consequence. Every verdict carries a magnitude flag. A positive control is proposed. A closed list fixes what may change between Stage 0 and Stage 1.
- **Feasibility.** All dry runs use engineering briefs. Tall pages get a defined model view. Builds use an offline mirror, with no replay caching. Each arm has its own workspace, and spend caps apply per candidate. The timeline is realistic, and escrowed generation is now the expected path. The revised budget is central ≈ $100k (an estimate).
- **Fewer secondary measures** (§6.5).

**How open decisions appear.** Where text carries a [Dn] marker, it shows the recommended option for decision Dn, so the design can be read as a whole. If the user chooses differently, the text changes before Stage 0.

**Markers used below:**
- **[Dn]**: a user decision (Appendix B.1); the text shows the recommended option.
- **[PILOT]**: a planning value that the Monitor's nuisance-parameter release replaces. It must be on the closed list in §10.
- **[TRANSCRIBE]**: article text the user must copy verbatim from the live article (D2).
- **[VERIFY]**: a fact taken from a review or research pass that a human must check against its primary source (Appendix B.3).
- **⟨A⟩**: an addition that is not in the article.
- **⟨S⟩**: a binding or manipulation used only in this study. It is legal only in research-frozen recipes bound to the Study 1 lock.

**Naming:**
- **C1-H** is the headless study arm. "C1" on its own means only the protocol's configuration in 03-configurations.md, never a study arm.
- **C1-HITL** is human-in-the-loop C1, as studied in Study 1b.
- **What the paper claims.** It describes Study 1 as a controlled test of a headless variant of the article's workflow, not an unqualified replication (CR10).
- **Engineering briefs** are 3–4 briefs that the team writes and publishes; one of them is the article's own "productivity app". They are used for every dry run, cost probe, spike test, load test and viewer check, and for the B-Outside owner's dry run. They are never analysed. Development and confirmatory briefs are never used for these purposes.

**Named events** (v1 used "lock" loosely):
- **Prompt registration:** the hashes of every project prompt (Appendix A), every tool definition and the C1-H recipe are registered publicly. This happens before the first paid call that runs any study prompt and before drand round R (§4.2).
- **Freeze:** before pilot generation. The baselines, the C1-H recipe, the tools, all prompts, the model profile, the renderer, the Judge app build, the validity service, the release script and the primary-test function are frozen by hash.
- **Stage 1 manifest:** the confirmatory manifest whose hash appears in the Stage 1.
- **Lock:** the manifest version that the harness verifies before the first confirmatory call (CR7). It equals the Stage 1 manifest unless a deviation creates a new version (§15.2).

**AI contribution (CR14):** Claude (Anthropic) wrote all of the following:
- v1 and v1.1 of this protocol;
- the project prompts in Appendix A, drafted in chat, outside the gateway;
- power_sim3.py (the "statistician" in v1 was this AI research pass, not a person);
- all three reviews of v1.

Claude is the same model family as the study's worker and critic. A human must check every number before Stage 0, and the Monitor must repeat the charter audit.

---

## 1. Background and rationale

**The article's claim.** Chimala's article ("How to turn your AI into a world-class designer", Lenny's Newsletter, 2026-09-01) argues two things. Coding agents produce generic landing pages by default, and a short workflow fixes this.

**The article's evidence** is a set of the author's own demonstrations:
- four plain-prompt runs converge on one layout and palette;
- four "be creative" runs converge on one metaphor;
- four seed-string runs diverge;
- a separate-critic loop and then image generation are applied to those four;
- human finishing steps (CUT, TELLS, VOICE) are shown, but on other artifacts.

None of this involved blind evaluation, more than one product, or more than one model pair (a Claude Opus 5 worker with a Claude Fable 5 critic).

**What Paper 1 tests.** The byway protocol generalizes the article's eight techniques into blocks, and C1 (Studio) is the article's configuration. Paper 1 covers two rungs of the evaluation ladder (ADR-0024):
- **Replication:** does the workflow beat the article's own baselines?
- **Mechanisms:** what does each automatable block contribute?

**Why a headless arm.** C1 has human checkpoints: VISION taste, the "plain?" call, picks, CUT and TELLS judgment, and VOICE. If a team member with a stake in the result performed them, reviewers would discount the result. C1-H therefore:
- binds every human checkpoint to a preregistered rule or a labelled AI proxy;
- holds copy fixed with a human-written copy deck;
- evaluates every candidate, with no pick.

C1-HITL, with humans at the checkpoints, is tested separately as Study 1b (§14).

**What the headline test covers.** The article demonstrated SEED, the critic loop and ASSET on landing pages. It showed CUT, TELLS and VOICE only on other artifacts, done by humans. C1-H adds two things the article never ran on landing pages:
- AI stand-ins for CUT and TELLS (D3-auto), which 01-blocks marks "experimental";
- loop limits enforced by the engine.

H1a therefore tests the article's workflow plus project-designed AI stand-ins, and the paper says so in those words. Two further tests isolate the parts:
- H1c [D19] tests the article-demonstrated chain on its own: C1-H's pre-D3 snapshot against B-Plain.
- H3d measures what D3-auto adds.

**Conflict of interest.** The authors build a product on this protocol. The design therefore relies on three kinds of safeguard (§11):
- outside parties: the Independent Integrity Monitor, an independent copywriter and designer, an invited outside baseline, a red team and the journal;
- rules enforced by the study engine itself;
- full disclosure.

## 2. Research questions, hypotheses and gatekeeping

| RQ | Question |
|---|---|
| RQ1 | Do lay raters judge C1-H pages better designed than pages from the article's two baselines? |
| RQ2 | Do they judge C1-H pages more distinctive? |
| RQ3 | How does C1-H compare with baselines from outside the article, including a compute-matched control? |
| RQ4 | What does each automatable block contribute? |
| RQ5 | Asked the same quality question, how do expert designers' preferences compare with lay preferences? (estimation [D21]) |
| RQ6 (measurement) | Do held-out AI judges and automated metrics agree with humans? |
| RQ7 (descriptive) | What does each arm cost? |

**How the tests are read:**
- All tests are two-sided.
- A hypothesis is **supported** only if the test rejects and the estimate lies in the predicted direction. A rejection in the opposite direction is reported as **worse**.
- The win rate is the probability that a rater chooses the first-named arm's page over the comparison page, on outcome P1 or P2 (§6.1). The estimand is defined in §9.1.
- Δ is the smallest effect size of interest (SESOI): .08 on the win-rate scale [D5].
- Every verdict also carries a computed magnitude flag (§9.4). The flag matters because at 72 briefs, with the planning variance, a test at α = .05 rejects once the estimated win rate exceeds about .54 (planning estimate). That is below .50 + Δ.

| ID | Comparison | Outcome | Pairing | Prediction | Family |
|---|---|---|---|---|---|
| **H1a** | C1-H vs B-Plain | P1 lay quality | unmatched | win > .50 | **Gate**, α = .05; the only primary hypothesis |
| H1b | C1-H vs B-Random | P1 | unmatched | > .50 | F1 |
| H1c [D19] | −D3 (article core: SEED, critic loop, ASSET) vs B-Plain | P1 | unmatched | > .50 | F1 |
| H2a [D17] | C1-H vs B-Plain | P2 lay distinctiveness | unmatched | > .50 | F1 (key secondary, gated) |
| H2b | C1-H vs B-Random | P2 | unmatched | > .50 | F1 |
| H4a [D1] | C1-H vs B-Skill | P1 | unmatched | > .50 | F2 |
| H4b [D1] | C1-H vs B-Skill | P2 | unmatched | > .50 | F2 |
| H4c [D1] | C1-H vs B-Outside (CR5) | P1 | unmatched | > .50 | F2 |
| H4d [D1] | C1-H vs B-Outside | P2 | unmatched | > .50 | F2 |
| H4e [D1] | C1-H vs B-BoN | P1 | unmatched | > .50 | F2 |
| H3a | C1-H vs −CRITIC | P1 | matched lineage | > .50 | F3 |
| H3b | C1-H vs CRITIC-self | P1 | matched | > .50 | F3 |
| H3c | C1-H vs −ASSET | P1 | matched | > .50 | F3 |
| H3d | C1-H vs −D3 | P1 | matched | > .50 | F3 |
| E3a–E3d | as H3a–H3d | P1 | matched | equivalence: −Δ < win − .50 < Δ | F3-EQ |
| H3e | C1-H vs −SEED | P2 | unmatched | > .50 | F4 (with H3f) |
| H3f | C1-H vs −SEED | P1 | unmatched | non-inferior: win > .50 − Δ | F4 (with H3e) |
| HE1, HE2, HE4, HE5 [D21] | C1-H vs B-Plain, B-Random, −CRITIC, CRITIC-self | S1 expert quality (P1 wording) | as above | > .50 | FE: estimation only, no verdicts |
| PC1, PC2 [D20] | Strong vs generic exemplar pages (outside the study) | P1, P2 | fixed pairs | win ≥ .70 | Outcome-neutral positive control, not a hypothesis (§6.4) |

HE3 (C1-H vs B-Skill, experts) is not in the recommended design [D1, D21].

**Gatekeeping order (fixed in Stage 0):**
1. Test **H1a** at α = .05. It is the single gate for the headline claim (CR4).
2. **If H1a is supported**, test two families, each with Holm at α = .05:
   - **F1** = {H1b, H1c, H2a, H2b}, the article replication;
   - **F2** = {H4a–H4e, as adopted under D1}, comparators from outside the article.

   **If H1a is not supported**, F1 and F2 get the verdict "Untested (gate not passed)". Their estimates are reported with 95% CIs, and no claim is made from them.
3. Whatever H1a's result [D6], test:
   - **F3** = {H3a–H3d}, with Holm at α = .05;
   - **F3-EQ** = {E3a–E3d}, with Holm at α = .05, using two one-sided tests per claim.
4. Test **F4** as an intersection–union test. The SEED claim is supported only if both hold:
   - H3e rejects at α = .05 in the predicted direction;
   - H3f's one-sided non-inferiority test rejects at α = .025.

   An intersection–union test needs no multiplicity adjustment. §9.4 maps every partial outcome.
5. **FE** (experts) is estimation only [D21]. Its estimates and 95% CIs are reported whatever H1a's result. Expert results can neither rescue nor overturn a lay result.
6. Control the enumerated secondary tests (§9.7) with Benjamini–Hochberg at q = .05. Guardrails follow §6.3. Exploratory analyses carry no error control and are labelled as exploratory.

**Error control [D6].** Error is controlled family-wise within each family, with no correction across families. Each family answers a different claim:
- F1: did the article's workflow beat the article's baselines?
- F2: does it beat comparators from outside the article?
- F3: does each block help?
- F3-EQ: is each block's effect smaller than Δ? This is a different claim about the same contrasts, and §9.4 makes the two families' verdicts consistent with each other.
- F4: does SEED buy distinctiveness without losing quality?

Two consequences follow:
- the headline (H1a) is tested at exactly α = .05;
- no F1 or F2 claim can exist unless H1a holds.

The claims table (§9.11) states that verdicts outside H1a carry family-wise control only.

## 3. Design overview

- **Design:** within-brief, fully crossed generation, so every arm runs on every brief.
  - Briefs are the random stimulus factor and set the effective sample size.
  - Candidates are nested within arm × brief.
  - Raters are crossed with briefs.
- **Candidates:** K = 4 independent candidates per arm per brief, matching the article's ×4. **Every candidate is evaluated; there is no pick** (exception SM-1, §5.6).
- **Branching:** the ablations branch from C1-H's own lineages, sharing their earlier steps. Each matched contrast therefore compares the same design with and without one block. Baseline contrasts, H1c and −SEED are unmatched: all 4 × 4 candidate pairings are eligible, and pairings are allocated as in §7.2.
- **Counts at 72 confirmatory briefs [D18]:**
  - confirmatory stimuli: 10 stimulus arms × 4 × 72 = 2,880 (3,168 with B-BoN). −D3 needs no extra generation.
  - pilot: 12 development briefs × (all arms plus the A/A arm) × 4.

```
B-Plain root ─► [B-Plain]
            └─► critic loop ─► ASSET ─► D3-auto ─► [−SEED]
SEED root ──► critic loop ─► ASSET ─► (snapshot = [−D3]) ─► D3-auto ─► [C1-H]
         │               └─► D3-auto ─► [−ASSET]
         ├─► ASSET ─► D3-auto ─► [−CRITIC]
         └─► self-review loop ─► ASSET ─► D3-auto ─► [CRITIC-self]
```

### 3.1 Arms

| Arm | Definition | Recipe derivation (ADR-0059) | Checkpoint bindings |
|---|---|---|---|
| **B-Plain** | The article's Baseline 1 prompt, verbatim except for the product phrase, plus the shared brief block (§4.6). 4 independent sessions. | kind = baseline; frozen before the pilot (CR5) | none |
| **B-Random** | The article's Baseline 2, the "be creative" prompt, which asks for a one-of-a-kind result with design choices made randomly [TRANSCRIBE], plus the brief block | baseline | none |
| **B-Skill** [D1] | The B-Plain prompt, with Anthropic's frontend-design SKILL.md injected into the system prompt. The commit is pinned by a registered rule (§5.3). | baseline | none |
| **B-Outside** (CR5) [D1] | A recipe submitted by an invited outside owner of a competing approach. It runs through the published adapter (§5.3) on the same worker, tools, brief block and per-candidate cap. | baseline; frozen as received, before the pilot | as declared by the owner; any human step is bound to a policy or excluded, and declared in Stage 0 |
| **B-BoN** [D1] | Compute-matched best-of-N. For each candidate slot, N B-Plain builds are made, then one fresh Fable 5.1 selector call picks one. N is set so the mean cost per slot equals C1-H's pilot-measured mean cost per candidate [PILOT]. | baseline, with a ⟨S⟩ selector | selection by AI under a frozen prompt |
| **C1-H** | x4[SEED] > each[critic loop] > each[ASSET, always on] > each[D3-auto]. All 4 candidates are evaluated (§5.4). | variant of C1 on the research-frozen channel; parent = the C1 recipe hash; derivation = binding map S1-BIND plus exceptions SM-1 to SM-6 | §3.2 |
| **−SEED** | B-Plain's own candidates serve as roots, followed by C1-H's remaining steps unchanged | ablation: versioned bypass(SEED) transform of C1-H | as C1-H |
| **−CRITIC** | Seed build > ASSET > D3-auto | ablation: bypass(CRITIC) | as C1-H |
| **CRITIC-self** | Seed build, then a loop in which the critic tool returns the render to the worker. The worker critiques it in its own context, with the same model, without blinding, and with the same prompt text, cap and gate. Then ASSET > D3-auto. | ablation, plus study manipulation SM-5 | as C1-H |
| **−ASSET** | Post-loop snapshot > D3-auto | ablation: bypass(ASSET) | as C1-H |
| **−D3** | C1-H's pre-D3 snapshot; no extra generation. Also the "article core" arm in H1c. | ablation: bypass(D3) | as C1-H, without D3 |
| **A/A** (pilot only) | B-Plain run as two arms under two opaque labels, assigned by a seeded draw | baseline duplicate | none |

Ablations are produced only by the engine's versioned bypass transform, never by hand edits (ADR-0059).

### 3.2 C1-H checkpoint-binding map (S1-BIND, a hashed artifact)

| Checkpoint in C1 | What the article did | C1-H binding | Mode | Declaration |
|---|---|---|---|---|
| Entry route | seed, vision-direct, vision-system | seed only | policy | VISION sits out, because it is a human taste block (tested in Study 1b) |
| pick(H,k) after D1 | keep all (the demo kept 4) | keep all 4 | policy (the article's default) | — |
| Loop gate | critic score ≥ 9/10; the critic is never told the threshold; the worker holds it | same | as in the article | — |
| Loop limits | none (the article's tip: probe 1–2 iterations) | the engine enforces a probe of 2, a cap of 5 critic calls in total, the plateau rule and a best-snapshot re-rank | policy ⟨A⟩ | C1 amendment 5 |
| Worker ends the loop early (before a score of 9, the cap or a plateau) | — | one fixed continuation line (A.17), at most twice per candidate; after that the loop ends and the re-rank applies | policy ⟨A⟩ | §5.4; declared deviation 16 |
| Loop not converging after the probe | — (⟨A⟩ a human recalibrates) | continue to the cap; no recalibration | policy | SM-2 |
| Cap reached | — (⟨A⟩ a human ships, discards or raises the cap) | the best snapshot proceeds | policy | SM-2 |
| Backtrack to D1 | — (⟨A⟩ a human decides) | none | policy | SM-2 |
| ?H "plain?" before ASSET | ASSET was applied to all four designs, unconditionally | always on | policy (faithful to the article) | — |
| Pick before D3 | port rule 4 requires one | none; D3-auto runs on every candidate | exception | SM-1 |
| CUT taste owner | human | a fresh-context Fable 5.1 reviewer issues an itemized removal directive | AI proxy | SM-3 (01-blocks marks this "experimental") |
| TELLS keep-or-revert | a human compares the versions | a blind, fresh-context Fable 5.1 A/B call, worded differently from every outcome item (A.13) | AI proxy | SM-4 |
| VOICE | a human rewrites every line | a fixed human copy deck in every arm | policy (all arms) | SM-6 |
| CRITIC-check ⟨A⟩ | not in the article | not run | sit-out | it needs a human to route failures, and defects are measured outside the loop (G1–G2) |
| pick(H,1) and RELAY | Quartz was picked, then turned into video | not run | sit-out | RELAY is optional, and motion cannot be judged on static renders |

## 4. Materials

### 4.1 Sampling frame and eligibility

**Frame:** Product Hunt daily launches, plus Show HN posts for developer tools, from 2026-01-01 to 2026-06-30.
- **Who exports it:** the Monitor or the copywriter produces the export, using a registered script; the team does not. Show HN items come from the HN Algolia API, if its terms permit this use [VERIFY].
- **Terms of use:** the export method and both sites' terms are verified before the draw is registered (Appendix B.2).
- **What is published:** a timestamped (OpenTimestamps) SHA-256 hash of the export, plus item IDs or URLs.
- **Where the full export goes:** it is deposited under restricted access held by the Monitor, not republished.
- **Mixed sources:** the developer-tools stratum mixes the two sources. Source-by-stratum counts are reported, and source is an exploratory moderator.

**Eligibility rulebook R-ELIG (preregistered).** An item is eligible only if all of these hold:
1. It launched within the window.
2. It is a product, not a person, a job post or a content-only page.
3. Its public material is enough to fill the template: a one-line description, an audience, at least 3 features and a primary call to action.
4. It is not adult content, gambling, weapons, medical-treatment claims, a political campaign or a token sale.
5. It is not a website builder, landing-page generator, AI design skill or design-quality detector.
6. It has no tie to the sponsor, its authors or the Monitor, whether as customer, competitor, investee or employer. Before round R, the team and the Monitor submit a tie list, and its hash is published. Every rejection under rule 6 must cite an entry on that list.

**Strata (12):** developer tools/API; B2B SaaS; consumer mobile app; fintech; health and wellness; D2C physical product; hardware/IoT; creative tools; education; local service/hospitality; nonprofit/civic; AI product. The copywriter assigns each item to the first matching stratum in this fixed order.

**Stratum shortfall rule.** A stratum may have fewer than 7 eligible items in the window. If so, the window for that stratum extends backwards one month at a time, up to 3 months. If it is still short, the shortfall is taken from the next stratum in the fixed order. Every use of this rule is logged and reported.

**Brand tone** (playful, serious, technical or premium) is coded by the copywriter and reported. It is not balanced, because balancing would require non-random selection.

### 4.2 Draw (CR6)

The draw uses commit-reveal, so nobody can reconstruct it early.
1. **Before round R:** register R-ELIG, R-FICT, the copy-deck style guide, the tie-list hash, the draw script and the frame-export hash (CR3). The Monitor publishes SHA-256(s), where s is a secret the Monitor generates and holds. The drand mainnet round R is named at registration and falls at least 7 days after it.
2. **Seed:** SHA-256(drand round R randomness ‖ s). The script permutes the frame within each stratum. Because s is secret, nobody else can compute the permutation until s is revealed.
3. **Screening:** the copywriter screens items in permutation order and logs every rejection, with its rule number. The log is hash-chained and encrypted to the Monitor and the deputy. Counts per rule per stratum and the chain-head hashes are published as screening proceeds. Item identities, the full log and s are revealed at unblinding, when anyone can verify the whole draw.
4. **Positions** [D18]: the first 7 accepted items per stratum are assigned by position:
   - position 1: development (12 briefs);
   - positions 2–7: confirmatory (72 briefs).
   There is no reserve stratum. Replacement is allowed only for a closed list of reasons: a legal or trademark impossibility, or a recognition-probe hit that two re-fictionalizations cannot fix. The replacement is the next accepted item in permutation order, and it is logged.
5. **Development briefs** stay sealed from the team until the Monitor's pilot release (§4.5).

**Other seeded draws.** Every other random draw uses a drand round named in advance, in Stage 0 or in the Stage 1 manifest:
- the B-Skill pin time (§5.3);
- the A/A labels;
- the confirmatory run order (§5.8);
- the full pairing, side and trial-order schedule for rating (§7.2);
- gold-trial placement;
- the 200-pair sealed validation set and the 8 AI-judge pairs per brief-contrast (§7.7);
- the 150 detector-validation pages (§6.2);
- the critic-validity exemplar order (§5.7);
- the example pages shown in figures and press (§9.11).

Study 1b's brief draw is registered in its own Stage 0 (§14).

### 4.3 Fictionalization (independent copywriter, CR6)

**The copywriter** is an independent freelancer, not an author:
- blind to the hypotheses and never shown generated pages;
- works under a written rulebook (R-FICT) and a copy-deck style guide, both registered before round R;
- files ICMJE-scope disclosures (CR14).

All communication between the team and the copywriter goes through one logged channel. The log is disclosed at unblinding.

**Rules for each brief:**
- a new brand name, with a recorded trademark search (USPTO, EUIPO and the WIPO Global Brand Database);
- numbers, places, people and exact feature names are changed;
- the category, audience, core job and feature count are kept;
- no real logos, customers, testimonials or statistics.

**Template (80–120 words):** one-line description; audience; 3 features; primary call to action; tone tag; must-haves.

**Custody.** The copywriter encrypts every brief and deck on their own machine, to the Monitor's and deputy's keys, before sending anything. The edit log is hash-chained now and opened at unblinding.

**Timing (to shorten the critical path).** The draw covers all 84 briefs early, but the timing differs by brief type:
- Development briefs and decks (12) are written before the pilot.
- Confirmatory briefs and decks (72) are first needed at the lock. They are written, probed and encrypted during Stage 1 review.

**Recognition probe:**
- A scripted job asks the worker model and each AI-judge model to name the real product behind each fictionalized brief.
- It runs on a machine the Monitor controls, with API keys only the Monitor holds, under its own registry entry. No sealed brief text passes through the team's gateway.
- The results go only to the copywriter and the Monitor.
- Any brief that any model names correctly is re-fictionalized, and the re-fictionalization is logged.
- Hit rates are reported.

### 4.4 Copy decks

The same copywriter writes one deck per brief, containing:
- brand name;
- headline (at most 10 words);
- subhead (at most 25 words);
- 3–4 features, each with a title of at most 5 words and a body of at most 25 words;
- how it works, in 3 steps;
- a pricing teaser of 1–2 lines;
- primary and secondary call-to-action labels;
- a footer with a company line and 3–5 link labels.

Each string is marked REQUIRED or OPTIONAL. Agents:
- may omit OPTIONAL strings;
- may add only labels of 4 words or fewer, which are logged and counted (eyebrow labels are a known tell);
- may put no text in generated images;
- may not invent numbers, quotes or customers.

### 4.5 Brief types, custody and keys

**Engineering briefs (3–4):**
- written by the team and published;
- used for every dry run, cost probe, spike test, load test and viewer check, and for the B-Outside owner's dry run and conformance run;
- never analysed.

**Development briefs (12):**
- sealed to the Monitor and the deputy until the Monitor's pilot release;
- used only for the pilot, the later bridging checks, and the DreamSim, detector and critic-validity runs;
- published with the engine after the pilot release (CR13).

**Confirmatory briefs (72):**
- encrypted at ingest;
- the registry publishes salted SHA-256 commitments, and the salt is escrowed with the Monitor;
- never used in the pilot;
- decrypted only inside the locked confirmatory run, or inside escrowed generation (§15.3), through short-lived decryption operated by the Monitor.

**Calls that carry sealed material.** For every such call, the gateway encrypts the request and response bodies to the Monitor's key. The team's ledger keeps metadata only.

**Separate keys.** Each sealed material has its own key pair:

| Material | Key holders | Released to | When |
|---|---|---|---|
| Development briefs and decks | Monitor, deputy | the pilot run (short-lived); then the team | at pilot generation; at the pilot release |
| Confirmatory briefs and decks | Monitor, deputy | the locked run only (short-lived) | at the confirmatory or escrowed run |
| Stimulus-to-arm map | Monitor, deputy | the analysis | after the analysis-code hash is registered |
| Escrowed outputs and sealed-call bodies | Monitor, deputy | the rating pipeline | at IPA |
| Sealed validation labels | Monitor | the AI-judge validity script | after the judges' outputs are frozen |
| Pilot ratings, pilot AI-judge outputs, pilot outcome metrics | Monitor | nobody on the team before Stage 1 is published (D11) | — |
| Confirmatory ratings and AI-judge outputs | Monitor (and the validity service, §7.2) | the authors | after the Monitor's signed report has a DOI (§9.10) |
| Draw secret s and the rejection and edit logs | Monitor | public | at unblinding |

The Judge database stores opaque IDs only.

### 4.6 Shared brief block

The block (Appendix A.0) is appended identically to the first worker prompt of every arm. It contains:
- the fictionalized brief;
- the copy deck;
- the copy rules of §4.4;
- the must-haves: a static build into /dist that runs offline, a single page, usable at 1440 px and 390 px wide.

Apart from the product phrase, it is the only text added to the article's prompts.

### 4.7 Rendering protocol

**One render service** produces every image used by the worker's render tool, the critic tool, the D3-auto calls, raters, AI judges, embeddings and detectors.
- It runs pinned Playwright and Chromium in a pinned container digest. The GL flags are pinned in the container (ANGLE with SwiftShader [VERIFY]), so WebGL renders without a GPU.
- Pages are static builds served from a local, offline origin.

**Offline mirror.** The article's runs were online; the study's are offline. To stop offline builds from handicapping arms that never look at their render:
- **What the mirror holds:** a frozen mirror of CDNs, fonts and npm packages, built by a preregistered rule. It contains every external host and package requested in engineering-brief runs, plus the top-N npm packages by downloads with their full dependency closure. N is fixed in Stage 0.
- **What is intercepted:** fonts.googleapis.com, fonts.gstatic.com, the Tailwind CDN, cdnjs, unpkg and jsdelivr, identically at build time, in the worker's render tool and in the final renderer.
- **Other traffic:** no other network access is allowed.
- **Logging:** every unmirrored request is logged.
- **Fixes:** a mirror fix is an infrastructure repair applied to all arms (§5.10).
- **Publication:** the mirror snapshot is published (CR13).

**Capture procedure** (on a controlled clock, so captures are deterministic):
1. Load the page.
2. Wait for network idle and `document.fonts.ready`.
3. Scroll from top to bottom in 400 px steps, advancing the clock 150 ms per step, so that scroll-triggered content appears.
4. Return to the top and advance the clock 2 s.
5. Capture.
6. Advance the clock 1 s and capture again. If the two differ, the page is flagged as still animating, and the first capture is kept.

Reduced motion is not forced. A WebGL smoke test runs on every page and is logged.

**Viewports:**
- Desktop 1440 × 900 at device pixel ratio 1: a full-page capture plus the above-the-fold crop.
- Mobile 390 × 844, for guardrails only.
- Full-page height is capped at 15,000 px, and truncated pages are flagged.

**Model view.** A full-page image of a tall page would be shrunk until its text is illegible: the feasibility review reports a Claude input limit of 2,576 px on the long edge [VERIFY]. Every model call therefore receives the same "model view" of a render:
- **Tiles:** the full-page capture is cut into ordered, non-overlapping tiles of 1440 × 2560 px at native resolution, at most 6. The last tile may be shorter.
- **Format:** images only, with no added text.
- **Who receives it:** the worker's render tool, the critic, the D3-auto reviewers, the re-rank, the B-BoN selector, pick(C) and the AI judges, all with identical bytes.
- **Per-request image limit:** if a call would exceed a provider's limit [VERIFY], the first k tiles of each page are sent. k is fixed in Stage 0 as the largest value that fits every call type.
- **Fixing the rule:** the rule is fixed in Stage 0 after a spike on engineering briefs. The spike checks that providers accept the tiles and that body text is legible, by OCR of the headline and one body paragraph.
- **Logging:** the effective resolution is logged per image.

The article's screenshot size is unknown, so this is a declared deviation (§15.1, item 13).

**Files:**
- Rater-facing images carry IDs computed as HMAC(Monitor key, content), and their metadata is stripped.
- They are served from a separate, cookieless origin.
- Because the team generated every page, it can still link a stimulus to its arm by content. The blinding protection therefore rests on ratings custody (§7.2), and the Stage 1 says so.

**Render log.** For every stimulus, the log records:
- console errors;
- failed and unmirrored requests;
- font fallbacks;
- WebGL status;
- page height and truncation;
- the number of model-view tiles;
- the blank-canvas detector's result;
- horizontal overflow at 390 px.

## 5. Generation procedure

### 5.1 Model profile [D3]

The model profile is a hashed artifact recorded in every manifest.

**Worker (all arms):** claude-opus-5-5.
- **Effort:** one fixed level for every arm; high is recommended. The feasibility review reports that the API default is medium while Claude Code, where the article ran, defaults higher [VERIFY]. The Stage 0 records the chosen level and the fidelity-versus-cost reason for it.
- **Sampling:** no temperature, top_p or top_k, because these models reject them. Randomness comes from the K = 4 independent sessions instead.
- **Output length:** fixed maximum output tokens.

**Critic, CUT reviewer, TELLS A/B, best-snapshot re-rank, B-BoN selector and pick(C):** claude-fable-5-1, at a fixed effort level.

**Image generation:** one pinned, dated OpenAI image-model snapshot, offered to every arm as the same `generate_image` tool with fixed size and quality. The article supplied an OpenAI key but never named the model. Its interaction with the GPT judge is decision D22.

**Routing:**
- **Providers:** first-party APIs only.
- **Workspaces and keys:** each arm has its own Anthropic workspace with its own spend-capped key, for the pilot and the confirmatory run alike (CR7). Prompt caches are isolated per workspace [VERIFY], so no arm can read another arm's cache. A fork into another workspace pays one cache write. Prompt caching is on within each workspace.
- **Gateway logging:** on every call, the gateway logs the returned model string, the request ID, the headers and the latency.
- **Model check:** the gateway asserts that the returned model string equals the profile, and halts the run if it does not.
- **Fallbacks:** server-side fallbacks are off.
- **OpenRouter:** used only for the open-weight judge, pinned to one provider with fallbacks off.

**Capacity.** In October:
- open the Anthropic organization and the per-arm workspaces;
- request custom rate and spend limits, sized from a written throughput plan (concurrent sessions × output tokens per minute);
- complete OpenAI organization verification [VERIFY].

A one-day load test at confirmatory concurrency runs on engineering briefs before the freeze.

**Retirement dates:** claude-opus-5-5 retires no earlier than 2027-09-22, and claude-fable-5-1 no earlier than 2027-09-01 [VERIFY] (tooling.md, from Anthropic's deprecation page). The image model and the judge models are checked at the Stage 1 manifest and again at the lock.

### 5.2 Agent harness (identical across arms)

**Sessions and tools.** The project engine (ADR-0028, ADR-0029) runs one sandboxed agent session per candidate. Every session gets one fixed, minimal system prompt (Appendix A.1) and the same tools:
- shell;
- file read, write and edit;
- build;
- `render`, which returns the model view of the desktop full-page capture;
- `generate_image`, limited to 6 calls per step.

Only arms with a critic loop also get `design_critic`. B-Skill adds SKILL.md to the system prompt.

**Conversation continuity.**
- Each candidate's conversation continues through its steps, as in the article's single Claude Code instance.
- The engine is append-only: it never edits or drops an earlier turn. The feasibility review reports that, for organizations created on or after 2026-08-31, edits to earlier turns are rejected [VERIFY]. If context management is ever needed, it uses an append-only mechanism, applied identically in every arm and declared.
- At a branch point, the conversation is forked byte-identically, thinking blocks included. This is spike-tested across workspaces before the freeze.

**Single-answer calls.** Every single-answer Fable call (re-rank, TELLS A/B, B-BoN selector, pick(C), CUT and TELLS reviewers) uses automatic tool choice with structured outputs. The feasibility review reports that forced tool choice is rejected on both models [VERIFY].

**No replay caching.**
- Generation calls are never served from a replay cache, step memoization or gateway deduplication. Any deduplication is keyed by a per-session nonce, never by prompt content.
- Caching is allowed only for AI-judge calls after the freeze, keyed by pair, order and judge.

The reason: the four sessions of an arm send byte-identical first requests, so a content-keyed cache would collapse them into one candidate.

**Refusals.** A refusal stop reason [VERIFY] gets one logged automatic retry. A second refusal is Class Q "provider refusal" (§5.9).

**Not Claude Code.** The engine is not Claude Code. This is a declared deviation (§15.1).

**Sandbox backend.** The backend and the concurrency are fixed in Stage 0. The pilot runs on the same backend as the confirmatory run.

**Spend caps.** Each candidate has a USD cap of max(5 × the pilot median cost, 1.5 × the pilot maximum) for its arm [PILOT], under a hard per-study ceiling. A cap is spend protection, not a quality rule. A candidate that hits its cap stops, its last valid snapshot becomes the stimulus, and the event is logged as a "spend stop" and reported per arm.

### 5.3 Baselines (frozen before the pilot, CR5)

**B-Plain and B-Random:** the article's prompts verbatim [TRANSCRIBE, D2]. The only edit replaces the article's product phrase with "my" followed by the brief's one-line description.

**B-Skill pin rule:**
- **Which commit:** the latest commit to `plugins/frontend-design/skills/frontend-design/SKILL.md` on the main branch of anthropics/claude-code, at or before the timestamp of a drand round named when the frame is registered.
- **Archiving:** the file is archived at that commit and its full text hashed.
- **Injection:** the text is injected into the system prompt, as Claude Code does when a skill triggers ⟨S⟩.
- **Licence:** checked before the freeze (Appendix B.2).

**B-Outside invitation rule** (applied by the Monitor, after the Monitor is contracted):
1. **Define the candidates.** Before the invitation date, the Monitor registers the definition of an "open-source design-quality approach for coding agents", the exact search query and the search date. These are excluded: B-Skill's source repository, aggregator and list repositories, and anything with ties to the team.
2. **Rank them** by GitHub stars on that date.
3. **Invite.** Maintainers are invited in rank order with a registered, standard invitation. It states:
   - the arm's status under D1;
   - the adapter specification below;
   - any honorarium (budget line C5);
   - an irrevocable licence to run the recipe and publish it (CR13).
4. **Equal treatment.** The owner receives:
   - the engineering briefs;
   - one supervised dry run on them;
   - the same closed-list repair cap as C1-H, with repairs classified by the Monitor.
5. **Sign-off.** Before the freeze, the owner signs off a conformance run. Any dissent the owner records is published.
6. **Deadline.** The deadline is 3 weeks after a public engine sandbox is available, and in all cases before the freeze.
7. **Fallback.** If nobody accepts, the top-ranked approach runs "as published, not owner-submitted", under the adaptation rule below.

**Adapter specification:**
- the recipe's main instruction file is injected into the system prompt, as for B-Skill;
- files it references are mounted read-only in the sandbox;
- slash commands, hooks, subagents and MCP tools are not available;
- the tools, brief block and per-candidate cap are those of every other arm.

An approach that cannot run without unsupported features is skipped for the next-ranked one, and the skip is logged.

B-Outside is run and reported whatever the result. If it ships its own detector (for example Impeccable), that detector is never used as an outcome.

**B-BoN** [D1]:
- For each slot, make N B-Plain builds, reusing B-Plain's own candidate as build 1.
- One Fable 5.1 selector call (Appendix A.14) sees the N model views, shuffled and labelled, and picks one.
- N is fixed in Stage 1 from pilot costs. It is on the closed list in §10.

### 5.4 C1-H, step by step

1. **D1 SEED.**
   - Four independent sessions each receive the article's seed prompt [TRANSCRIBE, D2], with the product phrase replaced and the brief block appended.
   - The worker generates the random string with its own shell tool. The harness logs every shell output (seeds.jsonl) without changing the prompt.
   - **Fidelity check:** the seed must come from a logged shell call whose output contains the string. The rate is reported per arm, and the harness does not intervene.
   - The runbook's additions are not used: an example python command; "imagery"; the structural axis of amendment 7; the ban on anything "derived literally" from the string; must-haves inside the seed prompt.

2. **D2 critic loop (each candidate).** The worker receives the article's worker prompt [TRANSCRIBE, D2], with two substitutions:
   - the named critic subagent becomes "the design_critic tool (a separate Claude Fable 5.1 model)";
   - the screenshot step names the render tool.

   As in the article, the worker writes the critic prompt, holds the 9/10 threshold and must keep the threshold out of the critic prompt.

   **The `design_critic` tool ⟨A⟩:**
   - **Input:** it runs claude-fable-5-1 in a fresh context, with only the worker-written critic prompt and the model view of one desktop render (port rules 1, 2 and 5).
   - **Prompt lock:** the critic prompt is locked at the first call. Prompts are compared after Unicode NFKC normalization and whitespace collapsing. A later call with different text is refused with an error asking the worker to reuse the prompt, because the article requires the same prompt every time.
   - **Gateway block:** the gateway blocks a critic prompt that contains any of the following, using detectors fixed in Stage 0:
     - **threshold:** the gate value in a score context, such as "9", "9.0" or "nine" followed by "/10" or "out of 10";
     - **brief text:** at least 8 consecutive tokens matching the brief or the deck, after normalization;
     - **code:** fenced code, or tokens on a registered HTML, CSS and JavaScript list.

     A block is logged as tool misuse, and the worker is asked to resend. Three blocks in one candidate is Class Q "repeated tool misuse".
   - **Score line:** the tool appends one fixed line asking the critic to end its reply with "Score: n/10" (A.6). The parser accepts integers and decimals, such as "Score: 8.5/10".

   **Loop control.** The engine enforces C1 amendment 5:
   - at most 5 critic calls per candidate;
   - convergence after the probe is logged but not acted on;
   - a gain under 0.5 over 2 consecutive calls ends the loop, and an unparseable score counts as no gain;
   - if the worker ends its turn without a score of 9 or more, before the cap and before a plateau, the engine sends one fixed continuation line (A.17) ⟨A⟩. It does this at most twice per candidate; after that the loop ends and is logged as an "early stop";
   - if the loop ends without a score of 9 or more, a fresh Fable re-rank call (Appendix A.7) chooses among the top 3 snapshots, and the chosen snapshot proceeds.

   These rules are identical in every loop arm.

   **What is released from the loop.** Block, misuse and early-stop rates per arm go to the Monitor; the team sees them pooled.

3. **ASSET (each candidate, always on).**
   - The prompt is the article's image prompt [TRANSCRIBE, D2], with its API-key paragraph replaced by "Use the generate_image tool for image generation."
   - The runbook's additions ("keep all text out of the images", "show me the screenshots") are not used. The no-text rule is already in every arm's brief block.

4. **D3-auto (each candidate; labelled as an AI stand-in).**
   - **CUT-auto.** A fresh-context Fable 5.1 reviewer sees only the model view. It issues an itemized removal directive following the CUT procedure in 01-blocks.md (Appendix A.9):
     - a purpose statement;
     - five probes;
     - removal verbs only;
     - no new parts except standard components;
     - REQUIRED copy strings form a protected list.

     The worker applies the directive using the runbook's CUT template (A.10), for at most 2 rounds.
   - **TELLS-auto** [D23]:
     - A fresh-context Fable 5.1 sweeper sees the model view and the article's four-row catalog (01-blocks.md, UI design row), and lists the hits (A.11).
     - The worker makes one variant that applies every hit, using the runbook's swap template adapted to a list of hits (A.12).
     - A blind, fresh-context Fable 5.1 A/B call keeps the original or the variant (A.13). Sides are randomized. The call never sees the catalog, and its wording differs from every outcome item.
     - There is one pass and no re-sweep.

5. **Output:** each candidate's final artifact. All 4 candidates are evaluated.

### 5.5 Ablations

Ablations are derived from the C1-H recipe by the bypass transform (§3.1). The −D3 stimulus is the exact pre-D3 snapshot of the same C1-H lineage. Each matched contrast compares the two final outputs of one lineage.

### 5.6 Declared exceptions (study manipulations)

Each exception:
- is legal only in research-frozen recipes bound to the Study 1 lock;
- cannot be composed into other recipes;
- is never a product default (ADR-0059 exception catalogue);
- is ratified together with ADR-0011, ADR-0012 and ADR-0013 before Stage 0 (CR14, D10).

D10 also ratifies wording for port rules 1, 2 and 5 that allows the critic's "view" to be the tiled model view of one render.

| ID | Rule relaxed | Where | Why |
|---|---|---|---|
| SM-1 | Port rule 4: every option_set is closed by a pick before D3 | C1-H and all ablations that include D3 | Evaluating every candidate removes the best-of-4 selection advantage over single-shot baselines. The article's demo carried all four candidates through D2 and ASSET, and a human pick cannot be blinded. |
| SM-2 | ADR-0012's human decisions at non-convergence, at the cap and at backtracks | C1-H and the ablations that include the loop | No human is in the loop, and there is no mid-study recalibration (CR5). |
| SM-3 | The CUT taste owner is a human | D3-auto | It is an AI proxy; 01-blocks lists a fresh-context reviewer as experimental. |
| SM-4 | Port rule 7's human comparison in the TELLS sweep | D3-auto | It is an AI proxy. The catalog still never enters a generation or critic prompt, and the A/B judge never sees it. |
| SM-5 | Port rules 1 and 2: the critic sees only views and never the threshold | CRITIC-self only | This is the manipulation itself: a non-blind, same-model critic with the same number of iterations. |
| SM-6 | Default rule 9 (humans own the words) and port rule 6, bound to a fixed deck | every arm | Holds copy constant across arms. VOICE is not tested in Study 1. |

### 5.7 Critic validity check (independent designer, CR5; descriptive)

**Exemplars (rule R-CAL).** An independent designer chooses 3 strong and 3 generic exemplars. The designer is screened like the expert raters and is not an author.
- Strong exemplars are product landing pages from a named award gallery, 2025–2026. The gallery is named and hashed in Stage 0.
- Generic exemplars are Show HN sites from a pinned version of Krebs's public corpus that show 4 or more of his 16 patterns.
- Candidates are offered in a seeded order. The designer may skip only pages that are not landing pages or are unsafe, and each skip is logged.
- These exemplars are disjoint from the gold pairs and the positive-control pairs.
- Our renderer renders them.

**Measurement.** During Stage 1 review, the Monitor applies every critic prompt the worker wrote in pilot C1-H runs once to each exemplar, in a fresh Fable call. Two metrics are reported:
- the share of prompts that score every strong exemplar above every generic one;
- the mean AUC.

**Reporting.** This is a descriptive measurement with a reference value of mean AUC ≥ .80. It is not a gate and has no consequence: the article has no calibration step, CR5 forbids tuning, and the recipe does not change whatever the result. It is reported in Stage 2 and in the paper's limitations.

### 5.8 Interleaving and the generation window

**Run order.** A drand round named in the Stage 1 manifest seeds the run order:
- briefs run in random order;
- within a brief, all root sessions (the baseline builds and the 4 SEED roots) start in random order within the same hour;
- each branch starts when its parent ends;
- concurrency is equal across arms.

**Generation date and window.** The generation date is fixed by rule (§15.3). Confirmatory generation finishes within 10 days. The window extends by any paused time, up to a maximum of 21 days.

**Drift canaries.** Every day, two canary calls run: one long, multi-image critic call and one short build call. Stage 0 fixes the pause thresholds:
- an error rate above 3× the pilot rate over 1 hour;
- a median latency above 3× the pilot median.

**What happens on a pause:**
- A breach pauses the run automatically.
- The run resumes automatically after the canaries pass for 2 consecutive hours.
- The Monitor and the deputy are notified, and either can veto the resume.
- Both events are logged.

**Change in the returned model string.** This is not a pause. It halts the run, creates a deviation entry and triggers the successor and bridging procedure (§15.3).

Nothing is regenerated except as §5.9 and §15.3 allow.

### 5.9 Failure taxonomy and intention-to-treat (CR8)

**Class I, infrastructure failures.** A script classifies these from exit codes and HTTP statuses, with no human override:
- provider 5xx or 429 errors that persist after the gateway's retries;
- network faults;
- container crashes or out-of-memory errors;
- renderer crashes;
- harness exceptions;
- a suspected cache fault: a duplicate first-response hash within one arm × brief (§6.4).

The failed step gets one automatic retry from its last checkpoint, and every retry is logged. A second failure marks the candidate infra-failed, and its last valid snapshot becomes the stimulus.

**Class Q, quality failures** (never retried):
- no build at the end of the session;
- a blank render;
- broken assets;
- runtime errors;
- copy non-compliance;
- repeated tool misuse (3 blocked critic calls, or 3 tool-schema errors);
- provider refusal (after one retry).

**Process events (not failures):**
- spend stop (§5.2);
- loop cap reached, early stop and plateau, all of which lead to the re-rank (§5.4).

**Stimulus rule.** Each candidate's stimulus is its final artifact as executed. If no renderable build exists, the stimulus is a standard failure card ("This page could not be displayed"), rendered at 1440 × 900.

**Intention-to-treat.** Every candidate that was started is analysed. A sensitivity analysis excludes stimuli with any Class I event, spend stop or render flag. Failure, refusal and spend-stop rates are reported per arm.

### 5.10 Freeze, repairs and tuning ledger (CR5)

**Prompt registration (before any paid study-prompt call).**
- Every project prompt in Appendix A, every tool definition and the C1-H recipe are hashed and registered publicly. This happens before the first paid call that runs any study prompt (the cost probe) and before round R.
- Until then, edits are allowed only without observing any model output. Every edit is in git with signed commits.
- After registration, C1-H changes only through repairs.
- Harness development on engineering briefs has its own registry entry and dedicated keys. Every call is tagged and enters the tuning ledger.
- No paid run of a study recipe happens before the Monitor is contracted. If one does, it is counted as tuning in the ledger and disclosed.

**Freeze.** Before pilot generation, these are frozen by hash:
- the baseline prompts;
- the C1-H recipe;
- the tool definitions;
- the D3-auto prompts;
- the selector and judge prompts;
- the model profile;
- the renderer and the mirror rule;
- the Judge app build and the validity service;
- the release script;
- the primary-test function.

**Repairs.** C1-H may change only to repair a failure on this closed list: build error, crash, tool misuse, copy-deck non-compliance, render failure.
- **Logging:** each repair is logged with its diff, reason and author.
- **Classification:** it is classified as "repair, not tuning" under a registered checklist. The Monitor co-signs within 48 hours, and the deputy may act in the Monitor's place.
- **Which arms:** the Monitor decides which arms a repair applies to.
- **Cap:** repairs count against a cap of 5, fixed in Stage 0.
- **After pilot generation:**
  - the Monitor must classify a repair before anything is rerun;
  - a repair may not touch the article's verbatim prompts;
  - every repair is recorded in the Stage 0→1 diff table.
- **Beyond the cap:** no further repairs are allowed. The arm runs as frozen, and its failures are reported. If a registered check shows the arm is non-functional (Class Q in more than 50% of its pilot candidates), the pipeline pauses and a new Stage 0 version is filed with a public explanation.
- **Infrastructure fixes:** fixes to the mirror, renderer or harness that affect all arms equally are applied to all arms. They are logged, classified by the Monitor as "infrastructure" and counted separately.

**Tuning ledger.**
- The gateway tags every pre-lock call by arm, recipe hash and workspace, including engineering-brief runs.
- From those tags it generates the per-arm tuning ledger: iterations, tokens, dollars and hours.
- The ledger is published with the Stage 1, and Lab refuses to lock without it.
- Before IPA, any Playground or product run of a study recipe happens only in a logged workspace.

**Viewing pilot pages.** The team views pilot pages only for repair triage of failure-class cases. Every access is logged, and the log is published with the Stage 1.

## 6. Outcomes

### 6.1 Primary outcomes (each from a separate lay pool)

- **P1 quality:** "Which page looks better designed?" A two-alternative forced choice.
- **P2 distinctiveness:** "Which page looks more distinctive — less like other websites you've seen?" A two-alternative forced choice.

**Status of the two outcomes [D17].** P1 and P2 are the two primary outcomes that CR10 requires in the abstract, each reported with its effect size and CI. Inferentially, though, they are not equal:
- H1a (on P1) is the only primary hypothesis and the single gate.
- H2a (on P2) is a key secondary hypothesis, gated behind H1a.

The text never calls H2a "co-primary".

After each choice, the rater gives a 3-level confidence rating (exploratory).

### 6.2 Secondary outcomes

| ID | Measure | Prediction or role |
|---|---|---|
| S1 | Expert pairwise, with the P1 wording: "Which page looks better designed?" | FE: estimation only [D21] |
| S2 | Within-brief diversity: the Vendi score over the 4 candidates' text-masked fold renders, with a DreamSim kernel gated as below | C1-H > B-Plain; C1-H > B-Random; C1-H > −SEED (BH set, §9.7) |
| S3 | Cross-brief homogeneity within an arm: mean DreamSim similarity between pages for different briefs. Modal-font share and dominant-hue entropy are descriptive. | C1-H less homogeneous than B-Plain and than B-Random (BH set) |
| S4 | Held-out tells: the design-slop-cop count per page (pinned commit), on patterns that do not overlap the article's four-row catalog and that pass the detector gate | C1-H < B-Plain and C1-H < B-Random (BH set); no prediction for B-Skill or B-Outside |
| S6 | AI-judge panel verdicts (§7.7) | measurement validity only (RQ6) |
| S7 | Cost and time: tokens, dollars and wall-clock time per candidate; quality per dollar | descriptive (RQ7) |
| S8 | pick(C): a fresh Fable call ranks a brief's 4 final C1-H candidates. Does its top pick have above-median human-rated ability? | exploratory |

S5 (5-second clarity) is deferred to a later study (§6.5).

**DreamSim gate (rule fixed in Stage 0; run during Stage 1 review; result reported in Stage 2).** The Monitor runs it on development-brief pilot pages. About 600 odd-one-out triplets are each judged by 3 raters.
- DreamSim must match the human majority on at least 70% of triplets, and must also beat DINOv2, CLIP and a DOM-structure kernel. All versions are pinned in Stage 0.
- If it does not, the best kernel that reaches 70% is used instead.
- If no kernel reaches 70%, S2 and S3 become exploratory.
- The release reports only which kernel passed.

**Detector gate (rule fixed in Stage 0; run during review).**
- Two coders, blind to arm, label 150 development-brief pages drawn by a seeded draw.
- Each design-slop-cop pattern needs κ ≥ .70 to stay in S4.
- The pinned commit and its pattern count are recorded in Stage 0 (Appendix B.2).

### 6.3 Guardrails

**How they are tested.** Each guardrail is tested for C1-H as non-inferiority against B-Plain, one-sided at α = .025, with a brief-clustered CI. Other arms are reported descriptively. Guardrails are not adjusted for multiplicity: an adjustment would make "no flag" easier to obtain, which is the wrong direction for a safety check. A guardrail is flagged when non-inferiority is not shown.

**Margins.** These are proposed Stage 0 values; the Monitor approves them.

- **G1 render integrity** (binary, at 1440 px and 390 px). A page passes only if it has:
  - no uncaught errors;
  - no failed or unmirrored asset requests;
  - no horizontal overflow at 390 px;
  - the primary call to action visible above the fold;
  - no overlapping text.

  Margin: +10 percentage points of failure. Rationale: 10 more failing pages per 100 is about one more broken page in every batch of four a practitioner reviews. That is the smallest regression a user of the workflow would plausibly notice.
- **G2 accessibility:** axe-core critical and serious violations (WCAG 2.x A/AA tags), with contrast reported separately. Margin: +1 violation per page. Rationale: one extra critical or serious violation per page is the smallest change an accessibility audit would record as a regression.
- **G3 performance:** the Lighthouse median of 5 runs, with simulated throttling, on a fixed machine.
  - LCP margin: +1.0 s, which is 40% of the 2.5 s "good" LCP threshold [VERIFY].
  - CLS: an absolute cap of 0.10, the "good" threshold [VERIFY].
  - Page weight is reported.
- **G4 copy fidelity:**
  - Measures: the share of REQUIRED strings rendered verbatim, the count of added labels, any OCR text in generated images, and any invented numbers.
  - Margin: −5 points of REQUIRED compliance. Rationale: a deck has about 18–22 strings, so 5 points is about one missing REQUIRED string per page.

### 6.4 Fidelity and outcome-neutral checks (CR4, CR8)

Every check has a numeric threshold and a consequence applied by script.

**About the reason codes.** Some consequences attach a reason code to a verdict (§9.4); they never invent a new verdict. When a check fails:
- "No meaningful effect" is not allowed;
- "Supported" and "Worse" stand, because they remain valid intention-to-treat contrasts of the recipes as executed.

| Check | Threshold (Stage 0) | Consequence |
|---|---|---|
| Seed generated by a logged shell call | reported per arm | Descriptive |
| Seed string absent from the DOM and from images | 100% | A breach is a port rule 3 deviation. It is reported, and a sensitivity analysis excludes breaching stimuli |
| Critic inputs contain only the model view of one render, the critic prompt and the score line, with no threshold, code or brief | 100% (enforced by the gateway) | The call is blocked and logged |
| No Fable calls in CRITIC-self's loop; no critic tool in the baselines | 100% | Checked from the configuration before the run; otherwise the lock refuses to run |
| Cache isolation: no cache reads across workspaces (from usage logs); no replay or memoized response for any generation call | 100% | Otherwise the run halts as a Class I fault |
| Within-arm independence: no two candidates in the same arm × brief share a first-response hash; final-DOM duplicates are counted | 100% for first responses; final-DOM duplicates reported per arm | A duplicate first response halts the run as a suspected cache fault, and the affected candidates get the Class I retry. Final-DOM duplicates are kept (ITT), and a sensitivity analysis drops them |
| Loop manipulation: at least 2 critic calls in loop-arm candidates | ≥ 80% of loop-arm candidates | Below this, H3a, H3b, E3a and E3b cannot give "No meaningful effect"; reason code "manipulation check failed" |
| ASSET integrates at least 1 generated image | ≥ 80% of ASSET candidates | Below this, H3c and E3c cannot give "No meaningful effect"; same reason code |
| Image-tool use in arms without ASSET | reported | Descriptive |
| Non-zero DOM difference between −D3 and C1-H | ≥ 50% of candidates | Below this, H3d and E3d cannot give "No meaningful effect"; same reason code |
| REQUIRED-string compliance | median ≥ 95% per arm | Below this, the arm is flagged. ITT remains the primary analysis, with a sensitivity analysis that excludes non-compliant stimuli |
| Gold accuracy among retained raters, pooled per pool | ≥ 90% | 80–90%: reported, plus a sensitivity analysis excluding sessions with any gold failure. Below 80%: rating pauses automatically. The Monitor may only fix a technical defect in a gold item, or resume unchanged; no rule may change. Paused-window data are kept, with a sensitivity analysis that excludes them |
| Positive control PC1 and PC2 [D20] | win ≥ .70, and 95% CI lower bound > .58, in each pool | If PC1 fails, no F3-EQ claim may read "No meaningful effect" (reason code "sensitivity check failed"). If PC2 fails, a non-rejection of H2a, H2b, H4b, H4d or H3e carries the same reason code |
| A/A arm (pilot) | the 95% CI contains .50 | Otherwise the Monitor runs a registered checklist: side randomization, scheduler balance, ID leakage, render differences, viewer defects. After a fix, the A/A ratings are re-run on pilot pages. Stage 1 is not submitted until the A/A passes, or until the Monitor certifies the cause and the fix in the Stage 1 |
| Recognition probe | hit rate reported | Correctly named briefs are re-fictionalized (§4.3) |
| Unmirrored requests | per-arm rate, seen by the Monitor | If any arm has unmirrored requests in more than 5% of pilot candidates, the Monitor triggers an all-arm mirror repair before Stage 1 |
| WebGL failures, blank canvases, refusals, spend stops | reported per arm | Descriptive; included in the sensitivity analysis of §5.9 |
| Rater blinding check | reported | Descriptive |

Critic validity (§5.7) is a descriptive measurement, not an outcome-neutral check.

### 6.5 Measures not used, and measures deferred

- **No AI-detection measures.** There is no AI-detector score and no "looks AI-made" or "looks like a template" question (port rule 8). The lay "looks AI-made" item (S2 in measures.md) is dropped.
- **Loop-internal data are not outcomes.** The loop critic's scores and counts against the article's TELLS catalog are process data. Catalog-overlap counts serve only as a manipulation check on D3-auto.
- **Deferred to a later study:**
  - S5, 5-second clarity: it needs its own viewer, a pool and answer options written by the copywriter;
  - PPI estimates;
  - pointwise AI-judge scores;
  - distractor-injection probes.
- **Exploratory only:**
  - quality-weighted Vendi, defined as the mean candidate quality times the Vendi score [VERIFY definition], with quality equal to the candidate's lay P1 win share;
  - the Bayesian Bradley–Terry model (§9.6);
  - emergent tells mined from pilot outputs;
  - Impeccable `detect`;
  - UIClip;
  - confidence ratings;
  - S8.
- **Dropped:** connectivity pairs. Every contrast involves C1-H, so the comparison graph is already connected.
- **No calibration gallery for the distinctiveness pool.** A gallery of plain-prompt pages would anchor "generic" on B-Plain's look.

## 7. Raters

### 7.1 Lay pools

- **Recruitment:** Prolific, with these filters:
  - desktop or laptop only, checked in the study with a window of at least 1280 px;
  - approval rate of at least 98%;
  - fluent English;
  - a country set to be decided [D8].
- **Two pools:** quality (P1) and distinctiveness (P2). Each rater joins one pool for one session.
- **Planned size at 72 briefs [D18], with D1 option (b), D19 and D20 as recommended:**
  - the P1 pool covers 10 contrasts plus PC1, and the P2 pool covers 5 plus PC2;
  - 24 valid judgments per brief-contrast;
  - 576 judgments per positive-control set;
  - about 27,000 primary judgments, or about 1,040 sessions at 26 experimental trials, and about 1,400 sessions with a 35% allowance [PILOT];
  - B-BoN adds one P1 contrast (about 1,730 judgments).

### 7.2 Session, viewer, schedule and custody

**Session:**
- budgeted at 30 minutes until the timing pilot;
- 4 fixed check items (§7.4) plus experimental trials;
- the number of experimental trials is set from pilot timings [PILOT]; the planning value is 26.

No rater sees any brief more than once in a session. No rater does more than 6 trials of one contrast. The simulation shows that 3 or 6 judgments per rater per contrast make no material difference: type I error was .053 and .051 respectively for the two-way test, at 48 briefs (power_sim3 T1).

**Viewer:**
- First, a side-by-side overview of the two folds.
- Then a full-page review of one page at a time at full width, with a Flip toggle (the default) and the scroll position kept in sync across Flip. There is also click-to-zoom.
- Voting unlocks only after both pages have been scrolled to the bottom and at least 8 s have passed.
- Sides and trial order come from the pre-generated schedule and are logged.
- Before the freeze, a usability and timing check with 20 people on engineering briefs may adjust layout parameters. It carries no effect information.

**Schedule (pre-generated).** Before rating starts, the Monitor's script generates the full ordered schedule of trial slots for each brief-contrast: pairings, sides, gold placement and the replacement slots, up to 1.5× the planned number. A named drand round seeds it, and its hash is registered. Replacements consume the next slots in order. In reconciliation, the Monitor checks the executed schedule against the registered one.

**Pairing allocation:**
- **Unmatched contrasts:** the 24 judgments cover the cyclic pairings (candidate i of arm A with candidate (i + c) mod 4 of arm X):
  - the four cycles c = 0–3, each once;
  - two further cycles drawn by the seeded schedule.

  Each candidate therefore appears exactly 6 times. This matches power_sim3.
- **Matched contrasts:** each of the 4 lineage pairs appears 6 times.

**Extras:** 5% repeated pairs, to measure reliability.

**Ratings custody (CR6).**
- **In the browser:** each response is encrypted to the Monitor's key. The Judge server stores only ciphertext plus fields that carry no direction: timings, scroll completion, and focus, visibility and paste events.
- **Validity service:** a small service runs registered code (its hash is in the lock manifest) on infrastructure the Monitor controls. It decrypts responses, computes gold accuracy and exclusion flags, and returns only valid counts per brief-contrast and pairing cycle to the scheduler.
- **Build check:** the Judge app's build hash is in the lock manifest. The Monitor verifies the deployed bundle at the start of each rating window.
- **What the team cannot do:** link a response to its content. As §4.7 notes, the team can still link stimuli to arms by content. This is stated in the Stage 1.

### 7.3 Screening, consent and pay

**Screener (CR8):** raters must have no paid, equity, customer or competitor tie to the sponsor, and must not be product users.

**During the session (CR8):**
- raters are told not to use AI tools;
- focus, visibility and paste events are logged;
- an end-of-session blinding check is asked.

**Consent:**
- names the commercial sponsor (CR14);
- states the purpose, duration, pay, the right to withdraw, and that de-identified ratings will be openly released;
- (recommended) states that all pages were generated with AI tools [D8].

**Pay:**
- $15 per hour, based on timed pilot sessions [PILOT]; anyone underpaid is topped up.
- Budgeted at 30-minute sessions, and at Prolific's corporate fee of 42.8% [VERIFY], because CR14 requires the account type to match the payer.

### 7.4 Check items and exclusions (by script, on opaque IDs, before unblinding; CR8)

**Check items (4 per session; built by the independent designer from pages outside the study; frozen by hash in Stage 0):**
- **P1 pool:**
  - 3 gold trials. Each pairs an intact, professionally designed page with the same page carrying obvious preregistered defects (overlapping text, broken images, an unstyled section). The keyed answer is the intact page.
  - 1 instructed-response item.
- **P2 pool:** 4 instructed-response items whose keyed answer does not depend on judging distinctiveness:
  - 2 image pairs in which both pages display "For this pair, choose the page on the [left/right]";
  - 2 text items.
- Gold stimuli are disjoint from the positive-control pairs and the critic-validity exemplars. They are never taken from any arm's output.

**Exclusion.** A session is excluded if any of these holds:
- 2 or more of the 4 check items were failed;
- the same side was chosen in more than 90% of trials;
- the page was hidden or the window unfocused for more than 30% of trial time;
- a paste event occurred;
- the screener showed a conflict;
- the rater reported using AI tools.

The validity service computes the flags. Payment decisions follow Prolific's own attention-check policy, separately from exclusion.

### 7.5 Replacement

Recruitment continues until every brief-contrast has 24 valid lay judgments (8 for experts). Replacements consume the next slots of the pre-generated schedule. Recruitment is capped at 1.5× the planned number. If the cap is hit, the analysis uses what exists, and the shortfall is reported as a deviation.

### 7.6 Experts [D21]

**Panel:** 20 professional designers.
- At least 3 years in UI, web or brand design, with a verified portfolio.
- Recruited by one third-party vendor, from outside the team's network. The same vendor recruits the independent designer, the detector coders and the Study 1b operators; the designer may also serve as one detector coder.
- Screened as in §7.3, and file ICMJE-scope disclosures (CR14).
- Recruitment and disclosures are complete before the generation date.
- Whether each expert has read the article is recorded. A sensitivity analysis excludes those who have.

**Question:** the P1 wording, so that lay and expert results answer the same question.

**Workload:**
- 8 judgments per brief-contrast, on 4 contrasts (HE1, HE2, HE4, HE5), across 72 briefs.
- That is 2,304 judgments in total, about 115 per expert, about 3 hours each, split into 2–3 sessions [PILOT].
- Plus 300 judgments on the sealed validation pairs (§7.7).

**Pay:** $90 per hour, fixed and not tied to results. Experts use the same viewer as lay raters.

### 7.7 AI judges (validated secondary outcome; CR8, CR12)

**Panel:**
- GPT-5.6 Sol;
- Gemini 3.1 Pro, by stable ID (if only a preview exists at the Stage 1 manifest, the newest stable Gemini Pro);
- one open-weight vision model, pinned through OpenRouter, named and hashed in Stage 0.

Claude Fable 5.1 runs separately as a labelled self-preference probe, never as part of the panel. The held-out list is fixed at the lock (see Independence below).

**Procedure:**
- Judges see the model view of both pages: page A's tiles, then page B's.
- Their prompts are frozen, use the human question wording, and differ from every in-loop prompt (A.15).
- Each pair is judged in both orders, and an order-inconsistent pair counts as a tie.
- 8 pairs per brief-contrast are judged, drawn by a seeded draw.
- Judge outputs, for the pilot and the confirmatory run, are encrypted to the Monitor (§4.5).

**Independence:**
- Prompts are frozen before the pilot, without tuning on study labels.
- Stage 0 defines exposure granularity, with the Monitor's co-signature [D22]: whether exposure is counted per provider family or per model line and role.
- The current exposure register is timestamped now.
- The list of held-out judges is fixed at the lock and is not reopened at analysis time (CR12).

**Sealed validation set:**
- 200 pairs are drawn from the confirmatory pair pool by a round named in the Stage 1 manifest.
- Each pair gets 5 extra lay judgments per pool, and 100 of the pairs also get 3 expert judgments.
- These labels stay encrypted to the Monitor until the judges' outputs are frozen.

## 8. Sampling plan and power

**Source.** power_sim3.py: 4,000 replications per cell, and 480–960 per cell for the mixed model.
- It was written by Claude (an AI research pass), not by a human statistician.
- It currently sits in a session scratchpad. Before Stage 0 it is committed to docs/research/2026-10-06-harness-research/, together with its output table, its results JSON and their hashes (CR14).
- Before Stage 0, the Monitor or the CR9 statistician reruns the table below.

**Variance components (planning assumptions).** No published variance components exist for agent-built landing pages (study1-draft). The values below are explicit assumptions with no empirical source:
- brief × arm SD .5 (logit);
- candidate SD .8;
- lay rater SD .5;
- expert rater SD .3;
- lineage correlation .6;
- K = 4;
- 3 judgments per lay rater per contrast.

The pilot release re-estimates them.

**Plan:**
- 72 confirmatory briefs (12 strata × 6) [D18] plus 12 development briefs;
- 24 valid lay judgments per brief-contrast in each pool;
- 20 experts × 8 judgments per brief-contrast;
- fixed N: no optional stopping and no interim looks.

**Simulated power.** The figures below are for the two-way cluster-robust test of §9.1 (equivalence and non-inferiority use the brief-level CI; see the note below the table), with J = 24 and the planning components. Each figure is in the predicted direction, at the family's worst-case Holm α. They replace v1's interpolated figures.

| Test | α | True win | 60 briefs | 72 briefs |
|---|---|---|---|---|
| H1a gate | .05 | .58 | .95 | .98 |
| F1, 4 tests (with H1c) | .0125 | .58 | .87 | .92 |
| F1, 3 tests (without H1c) | .0167 | .58 | .89 | .93 |
| F2, 5 tests | .01 | .58 | .85 | .91 |
| F2, 4 tests | .0125 | .58 | .87 | .92 |
| F3, matched, 4 tests | .0125 | .58 | .90 | .95 |
| F3-EQ, ±.08, Holm over 4 claims (TOST at .0125) | — | .50 | .88 | .95 |
| F3-EQ sensitivity, ±.06, Holm over 4 claims | — | .50 | .46 | .63 |
| F4: H3e | .05 | .58 | .95 | .98 |
| F4: H3f, non-inferiority (bound .42, one-sided .025) | — | .50 | .95 | .98 |
| F4, both (union bound) | — | — | ≥ .90 | ≥ .95 |
| Experts (20; df 19), unmatched / matched | .05 | .58 | .72 / .72 | .79 / .77 |
| Experts, Holm over 4 | .0125 | .58 | .48 / .50 | .56 / .55 |
| Experts, Holm over 4 | .0125 | .62 | .90 / .89 | .94 / .93 |
| Any lay test when the true win rate is .55 (unmatched) | .05 | .55 | .62 | .70 |

**Notes on the table:**
- The equivalence and non-inferiority rows used the brief-level CI, not the two-way CI. They are rerun with the two-way CI before Stage 0 (Appendix B.2).
- The expert rows show why FE is estimation only [D21]: at the SESOI and its Holm level, expert power is about .5.
- A lay test is underpowered by design for a true win rate of .55.

**If power falls short after the pilot.** With N fixed [D18], the Monitor reruns the simulation with the released components, and the Stage 1 reports the achieved planning power for every confirmatory test. No test is added, dropped or moved because of it. Whether the venue requires a minimum power per test is settled under D4 before Stage 0.

**Planning shortcut (not a decision method).** These formulas approximate the simulated SD of per-brief win proportions:
- matched: SD ≈ √(.126² + .218/J);
- unmatched: SD ≈ √(.140² + .195/J).

They were fitted to the simulated values at J = 16, 24 and 32 and reproduce them to within .001 (for example, .167 unmatched and .158 matched at J = 24). Approximate power is P(noncentral t, df = B − 1, ncp = √B × (win − .5) / SD > t_crit).

**If the user keeps the 60/72 rule instead of fixing 72 [D18]:**
- The single decision method is a simulation rerun by the Monitor with the released components. The threshold is matched-ablation power below .90 at win .58 and α .0125.
- The feasibility review reports that at the planning values this rule would choose 72 with probability about .44 from pilot noise alone. This is from the review's own simulation and has not been reproduced here [VERIFY].

**Corrections to earlier drafts:**
- The study1-draft expert figure (.90 at win .62) used an 800-rater pool and a brief-only test. At 48 briefs, the two-way test gives .86 at α .0167 with 20 experts.
- For a shared expert panel, the brief-only t-test is badly liberal (type I error .07–.16). The brief-level t-test is slightly liberal at small α.
- v1's F1 and F2 figures were interpolated from the brief-level test. They are replaced above.

## 9. Analysis plan

### 9.1 Estimand and primary test (every human pairwise contrast, lay and expert)

This text is the normative definition. The registered function must match it:
- The Monitor certifies the match before Stage 0, and CODECHECK certifies it before Stage 2.
- A mismatch found before unblinding is fixed in the code.
- A mismatch found after unblinding is reported as a deviation, with both results shown.

**Estimand.** θ is the probability that a randomly chosen eligible rater prefers a randomly chosen candidate of arm A over a randomly chosen candidate of arm X. For matched contrasts, the X candidate is the same-lineage partner. Each brief is drawn from the eligible frame with the 12 strata equally weighted. The probability averages over screen sides.
- The eligible rater population is the screened Prolific population for that pool, or the screened expert panel for experts.

**Estimator.** Each valid judgment i is coded y_i = 1 if the rater chose arm A's page.
- p̂_b is the share of valid judgments in brief b that chose arm A.
- θ̂ = (1/B) Σ_b p̂_b, where B is the number of briefs. Each brief has weight 1/B, even when replacement caps leave a cell short.

**Variance (two-way cluster-robust, Cameron–Gelbach–Miller).** Let a_i = (y_i − θ̂) / (B · n_b(i)), where n_b(i) is the number of valid judgments in judgment i's brief. Then:
- V_brief = B/(B − 1) · Σ_b (Σ_{i in b} a_i)²
- V_rater = R/(R − 1) · Σ_r (Σ_{i by r} a_i)², where R is the number of distinct raters in the contrast
- V_int = Σ_i a_i². Each brief × rater cell holds one judgment per contrast, and the scheduler enforces this.
- V = V_brief + V_rater − V_int. If V ≤ 0, then V = V_brief.

**Test and CI.**
- t = (θ̂ − .5)/√V, referred to a t distribution with df = min(B, R) − 1. For lay contrasts df = B − 1; for experts df = 19.
- p is two-sided. The CI is θ̂ ± t(df, 1 − α/2) √V.

**Link to the brief-level test.** V_brief equals the variance of the brief-level t-test. With equal n_b, the whole formula reduces to power_sim3's implementation; this has been checked algebraically and must be confirmed by the Monitor.

**Direction.** Tests are two-sided, and support requires the predicted direction (§2).

**Why this test (power_sim3, T1):**
- It holds type I error at .041–.058 in every simulated scenario, including the shared expert panel.
- For lay data, it costs only about .005–.01 power relative to the brief-level t-test.
- GEE gives the same estimate, but its default z-test is liberal (.058–.066).
- The crossed mixed logistic gains no power, and its rater variance collapses toward 0 on lay data.

### 9.2 Multiplicity

Gatekeeping and families are as in §2. Holm uses the two-sided p-values from the primary test.

### 9.3 Equivalence, non-inferiority and the SESOI [D5]

**Equivalence (F3-EQ):** two one-sided tests per claim at the Holm-adjusted level α′, using the same SE and df. The (1 − 2α′) CI must lie inside .50 ± Δ.

**Non-inferiority (H3f):** the lower bound of the 95% CI must exceed .50 − Δ.

**SESOI: Δ = .08 on the win-rate scale, declared as a resource-based SESOI (Lakens 2022) [VERIFY].** The rationale was written before any data:
1. **Basis:** .08 is the smallest effect this design can detect with power of at least .90 at every worst-case Holm level in F1–F3, at 72 briefs (§8). The paper calls it a resource-based choice, not a claim that smaller effects do not matter.
2. **Context only:** a win probability of .58 lies between Vargha and Delaney's small (.56) and medium (.64) benchmarks for the probability of superiority [VERIFY].

**Safeguards against calling a real effect negligible** (the risk CR4 names: a block with a true win rate of .57):
- A "No meaningful effect" verdict reads "any effect is smaller than .08", never "no effect".
- Every equivalence test is repeated at ±.06. The two results are reported side by side in the abstract and in the product-consequences table.
- No product default may be dropped or demoted on a "No meaningful effect" verdict unless equivalence also holds at ±.06 (§9.11).
- CIs are always reported.

Block-specific margins were considered. They are not adopted, because no pre-data estimate of each block's value exists (D5).

### 9.4 Verdicts (CR11 vocabulary, computed by script)

**Verdicts, applied in this order:**

| Verdict | Rule |
|---|---|
| Untested | The contrast's family was not tested (gate not passed), or the contrast is in no tested family |
| Supported | Superiority rejects in the predicted direction. For F4, the intersection–union test rejects. |
| Worse | Superiority rejects in the opposite direction. For F4, H3e rejects in the opposite direction. |
| No meaningful effect | F3 only: equivalence is shown and superiority does not reject, and no manipulation, sensitivity or positive-control check blocks it (§6.4) |
| Inconclusive | Anything else, with a reason code: "not significant", "manipulation check failed", "sensitivity check failed" or "trade-off" |

**F4 partial outcomes.** The SEED verdict is reported with the two component results beside it:
- H3e supported and H3f non-inferiority shown: Supported.
- H3e supported, H3f not shown, and H3f's two-sided test not rejecting: Inconclusive ("not significant").
- H3e supported, but H3f's two-sided test rejecting with C1-H worse on quality: Inconclusive ("trade-off"). The fixed sentence is "SEED made pages more distinctive but lowered rated quality".
- H3e rejecting in the opposite direction: Worse.
- Otherwise: Inconclusive.

**Magnitude flag** (on every verdict except Untested, computed from the 95% CI):
- "at least Δ": the CI lies entirely at or beyond .50 ± Δ in the estimate's direction;
- "below Δ": the CI lies inside (.50 − Δ, .50 + Δ);
- "Δ not excluded": anything else.

Two cases use the flag:
- Superiority supported with the CI inside ±Δ reads "Supported; magnitude: below Δ".
- Worse with the CI inside ±Δ reads "Worse; magnitude: below Δ".

**Charter status.** The five verdicts are CR11's vocabulary, unchanged. The magnitude flag and the reason codes are extra computed fields, which need a charter-interpretation ADR co-signed by the Monitor (D10).

**Experts [D21]:** expert contrasts carry "Estimate only" and no verdict.

### 9.5 Robustness and sensitivity

All of these are preregistered. The primary test decides.
1. A brief-level one-sample t-test on per-brief win proportions.
2. A sign-flip randomization test at brief level (10,000 flips, seeded).
3. A crossed mixed logistic model, run by the Monitor in R with lme4::glmer (Laplace approximation; R and lme4 versions pinned):
   - win ~ 1 + left_position + (1|brief) + (1|candidate_A) + (1|candidate_X) + (1|rater);
   - matched contrasts replace the candidate terms with (1|lineage);
   - if the model fails to converge, terms are dropped in this order: rater, then candidate effects.
4. ITT versus excluding stimuli with a Class I event, spend stop or render flag (§5.9).
5. A controlled-direct-effect analysis for raster images. This is not a robustness check of the total effect: ASSET exists to add images, so image presence is a mediator.
   - Model: the GLMM in item 3, plus an indicator for "a generated raster image is present on A's page minus on X's page".
   - It cannot change any verdict.
6. Excluding experts who had read the article.
7. Equivalence tests repeated at ±.06.
8. Excluding final-DOM duplicates, seed-string breaches and non-compliant stimuli (§6.4).
9. If gold accuracy falls between 80% and 90%: excluding sessions with any gold failure.

Any disagreement with the primary test is reported.

### 9.6 Bayesian analysis (exploratory)

A hierarchical Bradley–Terry model is fitted over all arms in brms/Stan, using all judgments.

**Model:**
- arm abilities N(0, 1), with B-Plain fixed at 0;
- half-normal(0, 1) priors on the brief × arm and candidate SDs;
- a position effect;
- 4 chains.

**Convergence:**
- R-hat < 1.01;
- bulk and tail ESS > 400;
- zero divergent transitions after warm-up.

If these fail, the model is rerun once with doubled iterations. If it still fails, non-convergence is reported.

**Reported:** posterior win probabilities against C1-H, P(win > .5) and the share of the posterior inside .50 ± Δ. It never decides a hypothesis.

### 9.7 Secondary outcomes

**The Benjamini–Hochberg set** (q = .05; all two-sided, with the predicted direction stated):

| ID | Contrast | Statistic and test |
|---|---|---|
| S2a | C1-H > B-Plain | within-brief Vendi, paired by brief; Wilcoxon signed-rank |
| S2b | C1-H > B-Random | as S2a |
| S2c | C1-H > −SEED | as S2a |
| S3a | C1-H less homogeneous than B-Plain | arm-level mean cross-brief DreamSim similarity. Brief-level permutation test: in each of 10,000 seeded permutations, the two arms' labels are swapped for all 4 candidates of a brief with probability .5 |
| S3b | C1-H less homogeneous than B-Random | as S3a |
| S4a | C1-H fewer tells than B-Plain | negative-binomial GLMM, fitted on C1-H, B-Plain and B-Random with a random intercept for brief; Wald z-test of the contrast |
| S4b | C1-H fewer tells than B-Random | as S4a |

**Gate dependence.** S2 and S3 use the kernel chosen by the DreamSim gate. If no kernel passes, S2 and S3 leave the set and become exploratory. S4 counts only patterns that pass the detector gate.

**Guardrails G1–G4:** §6.3.

**Exploratory:**
- S8;
- moderators (stratum, tone, source, raters' design experience);
- confidence ratings;
- quality-weighted Vendi;
- the Bayesian model;
- the global ranking.

### 9.8 Experts [D21]

**Estimation only.** For HE1, HE2, HE4 and HE5, the experts' θ̂ and 95% CI come from the same two-way computation, clustered by brief and expert, with df = 19. No verdict is attached.

**Also reported:**
- the rater-type × contrast interaction (do experts and lay raters differ on any contrast?);
- agreement between the lay and expert panels.

Lay and expert data are never pooled.

### 9.9 AI judges (RQ6)

**Every judge is reported (CR8)**, including the Claude probe, with a validity flag that a script computes against the sealed validation set. No judge is dropped, and none is cited as corroboration.

**Validity thresholds** (Stage 0; per judge and outcome):
- position consistency ≥ .80;
- an alternative-annotator-test winning rate ≥ .50, at ε = .10 against lay raters and ε = .20 against experts.

Item-level agreement with the leave-one-out human majority is reported beside the agreement between humans.

**Bias probes** (computed from existing data; no extra calls):
- position bias;
- self-family preference (the Claude probe);
- OpenAI-image preference: whether GPT's disagreement with humans varies with the presence of generated raster images on either page.

All AI-judge results stay with the Monitor until unblinding.

### 9.10 Blind and independent analysis (CR6, CR9)

**Frozen code:**
- The primary-test function is frozen by hash in Stage 0.
- The full analysis code, covering every registered analysis, is tested on data simulated by power_sim3.py. The Monitor also runs it on the pilot with scrambled labels.
- Its hash is registered in the Stage 1, before IPA. Any later change is a declared deviation.

**Analysis sequence.** The Monitor, or a statistician they contract under the same independence test:
1. receives the data freeze, keyed by opaque IDs;
2. applies the exclusions by script;
3. applies the arm map;
4. runs the registered code;
5. deposits a signed results report with a DOI. The report covers every registered analysis in registered order: primary, secondary, guardrails, robustness, Bayesian and AI-judge.

Only after the DOI exists does the Monitor release the unblinded data to the authors, and only then do they draft the Discussion. Any gap between the report and the paper is a declared deviation.

**Sign-off.** A non-conflicted guarantor signs the ICMJE data-access and responsibility statement. The guarantor is a different person from the Monitor and the deputy [D7]. Before Stage 2, the pipeline gets a CODECHECK certificate or an equivalent independent reproduction.

### 9.11 Reporting and the claims tables (CR10)

**The Stage 1 contains three tables.** Drafts are below; they are finalized once D1, D5, D6, D17–D21 and D24 are decided.
- **(a) Study design and results-to-claims:** for every hypothesis, the question, the hypothesis, the sampling plan and power, the test and α, the decision rule, the interpretation of every verdict, and the exact abstract sentence.
- **(b) Product consequences [D24].**
- **(c) Results shell:** every registered outcome, in registered order.

**Sentence templates.** The script fills in every verdict from these templates:
- **Supported:** "Lay raters preferred [first arm] pages over [comparison] pages on [outcome] (win rate θ̂, 95% CI [l, u]; magnitude: [flag])."
- **Worse:** "Lay raters preferred [comparison] pages over [first arm] pages on [outcome] (θ̂, 95% CI [l, u]; magnitude: [flag])."
- **No meaningful effect (F3 only):** "Removing [block] changed lay quality judgments by less than .08 in win rate (θ̂, CI [l, u]); a change of .06 [was / was not] excluded."
- **Inconclusive:** "The data do not establish whether [comparison] differs on [outcome] (θ̂, 95% CI [l, u]; [reason])."
- **Untested:** "[Comparison] was not tested because the gate (H1a) was not passed; the estimate θ̂ (95% CI [l, u]) is reported without inference."
- **Experts:** "Expert designers chose [first arm] in θ̂ of judgments (95% CI [l, u]); this is an estimate, not a test."

**Lead sentence of the abstract:**

| H1a | Lead sentence (always followed by the P2 sentence) |
|---|---|
| Supported | "In a controlled test of a headless variant of the article's workflow with AI stand-ins for its human finishing steps (C1-H), lay raters preferred C1-H pages over plain-prompt pages (θ̂, CI; magnitude)." Then the H1c sentence: "The article-demonstrated steps alone (seed, critic loop, images) were [verdict sentence]." |
| Inconclusive | "Lay raters did not reliably prefer C1-H pages over plain-prompt pages (θ̂, CI). Comparisons with the other baselines were therefore not tested." |
| Worse | "Lay raters preferred plain-prompt pages over C1-H pages (θ̂, CI)." |

**The P2 sentence:**
- If H1a is supported, it is the H2a verdict sentence.
- If H1a is not supported, it is fixed: "Distinctiveness estimates (θ̂, CI) are reported without inference and do not support a claim that C1-H pages are more distinctive." This applies whatever H2a's CI shows.

**Further fixed rows** (the claims table also covers these):
- **Each F2 contrast:** the template, labelled "comparators from outside the article".
- **Lay–expert disagreement:** "Expert estimates [agreed / differed in direction] for [contrast]; experts were not tested."
- **H1a not supported, H3d Worse:** "The AI stand-ins for CUT and TELLS lowered rated quality."
- **S8:** "Exploratory: the critic's own top pick was [above / not above] median human-rated quality."

**The abstract also states:**
- that verdicts outside H1a carry family-wise control only;
- the arm name "C1-H".

**Example pages.** Pages shown in figures, press and launch posts are drawn with a seeded draw (§4.2), or their selection ratio is stated (CR11).

**Also reported:**
- a HEDS sheet;
- a CONSORT-style rater flow (recruited, excluded, analysed);
- cost per arm;
- the deviation table;
- the verification log (Appendix B.3);
- the team's access log for pilot renders.

## 10. Pilot under CR4

**Registration and timing:**
- A registry entry (CR3) is filed before the first paid call. The gateway and the Judge app refuse to spend without one.
- **Stage 0 is filed before pilot generation starts.** This is stricter than CR4's minimum, which is "before pilot unblinding".

**Before the pilot** (engineering briefs only, each with its own registry entry, all logged):
- a cost probe across all arms at K = 4 on 2–3 engineering briefs (about $0.3–0.5k, estimate);
- spike tests:
  - byte-identical forks with thinking blocks, across workspaces;
  - model-view tiles accepted and legible;
  - refusals;
  - WebGL and the controlled clock;
  - automatic tool choice with structured outputs;
  - per-request image limits;
- a one-day load test at confirmatory concurrency;
- a 20-person viewer usability and timing check;
- the B-Outside owner's dry run and conformance run.

None of these uses development briefs.

**Design:**
- the 12 development briefs, sealed until the release;
- every arm (including B-Skill, B-Outside and B-BoN, as decided), plus the A/A arm;
- K = 4;
- the same sandbox backend as the confirmatory run.

The pilot is a full dry run of the pipeline: escrow, the Judge app, the validity service, the exclusion script and the Monitor's analysis on scrambled labels.

**Ratings:**
- about 1,500 lay judgments (each contrast × 12 briefs × 8, in both pools);
- 3 experts for about 1 hour each, for timing only.

The DreamSim triplets (about 600 × 3 raters), the detector coding and the critic-validity run happen during Stage 1 review, not before it.

**Custody:**
- Pilot ratings are encrypted to the Monitor in the rater's browser, as in §7.2.
- Only the Monitor runs registered outcome metrics (S2–S4, G1–G4) and AI judges on pilot outputs, using frozen evaluation-side code. The results are encrypted to the Monitor.
- The team views pilot pages only for repair triage, and every access is logged (§5.10).

**What the Monitor releases.** The release script is frozen, and its hash is registered in Stage 0. It releases only:
- variance components and the SD of per-brief win rates, pooled over unmatched contrasts and over matched contrasts;
- per arm: cost, tokens, timings, Class I and Class Q failure rates, retry, refusal and spend-stop rates;
- judgment timings;
- gold-pass and exclusion rates;
- copy compliance and render-flag rates, pooled across arms;
- the list of unmirrored hosts and packages, pooled with no arm labels;
- the A/A pass or fail;
- the recognition-probe hit rate.

**Never released to the team before Stage 1 is published:**
- any arm-level or contrast-level win rate, direction, or per-contrast variance;
- per-arm outcome metrics;
- AI-judge results.

**Route to the journal.** The Monitor sends the sealed arm-level pilot report directly to the handling editor, as confidential material; the authors never handle it. Pre-submission (D4) asks whether reviewers can put effect-dependent remarks in a confidential section, so that only the requested change reaches the authors. Any revision motivated by a pilot effect is recorded in the diff table, attributed to the quoted request.

**What may change between Stage 0 and Stage 1 (closed list).** Only these quantities may depend on the pilot:
- per-candidate spend caps;
- B-BoN's N;
- experimental trials per session, and pay;
- the replacement allowance;
- expert hours;
- the AI-judge budget;
- the spending ceiling;
- the brief count, only if the user keeps the 60/72 rule [D18].

Any other change needs a written reason and the Monitor's co-signature, and is flagged "non-listed" in the diff table. Changes to hypotheses, directions, families, gatekeeping, the SESOI or the primary test are barred, unless the editor or a reviewer requests them; the request is quoted in the diff table.

Pilot data never enter a confirmatory analysis.

**CR3 versus CR4 [D11].** CR3 makes pilot results due within 90 days. CR4 keeps arm-level pilot effects from the team until Stage 1 is published. The proposed reading:
- within 90 days, the Monitor deposits the sealed pilot report with a public, timestamped hash and posts all nuisance parameters;
- the arm-level report becomes public when Stage 1 is published or at 12 months, whichever comes first.

This is decided as an ADR co-signed by the Monitor before any pilot spend.

## 11. Integrity safeguards (CR1–CR14)

| Rule | Study 1 implementation | When | Enforced by |
|---|---|---|---|
| CR1 Monitor | A paid methodologist who is not an author. **Contract (published) gives all six CR1 powers:** key custody; the only view of pilot and interim effects; the confirmatory analysis; co-signature on deviations and claims; read access to the registry, archive and ledger; a right to post results plus a dissent that survives the company. **Also in the contract:** a signed independence attestation (no equity, options, advisory or paid product role, or beta access); termination only for cause, with a public reason; on termination, keys pass to the deputy, never to the team; a scope of work with an hours estimate (80–150 h, feasibility-review estimate), priced to match. A yearly integrity report is published, and a replacement is a public registry event. **Three different people:** the Monitor, a deputy key-holder who is not an author (or the third-party key-escrow holder), and a non-conflicted guarantor [D7]. Scripted rules replace on-call discretion (§5.8, §5.10), and the deputy may act on all of them. | before any pilot spend (target 2026-11-15) | contract; system access |
| CR2 RR only | Venue fixed by ADR before Stage 0, after the editor answers in writing on escrowed generation and power rules (D4); no non-RR route; Stage 1 public on acceptance; retirement handled by escrow and §15.3 | before Stage 0 | the journal |
| CR3 Registry | **Rule:** every paid model call or rater round has a live entry whose phase permits it. **Entries:** harness development on engineering briefs (cost probe, spikes, load test, viewer check); B-Outside dry and conformance runs; the recognition probe; the pilot; the expert timing pilot; DreamSim triplets; detector coding; the critic-validity run; drift canaries; bridging checks; the confirmatory study; AI-judge runs; Study 1b. Results deadlines apply, and the denominator is reported. D11 is decided before any pilot spend. | before each spend | gateway and Judge gates; Monitor audit |
| CR4 Stage 0 | **Contents:** hypotheses and directions; the primary-test definition (§9.1) and function hash; gatekeeping; the SESOI rationale; all numeric thresholds; exclusion, replacement, check-item and positive-control specifications; the baseline prompts verbatim, or their hashes under D2; the retirement contingency and successor rule; the release-script hash; the closed list of pilot-dependent quantities; the irrevocable CR13 commitment and licence. **Afterwards:** the Stage 0→1 diff table with "non-listed" flags, and the sealed pilot report sent by the Monitor to the editor | before pilot generation | public registration; Monitor; editor |
| CR5 Equal treatment | Baselines frozen verbatim before the pilot; the B-Skill pin set by a registered drand time; prompt registration before the first paid study-prompt call; closed-list repairs, Monitor-classified and capped at 5, with post-pilot repairs classified before any rerun; the tuning ledger, including engineering-brief runs; logged workspaces; the independent designer chooses exemplars, gold pairs and positive-control pairs; the invited outside baseline gets the same engineering briefs, dry run and repair cap as C1-H | from prompt registration | gateway tagging; Monitor |
| CR6 No team keys | Commit-reveal draw; frame export by the Monitor or copywriter; sealed rejection and edit logs; development and confirmatory briefs sealed; separate keys per material (§4.5); ratings encrypted in the browser, with a Monitor-controlled validity service; Monitor-run evaluation of pilot outputs; encrypted bodies for sealed calls; recognition probe on the Monitor's machine; escrow; arm map released only after the analysis-code hash; every random draw seeded by a round named in advance | draw, pilot, confirmatory run | system; Monitor; copywriter |
| CR7 External verification | The lock manifest hash appears in the Stage 1 and in a public registration before the first confirmatory call. Dedicated keys for the pilot and the confirmatory run. Ledger entries and artifact hashes streamed in real time to write-once storage the Monitor owns, with roots anchored hourly through OpenTimestamps. After the run, the Monitor independently checks executed manifests and container digests against the lock. Provider and Prolific reconciliation for both runs. Automatic deviation entries; editor clearance after IPA | lock and after | system; Monitor; editor |
| CR8 Scripted decisions | Scripted: exclusions; replacement from the pre-generated schedule; failure classification, including refusals and spend stops; render taxonomy; ITT; numeric checks with binding consequences (§6.4); the A/A arm; the positive control; drift pause and resume rules. Every AI judge reported with a validity flag. Rater screener, no-AI instruction, event logs and blinding check | built before the freeze | Judge app; validity service; failure classifier; gateway |
| CR9 Independent analysis | Monitor-run analysis; a signed report covering every registered analysis in registered order, with a DOI; unblinded data released to the authors only after the DOI; a guarantor; CODECHECK | after the data freeze | Monitor; CODECHECK |
| CR10 Claims and red team | Claims tables (§9.11) covering every family, expert estimates, lay–expert disagreement and S8; both primary outcomes in the abstract; the name "C1-H". A red team of 3–5, selected by the Monitor under a registered rule, with at least one member from a competing approach: paid a base fee plus a bounty per verified error, reviewing the manuscript and the arm-specific code paths, with its report published, before Stage 1 and Stage 2. The Monitor and one red-team member check public texts. Example pages drawn by seed | Stage 1, Stage 2 | red team; Monitor |
| CR11 Labels | Labels computed from the registry with the scope tuple; the magnitude flag and reason codes (pending an interpretation ADR, D10); Study 1 recipes read "Untested" until Stage 2 is accepted; no efficacy claims before then | ongoing | label function; claims linter |
| CR12 Firewall | Judge prompts and families, design-slop-cop, DreamSim, the defect checklist, sealed briefs and rater data all live in the evaluation store. The outcome question wordings are registered as instruments, and no in-loop prompt repeats an outcome item (A.13). Exposure granularity is defined in Stage 0 with the Monitor's co-signature [D22]; the register is timestamped now; the held-out judge list is fixed at the lock | now | store scoping; CI import check; exposure register |
| CR13 Open engine | **Stage 0:** the irrevocable commitment and its licence [D16]. **By the end of confirmatory data collection, OSI release of:** every engine version run, with its recipes, prompts, development and engineering briefs, container tarballs, and mirror and font snapshots. **By Stage 2, with DOIs:** data and de-identified trial-level ratings; every request and response, including the worker-written critic prompts; renders and logs; pilot data and the tuning ledger; exclusion and deviation logs; the provider reconciliation; the analysis code. Licences are cleared for SKILL.md and the B-Outside recipe | lock to Stage 2 | release CI; Monitor |
| CR14 Record and disclosure | **Repository:** signed commits, protected branches and the ADR CI in place before the draw is registered; a public research mirror and DOI snapshots at Stage 0, the draw, the lock, IPA, unblinding and Stage 2 [D12]; every evidence file the protocol cites (power_sim3.py and its outputs, the red-team inputs) moved into the repo. **Ratification:** the 15 by-continuation ADRs [D10]. **ICMJE-scope disclosures from:** authors, the Monitor, the deputy, the guarantor, the co-investigator, the copywriter, the independent designer, the recruiting vendor, the outside-baseline owner, the experts, the red team and the CODECHECK reviewer. **Also:** a COI page [D9]; publication-freedom clauses; AI-contribution statements (including prompts drafted in chat) and telemetry-exposure statements; the IRB and consent form name the sponsor | before the draw registration, before Stage 0, and at each stage | git rules; Monitor |

**Residual risks carried forward:**
- **The Monitor:** the team chooses and pays the Monitor. This is mitigated, not removed, by the contract terms above.
- **Linking stimuli to arms:** the team can link stimuli to arms by content. Protection rests on ratings custody and Monitor-run evaluation.
- **Work outside the gateway:** prompts can be iterated in chat tools outside the gateway. Claude drafted Appendix A this way, and the AI-contribution statement discloses it.
- **The new systems:** the validity service and in-browser encryption are new engineering that could fail. The Monitor verifies the deployed builds.
- **Construct and agenda capture.**
- **Recognizable stimuli,** which weaken rater blinding.
- **Correlated taste:** LLM taste correlates across model families.
- **Claude's role:** Claude drafted much of the design and all three reviews of v1, all from the same model family.
- **Schedule:** escrowed generation is the expected path, and the venue's acceptance of it is not yet confirmed (D4).

## 12. Timeline (central case; dates are estimates, IPA turnaround unverified)

The central case assumes 2 full-time engineers. With fewer, the pilot moves to March–April 2027, and every later date moves with it.

The engineering work splits into two tiers.

**P0 (on the pilot and Stage 1 critical path):**
- the gateway spend gate, ledger and tags;
- the recipe format and bypass transform;
- the agent runtime for all arms;
- the sandbox and mirrors;
- the render service, logs and failure classifier;
- the model view;
- the minimal lay pairwise Judge app, with the scheduler, in-browser encryption and the validity service;
- ratings custody;
- the release script.

**P1 (built during Stage 1 review; nothing in P1 feeds pilot inference):**
- the AI-judge runner and validity flags;
- the similarity kernels;
- the detector pipeline;
- the axe, Lighthouse and OCR guardrails;
- the expert flow;
- the drift canaries;
- lock verification and deviation automation;
- the claims linter and label function;
- the replication-kit CI.

| Window | Milestone |
|---|---|
| 2026-10-07 → 10-31 | Decisions D1–D12 and D17–D23. Written venue answers on escrowed generation (D4 go/no-go). Ratifications and charter-interpretation ADRs (D10, D11). Signed commits, protected branches, ADR CI, public mirror and registry. power_sim3.py and the evidence files committed. Searches started: Monitor, deputy, guarantor, IRB, recruiting vendor, CR9 statistician. Copywriter contracted and calibrated on 3 engineering briefs. Anthropic organization, per-arm workspaces and custom rate limits; OpenAI organization verification |
| 2026-10-12 → ~2027-01-22 | P0 engineering: an estimated 15–25 engineer-weeks |
| before the first paid study-prompt call | Prompt registration (§5.10) |
| by 2026-11-15 | Monitor and deputy contracted. The Monitor then registers the B-Outside universe and query and sends invitations with the adapter specification |
| by 2026-11-30 | The article's prompts transcribed twice and reconciled; author contacted (D2) |
| 2026-11 → 12 | IRB submitted. Frame export by the Monitor or copywriter. R-ELIG, R-FICT, deck guide, tie-list hash and draw script registered; the Monitor's commitment to the draw secret; drand round R named; draw (~mid-December). The 12 development briefs and decks written and sealed |
| ~2027-01 (once the agent runtime works) | Engineering-brief runs: cost probe, spikes, load test, viewer check. B-Outside dry run and conformance sign-off (deadline: 3 weeks after the public sandbox). cost_model.py updated |
| ~2027-01-29 | Freeze. IRB decision |
| ~2027-02-01 | **Stage 0 filed** (the Monitor approves the thresholds) |
| 2027-02-08 → 02-19 | Pilot generation |
| 2027-02-22 → 03-05 | Pilot ratings, going to the Monitor |
| by 2027-03-19 | The Monitor's nuisance-parameter release; the A/A check |
| 2027-03-19 → 04-16 | Stage 1 written; red team round 1; the Monitor sends the sealed pilot report to the editor |
| ~2027-04-19 | **Stage 1 submitted**, with the confirmatory manifest hash, the tuning ledger, the diff table and the claims tables |
| 2027-04 → 06 (during review) | Confirmatory briefs written, probed and encrypted. P1 engineering. DreamSim gate, detector coding and critic validity run on development-brief pages. Expert recruitment and disclosures. Study 1b Stage 0 filed (before Study 1's lock) |
| 2027-06-30 | Generation date by rule if IPA has not arrived: the earlier of IPA + 10 days and 2027-06-30. **Base case: escrowed generation** |
| 2027-07-01 → ~07-14 | Confirmatory generation under escrow: 10 days, extendable to 21 for drift pauses |
| IPA (central estimate 2027-08 → 11, assuming 16–28 weeks of review including revisions [VERIFY]) | Rating starts within about 2 weeks of IPA. Lay and expert rating take about 3–4 weeks; AI judges run in one short batch window |
| end of rating | Engine released under an OSI licence (CR13) |
| about 6–10 weeks after rating | Data freeze; the Monitor's analysis and signed report (DOI); CODECHECK; Discussion; red team round 2 |
| ~2028-Q1 | **Stage 2 submitted**. Results are due no later than 12 months after the end of data collection (CR3) |
| **Hard limit** | All generation finished before 2027-09-01 (Fable 5.1's earliest retirement [VERIFY]). A regeneration after a reviewer-requested change starts only if at least 21 days remain; otherwise the successor rule applies (§15.3) |

Study 1b runs on its own track (§14).

## 13. Itemized budget (USD; planning estimates, not quotes)

**Unit assumptions:**
- **Generation.** cost_model.py gives $144 per brief for the 9 core arms at K = 4, or $180 with 25% contingency. Its token counts are unverified. The feasibility review estimates the C1-H family at $12–16 per candidate, against cost_model.py's $9.51, for these reasons:
  - D3 is under-priced in the model;
  - contexts grow across steps;
  - the image price is Gemini's, not OpenAI's;
  - fixed high effort and retries are missing.

  The planning value used here is about $275 per brief including contingency. It is an estimate, and the cost probe replaces it.
- **Lay ratings.** Pay is $15 per hour, for a 30-minute session with 26 experimental trials: about $0.29 per trial. Adding a 35% allowance for repeats and replacements and Prolific's 42.8% fee gives about $0.556 per primary judgment. That is about $960 per contrast-pool at 72 briefs × 24 judgments. With 20-minute sessions, the cost is two-thirds of this.
- **Not included:** VAT on Prolific's fee, where it applies.
- **Scope:** all figures are at 72 confirmatory briefs [D18].

**A. Core study** (72 confirmatory briefs; arms B-Plain, B-Random, B-Skill, B-Outside, C1-H and the 5 ablations)

| Item | Central | Range | Replaced by |
|---|---|---|---|
| A1 Generation, 9 core arms | 19.8k | 13–25k | cost probe, then pilot costs |
| A1b Sandbox compute (about 2,300–2,800 sandbox-hours at about $0.22/h), hosting (Judge app, validity service, storage), per-workspace fork cache writes (about 1,150 forks at about $1) | 2.3k | 1.5–3.5k | cost probe; quotes |
| A2 Generation, B-Outside | 0.7k | 0.6–1.0k | pilot costs |
| A3 Lay raters, 14 contrast-pools (about 24,200 primary judgments) | 13.5k | 9.0–15.7k | timing pilot; exclusion rate |
| A4 Sealed lay validation set (2,000 judgments) | 0.9k | 0.6–1.1k | timing pilot |
| A5 Experts: 2,304 judgments (about 60 h, 5.4k), 300 validation judgments (0.7k), recruiting vendor (1–3k) | 8.1k | 7.1–9.1k | expert timing pilot; vendor quote |
| A6 AI judges: 3 panel judges plus the Claude probe on half the pairs, multi-tile inputs; PPI and pointwise scores removed | 3.0k | 2.0–4.5k | pilot call sizes; batch pricing |
| A7 Copywriter, 84 briefs: screening, strata coding, fictionalization, decks, trademark searches, logs (about 150–180 h) | 9.0k | 7–11k | quote |
| A8 Independent designer: exemplars, gold pairs, positive-control pairs | 0.8k | 0.5–1.5k | quote |
| A9 Detector-validation coders | 0.45k | 0.3–0.6k | quote |
| **A total** | **≈ 58.6k** | **≈ 42–73k** | |

**B. Pre-pilot and pilot** (engineering briefs; then 12 development briefs, all arms plus A/A)

| Item | Central | Range |
|---|---|---|
| B0 Engineering-brief runs: cost probe (0.3–0.5k), spikes (0.1–0.3k), one-day load test (0.5–1.5k), 20-person viewer check (0.2k) | 1.4k | 1.1–2.5k |
| B1 Pilot generation, all arms plus A/A | 3.9k | 2.2–5.3k |
| B2 Lay pilot (about 1,500 judgments) | 0.85k | 0.6–1.0k |
| B3 DreamSim triplets (run during review) | 0.3k | 0.2–0.4k |
| B4 Expert timing pilot | 0.3k | 0.3k |
| B5 Critic validity and recognition probe | 0.1k | 0.1k |
| **B total** | **≈ 6.9k** | **≈ 4.5–9.6k** |

**C. Charter add-ons**

| Item | Central | Range | Status |
|---|---|---|---|
| C1 Monitor fee (80–150 h of duties) | 15k | 10–20k | feasibility-review estimate; quote needed |
| C2 Separate CR9 statistician, if contracted | 2k | 0–8k | may fall within C1 |
| C3 Red team, 2 rounds, base fee plus bounty (CR10) | 7.5k | 6–9k | estimate |
| C4 CODECHECK or an equivalent reproduction | 1k | 0–3k | CODECHECK appears to be volunteer-run [VERIFY] |
| C5 Outside-baseline coordination or a flat honorarium (CR5) | 0.5k | 0–1k | proposal |
| C6 Drift canaries and render audit (CR8) | 0.65k | 0.65k | estimate |
| C7 Legal review: Monitor contract, publication-freedom clause, licences | 2k | 1–4k | estimate; quote needed |
| C8 IRB | 1.5k | 0–3k | quote needed; about 0 through an academic co-investigator |
| C9 Registered Report article charges | 4k | 2–6k | unverified; check whether Stage 1 and Stage 2 are charged separately |
| C10 Deputy key-holder and third-party key escrow | 1k | 0–3k | estimate |
| C11 OpenTimestamps, drand, Zenodo/OSF, public mirror | 0 | 0 | free |
| **C total** | **≈ 35k** | **≈ 20–58k** | |

**D. Costs that depend on decisions (at 72 briefs; estimates)**

| Item | Cost | Decision |
|---|---|---|
| D-a B-BoN arm: pilot 0.8k, generation about 4.0k (compute-matched to C1-H), 1 lay contrast 1.0k, judges 0.2k | ≈ 6k (4–9k) | D1 |
| D-b Saving from dropping B-Skill (generation, 2 lay contrast-pools, judges) | ≈ 3k | D1 |
| D-c H1c article-core contrast (no new generation) | ≈ 1.0k | D19 |
| D-d Positive control, both pools (576 judgments each) | ≈ 0.65k | D20 |
| D-e Confirmatory A/A contrast, if added | ≈ 1.5k | D20 |
| D-f 60 briefs instead of 72 (keeps the reserve rule) | saves ≈ 8–9k | D18 |
| D-g Enlarged expert panel for confirmatory expert tests | ≈ +6k or more; size to be simulated | D21 |
| D-h Regeneration reserve, if Stage 1 reviewers change the generation protocol after escrowed generation | ≈ 15–20k, contingent | D13 |
| D-i GPT-5.6 Sol worker arm (deferred) | ≈ 2–2.5k at 24 briefs | D14 |
| D-j Study 1b, including its own C1-H comparators | ≈ 13–17k | D15 |

**Totals (A + B + C), at the recommended defaults without B-BoN, H1c or the positive control:**
- central ≈ $100k; range ≈ $66–141k (estimates);
- add ≈ $1.7k for H1c and the positive control, and ≈ $6k for B-BoN;
- the regeneration reserve and Study 1b are separate.

**Why this is higher than v1's $60k:**
- 72 briefs instead of 60;
- generation re-priced for D3 as specified and for context growth;
- 30-minute sessions and a 35% allowance;
- a Monitor fee matched to the duties;
- red-team, copywriter and legal lines raised;
- compute, hosting and cache lines that v1 omitted;
- the pre-pilot runs.

**What replaces these numbers:**
- **the cost probe and the pilot:** per-arm generation cost, retries and failure rates; image counts and critic iterations; per-candidate caps and B-BoN's N; lay and expert trial times, which set session length, pay and expert hours; exclusion rates, which set the allowance; AI-judge call sizes;
- **quotes:** the Monitor, copywriter, designer, coders, recruiting vendor, IRB, legal, red-team and article-charge lines.

Spending follows ADR-0026: the user sets the ceiling after seeing this table [D13]. Hard per-candidate USD caps, per-arm spend-capped keys and a per-study ceiling enforce it.

## 14. Study 1b (C1-HITL, human operators): scope only [D15]

**Question:** what does human taste add over C1-H?

**Status:**
- a separate Registered Report, with its own registry entry and its own Stage 0;
- CR2 applies, because product claims about C1-HITL would cite it;
- its Stage 0 is filed no later than Study 1's confirmatory lock, before any Study 1 rating, so that no Study 1 result can shape it.

**Decoupled from Study 1:**
- Study 1b generates its own C1-H comparators, both critic-picked and random, under its own lock, model profile and registered successor rule (§15.3).
- It does not reuse Study 1's confirmatory pages.
- It is therefore not tied to Study 1's IPA date, and it carries its own retirement contingency from the start.

**Operators:**
- 8 professional designers, recruited by the same third-party vendor from outside the team's network;
- screened (CR8), paid a fixed fee, and filing disclosures;
- they know which condition they are running, but not the hypotheses.

**Briefs:**
- 24 briefs drawn under Study 1b's own registered draw from Study 1's confirmatory set;
- assigned to operators in a Latin square, with operator modelled as a random effect;
- operator time is logged;
- operators work in a "Your turn" inbox that hides variant labels.

**Human checkpoints run by operators under scripted procedures:**
- VISION (system route) versus the SEED route;
- the "plain?" call;
- pick(H,1) after D2;
- CUT itemization;
- the TELLS A/B choice.

VOICE stays neutralized by the same copy deck, so that Study 1b stays comparable with C1-H. A study of human VOICE is deferred.

**Contrasts:**
- the C1-HITL page versus C1-H, using both critic-picked and random C1-H candidates (both preregistered);
- the VISION route versus the SEED route.

Study 1b uses the same renderer, rater pipeline, primary test and Monitor as Study 1.

**Cost:** about $13–17k (estimate), mostly operator time.

## 15. Deviations and the retirement contingency

### 15.1 Declared deviations from the article (logged in Stage 0)

| # | What the article did | What Study 1 does | Arms affected |
|---|---|---|---|
| 1 | One product ("my productivity app"), with no brief | 72 fictionalized, sampled briefs; the product phrase substituted; the shared brief block | all |
| 2 | Copy generated by the model, then rewritten by a human (VOICE) | A fixed human copy deck (VOICE-early) | all |
| 3 | Four Claude Code instances | The project engine, with a fixed minimal system prompt and tool set, append-only conversations | all |
| 4 | Claude Opus 5 worker, Claude Fable 5 critic, Claude Code's default effort | Opus 5.5 and Fable 5.1 [D3]; one fixed effort level; no sampling parameters | all |
| 5 | Baselines had no image tool; ASSET supplied an OpenAI key | The same pinned image tool is available in every arm; ASSET supplies only the instruction; the key never appears in a prompt | all |
| 6 | The worker called a critic subagent | The `design_critic` tool: a fresh context, the model view of one render, the prompt locked within a run, a score line appended, the threshold, code and brief text blocked | loop arms |
| 7 | No iteration cap | Probe 2, cap 5, plateau rule, best-snapshot re-rank (amendment 5) | loop arms |
| 8 | No calibration | Critic validity is measured, but not used as a gate | — |
| 9 | A pick before RELAY, and (by port rule 4) before D3 | No pick; all 4 candidates evaluated (SM-1) | C1-H family |
| 10 | VISION and RELAY used | Neither is run | C1-H family |
| 11 | Human CUT and TELLS | The D3-auto AI proxy (SM-3, SM-4), with one combined TELLS variant [D23], which is ablated | C1-H family |
| 12 | Humans decided at non-convergence, at the cap and on backtracks | Policies decide (SM-2) | loop arms |
| 13 | A screenshot of unknown size | A pinned renderer with a controlled clock; a tiled model view for every model call; static stimuli for raters | all |
| 14 | — | Protocol amendments 3, 4, 7, 9 and 10 are not used: multi-view render, references and GREAT mode, structural seed axis, CRITIC-check, feeling clause | — |
| 15 | Ran online | Builds and renders run offline, with a frozen mirror of CDNs, fonts and npm packages | all |
| 16 | No rule for a worker that stops the loop early | One fixed continuation line, at most twice (A.17) ⟨A⟩ | loop arms |

### 15.2 Deviation procedure (CR7)

- Any change to a locked study creates a new lock version and an automatic public deviation entry.
- After IPA, every change is cleared with the editor before it is made, and the Monitor co-signs it.
- Stage 2 includes the generated deviation table.

### 15.3 Model-retirement contingency (fixed in Stage 0)

1. **Generation date by rule.** Generation starts on the earlier of IPA + 10 days and 2027-06-30.
2. **Escrowed generation (the expected branch).** If IPA has not arrived by 2027-06-30:
   - tell the editor;
   - generate under the locked manifest, with outputs and sealed-call bodies encrypted to the escrow key (CR6);
   - compute no outcome of any kind, automated metrics included, before IPA;
   - collect no ratings before IPA.

   The venue's written acceptance is required at D4.
3. **Bias-control level claimed in each branch.** The Stage 1 states both:
   - **IPA first:** stimuli are generated and observed after IPA.
   - **Escrow:** stimuli exist before IPA, but nobody observes them or any outcome before IPA. This is declared as a deviation.
4. **A reviewer-requested change after escrowed generation:**
   - The escrowed pages are sealed permanently. They are never analysed, and they are released unanalysed in the Stage 2 archive, labelled as a superseded run.
   - Generation reruns under the new lock if at least 21 days remain before the earliest retirement of any model in the profile.
   - Otherwise the successor rule applies, with an editor ruling.
5. **Deprecation notice before generation ends.**
   - If 30 days or more remain before retirement, generate at once under escrow.
   - Otherwise apply the successor rule.
6. **Change in the returned model string during a run:** halt, create a deviation entry, and apply the successor rule. This is never a simple resume.
7. **Successor rule (registered):**
   - substitute the provider's newest generally available model of the same tier (an Opus-tier worker, a Fable-tier critic) with at least 90 days to its earliest announced retirement, in every arm that uses the replaced model;
   - run a bridging check on the development briefs that releases nuisance parameters only;
   - file a new lock version, cleared by the editor after IPA or recorded as a Stage 0→1 diff before it;
   - recompute the CR11 scope tuple.
8. **AI judges.** A judge that retires before judging finishes is replaced by its family's successor, and both are reported. Human outcomes are unaffected, because ratings use archived renders.
9. **After publication.** Reproducibility rests on the archive and the open engine (CR13), not on re-running the models. Labels expire at the earlier of the studied model's retirement or 24 months after the data freeze (CR11).
10. **The route never changes** (CR2).

## Appendix A. Prompts

**Status codes:**
- **EXACT:** verified verbatim.
- **TRANSCRIBE:** the article prints the full prompt, but copyright limits prevent reproducing it here. The text must be copied verbatim from the live article, because the PDF crops the right margin. Two people transcribe it independently and reconcile the results (D2).
- **PROJECT ⟨A⟩/⟨S⟩:** written by the project. Its hash is registered at prompt registration and frozen at the freeze. Claude drafted these in chat.
- **NOT IN ARTICLE:** the article does not print it.

| ID | Prompt | Status | Study substitutions and notes |
|---|---|---|---|
| A.B1 | B-Plain (the article's Baseline 1, p06): "Build me a landing page for my productivity app." | **EXACT** | "productivity app" → the brief's one-line description; brief block appended |
| A.B2 | B-Random (the article's Baseline 2, p07): the Baseline 1 sentence, then two short imperative sentences (13 words) asking for a one-of-a-kind result with every design choice made randomly | TRANSCRIBE | Product phrase replaced; brief block appended. The PDF crops the first word of the third sentence. |
| A.SEED | Seed procedure (p08). It contains: a first-person restatement of the request; three numbered steps (generate a long random alphanumeric string with a shell script; derive the creative direction from the string, looking for sub-patterns or special numbers; realize the direction with your own judgment and make it look great); and two closing sentences that keep the string out of the design | TRANSCRIBE | Product phrase replaced; brief block appended. The runbook's additions are not used. The PDF crops step 2. |
| A.CRIT-W | Critic-loop worker prompt (p15–16). It contains: improve the design, using a Fable 5 subagent as critic; each iteration, take a screenshot and call the critic in a fresh context with only that screenshot; the critic infers the aesthetic, pictures a top studio's execution, lists the biggest gaps and scores out of 10; guidance on weighing structure and detail, penalizing overdone or obviously AI-made patterns, giving tight and specific feedback, and being bold; stop only when the critic independently gives 9/10 or more; keep the threshold out of the critic prompt; reuse the same critic prompt | TRANSCRIBE | "a Fable 5 subagent" → "the design_critic tool (a separate Claude Fable 5.1 model)"; the screenshot step names the render tool. Several words are cropped, so the live page is needed. |
| A.CRIT-C | The critic's own prompt | NOT IN ARTICLE | Written by the worker in each run, as in the article; locked within the run; logged and published |
| A.ASSET | Image prompt (p19). Three paragraphs: the design is plain, so add personality with image generation and consider shaders or 3D; use the supplied key locally only; check frame by frame in the browser | TRANSCRIBE | Paragraph 2 → "Use the generate_image tool for image generation." The PDF crops "shaders". |
| A.0 | Shared brief block | PROJECT ⟨S⟩ | see below |
| A.1 | System prompt (all arms) | PROJECT ⟨S⟩ | see below |
| A.6 | Critic-tool score line | PROJECT ⟨A⟩ | see below |
| A.7 | Best-snapshot re-rank | PROJECT ⟨A⟩ (from the runbook) | see below |
| A.8 | CRITIC-self routing message | PROJECT ⟨S⟩ | see below |
| A.9–A.13 | D3-auto prompts | PROJECT ⟨A⟩ | see below; A.12 and A.13 changed in v1.1 |
| A.14 | B-BoN selector | PROJECT ⟨S⟩ | see below |
| A.15 | AI-judge pairwise prompts | PROJECT ⟨S⟩ | see below |
| A.16 | pick(C) ranking | PROJECT ⟨S⟩ | see below |
| A.17 | Loop continuation line | PROJECT ⟨A⟩ | new in v1.1; see below |
| A.B3 | B-Skill | PINNED FILE | SKILL.md at the pinned commit, hashed |
| A.B4 | B-Outside | SUBMITTED | frozen as received, hashed |

**The project prompts.** These are registered by hash before any paid run (§5.10). Images are always sent as the model view (§4.7).

- **A.0 Shared brief block.** "Product brief: [80–120-word brief]. Use this copy deck exactly as written: [deck, each string marked REQUIRED or OPTIONAL]. Rules: every REQUIRED string appears verbatim; you may leave out OPTIONAL strings; you may add only short labels of 4 words or fewer; put no text inside generated images; invent no numbers, quotes or customers. Must-haves: a static build in /dist that works offline; one page; usable at 1440 px and 390 px wide."
- **A.1 System prompt.** "You are a coding agent working in a sandboxed project folder. You can run shell commands, read and edit files, build the site, render it with the render tool, and generate images with the generate_image tool[, and call the design_critic tool]. Follow the user's instructions."
- **A.6 Score line** (appended by the tool). "End your reply with one line in the form 'Score: n/10'."
- **A.7 Re-rank.** "Here are [3] versions of the same page, labelled A–C; each is shown as a series of screenshots from top to bottom. Rank them by how close each comes to a top studio's execution of its intended aesthetic. Reply with the ranking only."
- **A.8 CRITIC-self tool result.** "[model-view images] Answer the critic prompt you wrote, yourself, for this screenshot: [locked critic prompt]."
- **A.9 CUT reviewer.** "You see screenshots of one web page, top to bottom. Its text is fixed and must not change. Write one or two sentences on what the page is for. Then check each element for purpose, redundancy, effort display, over-explanation, and custom versus standard. List what should be removed or simplified, using removal verbs only (remove, dial back, simplify). Suggest no new elements except standard components. Return a numbered list of at most 8 items, most important first."
- **A.10 CUT worker** (the runbook's template). "Dial this back. Remove: [items]. You have permission to delete code. Add nothing new except standard components. Do not remove or change any REQUIRED copy string."
- **A.11 TELLS sweeper.** "You see screenshots of one web page, top to bottom. For each pattern in this list, say whether the page shows it prominently or in a cluster, and where: [the article's four UI patterns, from 01-blocks.md]. Return only the hits."
- **A.12 TELLS swap** [D23] (the runbook's swap template, adapted to a list). "Make one variant of the page in which each of these patterns, as seen on the page, becomes its listed alternative: [hits, each with its catalog alternative]. Keep everything else the same." Under the per-row alternative, the runbook's single-row template is used once per hit, as in v1.
- **A.13 TELLS keep-or-revert** (reworded in v1.1 so that it does not repeat the P1 outcome question). "Here are two versions of the same page, A and B, each shown as screenshots from top to bottom. For each, consider the aesthetic it is going for and how a top design studio would execute it. Which version comes closer to that bar? Answer A or B." The construct overlap with the outcome remains, and it is declared in the CR12 register.
- **A.14 B-BoN selector.** "Here are [N] landing page designs for the same product, labelled A–[N]; each is shown as screenshots from top to bottom. For each, consider the aesthetic it is going for and how a top design studio would execute it. Which design comes closest to that bar? Answer with one label."
- **A.15 AI judges.** "Here are screenshots of two landing pages for the same product. Page A is shown first, top to bottom, then page B."
  - Quality: "... Which page looks better designed? Answer A or B."
  - Distinctiveness: "... Which page looks more distinctive — less like other websites you've seen? Answer A or B."
- **A.16 pick(C).** As A.14, applied to a brief's 4 final C1-H candidates, returning a full ranking.
- **A.17 Loop continuation line.** "You ended the critic loop before the critic gave 9/10 or more. Continue the loop as instructed in my earlier message."

## Appendix B. Open items

### B.1 User decisions (detailed in the decision list)

| ID | Decision | Blocking |
|---|---|---|
| D1 | Baselines beyond the article, and whether experts judge B-Skill | yes |
| D2 | Verbatim transcription of the article's prompts, and the contingency if publication is refused | yes |
| D3 | Model profile, effort level and successor rule | yes |
| D4 | Registered Report venue, as a go/no-go on escrowed generation | yes |
| D5 | SESOI and equivalence margin | yes |
| D6 | Scope of error control | yes |
| D7 | Monitor, deputy and guarantor | yes |
| D8 | Ethics route, rater geography, disclosure that pages are AI-made, Prolific account | yes |
| D9 | Funding, patents and legal-entity disclosures | yes |
| D10 | Ratifications, the new exceptions, port-rule wording and charter interpretations | yes |
| D11 | Reading of CR3 and CR4 for pilot results | yes |
| D12 | Route for the public record | yes |
| D13 | Budget ceiling, pre-pilot and pilot spend, regeneration reserve | before the pilot |
| D14 | GPT worker arm | no |
| D15 | Study 1b | no |
| D16 | Engine and data licences | no |
| D17 | Status of P2 and H2a | yes |
| D18 | Fix the brief count now | yes |
| D19 | Article-core contrast H1c | yes |
| D20 | Positive control | yes |
| D21 | Expert family | yes |
| D22 | Exposure granularity: image model versus GPT judge | yes |
| D23 | TELLS-auto as one combined variant | yes (before the freeze) |
| D24 | Product-consequences table | before Stage 1 |

### B.2 Checks and follow-ups (not user decisions)

1. **Venue questions** (part of D4):
   - written positions on escrowed pre-IPA generation and on a registered successor-model rule;
   - the minimum power per test, and whether it applies to secondary and equivalence tests;
   - whether the Monitor may send the sealed pilot report directly to the editor, and whether reviewers can keep effect-dependent remarks confidential;
   - article charges, and whether Stage 1 and Stage 2 are charged separately;
   - Stage 1 turnaround;
   - RSOS's conflict-of-interest terms.
2. **Retirement dates** of the worker, critic, image model and judges, checked at the Stage 1 manifest and again at the lock.
3. **Frame:** the export method and the terms of use for Product Hunt and the HN Algolia API, resolved before the draw is registered.
4. **CR11:** the interpretation ADR for the magnitude flag and reason codes (D10).
5. **power_sim3.py:** commit it with its outputs and results JSON, and hash them. The Monitor or the CR9 statistician reruns the §8 table and certifies the §9.1 function before Stage 0.
6. **Simulation reruns:**
   - equivalence and non-inferiority with the two-way CI;
   - unbalanced cells;
   - up to 6 judgments per rater per contrast at 72 briefs;
   - the positive-control design;
   - joint F4 power;
   - the D21 option (c) panel size.
7. **Name and hash in Stage 0:**
   - the R-CAL award gallery;
   - the version of Krebs's corpus;
   - the design-slop-cop commit and its pattern count (sources disagree: 14 or 16);
   - the open-weight judge and the Gemini stable ID;
   - the DreamSim, DINOv2 and CLIP versions;
   - the DOM kernel;
   - the axe-core and Lighthouse versions;
   - the mirror's top-N rule.
8. **Hosting:**
   - Judge app hosting and data residency (follows D8);
   - stimuli served from a separate, cookieless origin;
   - the validity service hosted on infrastructure the Monitor controls.
9. **Keys:** a backup of the Monitor's keys held by a third party (the bus-factor risk).
10. **Check stimuli:** the gold, instructed-response and positive-control stimuli are built by the independent designer from pages outside the study and frozen by hash.
11. **Out of scope here:** the operator count in 02-grammar drifts (13, 16, 17 or 22), and other protocol inconsistencies.
12. **Deferred measures and arms:**
    - S5, 5-second clarity;
    - PPI;
    - distractor probes;
    - pointwise AI scores;
    - the VisAWI-S absolute quality floor;
    - CAT-style expert ratings;
    - separate −CUT and −TELLS arms;
    - critic-tier and blind-only ablations;
    - GREAT mode;
    - −RELAY;
    - a live-iframe expert subsample;
    - human VOICE.
13. **CR10 tables:** finalize after D1, D5, D6, D17–D21 and D24.
14. **Templates** for the HEDS sheet and the CONSORT-style rater flow.
15. **Spike tests** on engineering briefs before the freeze (§10).
16. **Capacity:** a written throughput plan and custom rate limits; OpenAI organization verification; the load test.
17. **Costs:**
    - the cost probe, then an update to cost_model.py: D3 as specified, context growth, the OpenAI image price, the fixed effort, retries, the sandbox, hosting and fork cache writes;
    - quotes for the Monitor, copywriter, red team, legal, IRB, recruiting vendor and article charges.
18. **Licences:** the frontend-design SKILL.md; the B-Outside recipe; the providers' output terms for releasing generated pages.

### B.3 Verification log (a human checks each item against its primary source before Stage 0)

| # | Claim | Used in | Source of the claim | Status |
|---|---|---|---|---|
| 1 | claude-opus-5-5 retires no earlier than 2027-09-22; claude-fable-5-1 no earlier than 2027-09-01 | §5.1, §12, §15.3 | tooling.md, citing Anthropic's deprecation page | unverified |
| 2 | Anthropic gives at least 60 days' notice before retirement | §15.3 | feasibility review | unverified |
| 3 | Claude image input limit of 2,576 px on the long edge, about 3.75 MP, at most 4,784 visual tokens; per-request image limits for all providers | §4.7 | feasibility review | unverified |
| 4 | Organizations created on or after 2026-08-31 reject edits to earlier turns | §5.2 | feasibility review | unverified |
| 5 | Forced tool choice is rejected on Opus 5.5 and Fable 5.1 | §5.2 | feasibility review | unverified |
| 6 | Opus 5.5's API default effort is medium; Claude Code's default is higher | §5.1 | feasibility review | unverified |
| 7 | A refusal stop reason exists, and the SDK offers server-side fallbacks | §5.2 | feasibility review | unverified |
| 8 | Prompt caches are isolated per workspace | §5.1 | feasibility review | unverified |
| 9 | Priority Tier is unavailable for these models | §5.1 | feasibility review | unverified |
| 10 | OpenAI image models require organization verification and have per-minute image limits | §5.1 | feasibility review | unverified |
| 11 | Prolific fees are 42.8% (corporate) and 33.3% (academic); whether VAT applies | §7.3, §13 | methods.md | unverified |
| 12 | Model IDs and stable status of GPT-5.6 Sol and Gemini 3.1 Pro | §7.7 | research passes | unverified |
| 13 | Registered Report Stage 1 review takes 16–28 weeks including revisions | §12 | feasibility review | unverified |
| 14 | CODECHECK is volunteer-run; its cost | §13 | v1 | unverified |
| 15 | PLOS ONE RR grants IPA, publishes Stage 1 as its own article, and accepts declared financial interests | D4 | v1 (reported as verified) | recheck at D4 |
| 16 | The terms of the Product Hunt API and the HN Algolia API | §4.1 | — | unchecked |
| 17 | The SKILL.md path and licence in anthropics/claude-code | §5.3 | study1-draft | unverified |
| 18 | The "good" thresholds: LCP ≤ 2.5 s and CLS ≤ 0.1 | §6.3 | — | unverified |
| 19 | Vargha–Delaney benchmarks (.56, .64, .71) | §9.3 | v1 | unverified |
| 20 | Lakens (2022) on resource-based SESOI justification | §9.3 | methods review | unverified |
| 21 | Definition of quality-weighted Vendi | §6.5 | — | unverified |
| 22 | design-slop-cop's pattern count (14 or 16); Krebs's 16 patterns | §6.2 | v1 | unresolved |
| 23 | cost_model.py token counts | §13 | AI research pass | unverified; the cost probe replaces them |
| 24 | Sandbox cost of about $0.22 per candidate-hour; about 1,900–2,300 sandbox-hours at 60 briefs | §13 | feasibility review | estimate |
| 25 | Monitor workload of 80–150 h; the red-team and copywriter cost ranges | §11, §13 | feasibility review | estimate |
| 26 | The 60/72 rule picks 72 with probability about .44 from pilot noise | §8 | feasibility review's own simulation | not reproduced |
| 27 | The planning variance components | §8 | assumptions, with no empirical source | the pilot re-estimates them |
| 28 | Article details: pages p06, p07, p08, p15–16 and p19; the Opus 5 / Fable 5 pair; the OpenAI key | Appendix A, §1 | article PDF | verify at transcription (D2) |
| 29 | ANGLE with SwiftShader gives software WebGL in the pinned container | §4.7 | feasibility review | verify by spike |
