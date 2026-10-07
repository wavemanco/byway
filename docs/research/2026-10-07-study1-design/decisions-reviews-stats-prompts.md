# USER DECISIONS

- [BLOCKING] D1. Which baselines beyond the article's two go into Study 1, with what status, and should expert designers also judge B-Skill (HE3)? You were told Paper 1 tests C1 against the plain and 'be creative' baselines.
  OPTIONS: (a) Article baselines only: B-Plain and B-Random. B-Outside is run and reported as an estimate, which is the minimum CR5 allows. (b) Option (a), plus B-Skill and B-Outside as a confirmatory F2 family behind the H1a gate. This costs about $3k for B-Skill and about $2.6k plus coordination for B-Outside, at 72 briefs (estimates). (c) Option (b), plus a compute-matched best-of-N arm (B-BoN) on quality (about $6k more). For any option, HE3 (experts on C1-H vs B-Skill) can be added as an expert estimate for about $1.3k.
  REC: (c), without HE3. B-BoN is the only arm that answers the objection that C1-H wins only because it spends more compute. B-Skill is the strong practitioner baseline. Keeping both in F2 behind the gate protects the replication family. An expert estimate for B-Skill adds cost but no confirmatory value. Under any option, H4c and H4d now predict C1-H > B-Outside, so a B-Outside win reads 'Worse'.

- [BLOCKING] D2. Will you transcribe the article's exact prompts (B-Random, SEED, the critic-loop worker prompt and ASSET) from the live page, and what happens if the author or publisher will not allow them to be published?
  OPTIONS: (a) Two independent verbatim transcriptions, one by you and one by someone outside the team (for example the Monitor once contracted). Reconcile them, record page and paragraph references and how each crop was fixed, and ask the author to confirm the text and permit publication, all by 2026-11-30. If permission has not arrived by the freeze: register the text by hash; deposit it with the Monitor and the editor, to be shared confidentially with reviewers; publish the page references and hashes; release the full text when permission arrives; and tell replicators to use the live article and check it against the hashes. (b) Use the protocol's paraphrases. This conflicts with the 'verbatim' rule in CR4 and CR5 and weakens the replication claim.
  REC: (a). The baselines cannot be frozen without it. A second transcriber outside the team removes the objection that an interested party settled the cropped words alone.

- [BLOCKING] D3. Which model profile, which effort level, and what successor rule for model retirement?
  OPTIONS: (a) claude-opus-5-5 worker and claude-fable-5-1 critic, pinned; one fixed effort level in every arm (high recommended, justified against Claude Code's default, which is reportedly higher than the API's medium default [unverified]); a pinned, dated OpenAI image snapshot; per-arm workspaces. A registered successor rule serves as the contingency: the provider's newest generally available model of the same tier with at least 90 days to retirement, plus a bridging check. (b) The article's exact Opus 5 / Fable 5. They are listed only until about June–July 2027, before the expected escrowed generation date, so this is effectively not feasible. (c) A rule-based profile chosen at the lock. The pilot might then run on different models from the confirmatory study, which would need a bridging check.
  REC: (a), with the successor rule registered in Stage 0. It pins the models the pilot actually measures and still guarantees that retirement never blocks the study.

- [BLOCKING] D4. Which Registered Report venue? This is now a go/no-go: escrowed generation before IPA is the expected path.
  OPTIONS: (a) PLOS ONE Registered Reports. (b) Royal Society Open Science, direct RR. (c) Another journal on COS's RR list. PCI RR is excluded (CR2). For each candidate, get written answers in October to these questions: (i) is sealed stimulus generation before IPA acceptable, encrypted to the Monitor with no outcome computed before IPA? (ii) is a registered successor-model rule acceptable? (iii) is there a minimum power per test, and does it apply to secondary and equivalence tests? (iv) may the Monitor send the sealed pilot report directly to the editor, and can reviewers keep effect-dependent remarks confidential? (v) what are the article charges, and are Stage 1 and Stage 2 charged separately? (vi) what is the Stage 1 turnaround? (vii) what are the conflict-of-interest terms?
  REC: Choose the venue that accepts (i) in writing, preferring PLOS ONE if both do. If neither accepts escrowed generation, stop before any pilot spend and revisit D3 (option c) with me. CR2 forbids changing route later.

- [BLOCKING] D5. What smallest effect of interest (SESOI) and equivalence margin, with what pre-data rationale? Reviewers found that v1's rationale argued against itself and looked chosen to fit power.
  OPTIONS: (a) Δ = .08, declared openly as a resource-based SESOI (Lakens 2022): it is the smallest effect this design detects with power of at least .90 at every worst-case Holm level at 72 briefs. The Vargha–Delaney benchmark is context only, and the 'nobody could tell by eye' argument is dropped. Safeguards: verdicts read 'any effect is smaller than .08'; every equivalence test is repeated at ±.06 and reported side by side in the abstract; no product default may be dropped or demoted unless equivalence also holds at ±.06. (b) Δ = .06, anchored on Vargha–Delaney's 'small' (.56). Holm-adjusted equivalence power is then only about .63 at 72 briefs, so most null blocks would read 'Inconclusive'. (c) A per-block cost break-even. This needs you to give a pre-data dollar value for a preference shift. (d) A small pre-data practitioner elicitation of the preference shift that would change adoption, at about $1–2k and a few weeks (estimate).
  REC: (a). It is honest about its basis, keeps the equivalence tests powered, and the ±.06 product rule addresses the risk the charter names: a block with a true win rate of .57 being called negligible for cost reasons.

- [BLOCKING] D6. How wide is error control, and are the mechanism families gated behind H1a?
  OPTIONS: (a) Family-wise control within each family. H1a gates F1 and F2 only; F3, F3-EQ and F4 are tested whatever H1a's result. The claims table states that verdicts outside H1a carry family-wise control only. (b) Gate every family behind H1a. (c) Study-wide error control across all families, which costs power. (d) A graphical procedure (Bretz et al.) that recycles α from H1a into F1, F2 and F3. This gives stronger overall control but needs re-simulation.
  REC: (a). The headline is tested at exactly .05, and block contributions stay informative even if C1-H loses. Choose (d) only if the venue asks for studywise control.

- [BLOCKING] D7. Who are the Independent Integrity Monitor, the deputy key-holder and the guarantor, and on what terms (CR1, CR9)? The charter audit found that v1 gave the academic co-investigator colliding roles.
  OPTIONS: (a) Three different people. The Monitor is a paid methodologist who is not an author. The deputy is a second non-author: the academic co-investigator only if they are not an author, otherwise the third-party key-escrow holder. The guarantor is a non-conflicted author. (b) The co-investigator as Monitor, who then cannot be an author, with a separate deputy. In both cases the published contract carries: all six CR1 powers; a signed independence attestation; termination only for cause, with a public reason; keys passing to the deputy on termination; and a priced scope of work (estimate $10–20k for about 80–150 hours).
  REC: (a). Start the search this week through Registered Report and methods networks, and contract by about 2026-11-15, before any pilot spend. The co-investigator can be the deputy (as a non-author) or the guarantor (as an author), not both.

- [BLOCKING] D8. Ethics route and rater population: IRB, rater geography, whether consent says all pages were made with AI tools, and the Prolific account type. Most RR journals expect ethics approval or its status at Stage 1.
  OPTIONS: IRB: an academic co-investigator's IRB, or an independent or commercial IRB. Geography: US and UK only, or several countries. Disclosure: say the pages were AI-generated, or use neutral wording. Prolific: a corporate account if the company pays (CR14), or an academic account only if an institution pays.
  REC: An academic co-investigator's IRB, submitted in November; US and UK raters; disclosure that the pages were AI-generated (it is the same in every arm); and a corporate Prolific account unless an institution genuinely pays. The consent form names the sponsor.

- [BLOCKING] D9. Funding, patents and the legal entity: all must be disclosed completely in the first filing (CR14).
  OPTIONS: Patents: (a) file none on configurations, the recommender or the composer; (b) file, with full disclosure. Funding: state who pays for Study 1 and what role the funder has in design, analysis and the decision to publish.
  REC: Decide before Stage 0. If you file a patent, file before Stage 1, and commit publicly that no filing will ever delay publication.

- [BLOCKING] D10. Ratify the 15 ADRs accepted only by continuation and accept ADR-0034 to ADR-0038 as amended. Also adopt the new items v1.1 needs: exceptions SM-1 to SM-6; port-rule wording for rules 1, 2 and 5 that lets the critic's 'view' be the tiled model view of one render; and a CR11 charter interpretation adding a computed magnitude flag and reason codes beside the unchanged five verdicts.
  OPTIONS: (a) Ratify and accept as amended, with each ratification and interpretation recorded as a new ADR; the interpretations are co-signed by the Monitor. (b) Ratify with named changes. (c) Reopen specific ADRs.
  REC: (a), in one session before Stage 0, with the interpretations co-signed once the Monitor is in post. Start with ADR 8, 11, 12, 13, 15, 17 and 27, which Study 1 freezes or the validator enforces.

- [BLOCKING] D11. How should CR3's 90-day pilot-results deadline be read alongside CR4's rule that arm-level pilot effects stay away from the team until Stage 1 is published?
  OPTIONS: (a) Within 90 days, the Monitor deposits the sealed pilot report with a public timestamped hash and posts all nuisance parameters. The arm-level report becomes public when Stage 1 is published or at 12 months, whichever comes first. (b) Publish arm-level pilot effects at 90 days, which breaks CR4's intent if Stage 1 is not yet out. (c) Submit Stage 1 within 90 days of pilot completion, so both deadlines coincide.
  REC: (a), recorded as an ADR co-signed by the Monitor before any pilot spend. The schedule also aims at (c): Stage 1 is due about 6–7 weeks after pilot ratings end.

- [BLOCKING] D12. How is CR14's public record published while the repository stays private?
  OPTIONS: (a) A public mirror of the research ADRs, Program Registry and deviation log. (b) Archived DOI snapshots at each milestone. (c) Both.
  REC: (c). Signed commits, protected branches, the ADR CI and the public mirror must exist before the draw is registered (about November), not just before Stage 0.

- [later] D13. What spending ceiling do you set for Study 1, and do you approve the pre-pilot and pilot spend (ADR-0026)? The revised estimate is much higher than v1's $60k.
  OPTIONS: Core study, pre-pilot, pilot and charter add-ons at 72 briefs: about $100k central (range about $66–141k; all estimates). Add about $1.7k for H1c and the positive control, about $6k for B-BoN, and a contingent regeneration reserve of about $15–20k in case Stage 1 reviewers change the generation protocol after escrowed generation. A leaner set-up saves about $8–9k with 60 briefs (D18), about $3k without B-Skill and about $6k without B-BoN. Pre-pilot runs: about $1.4k. Pilot: about $5.5k.
  REC: Approve the pre-pilot engineering-brief runs (about $1.4k) once the registry entry and spend gate exist. Approve the pilot (about $5.5k) once the Monitor is contracted. Set the confirmatory ceiling after the cost probe and the quotes for the Monitor, copywriter, red team, legal and IRB. Decide on the regeneration reserve once the venue's answer on escrow (D4) is in.

- [later] D14. Should a GPT-5.6 Sol worker arm be part of Study 1?
  OPTIONS: (a) Defer it to Paper 2 and log it in the registry roadmap. (b) Include C1-H vs B-Plain with a GPT worker on 24 briefs (about $2–2.5k). It must then be in Stage 0, and GPT judges would be partly compromised for that arm.
  REC: (a). CR4 does not allow adding an arm after the pilot, and model-family generalization belongs to rung 3. The paper states the single-family limitation.

- [later] D15. Go ahead with Study 1b (C1-HITL with 8 designer-operators) as its own Registered Report, and how should it be timed?
  OPTIONS: (a) Decoupled. Study 1b generates its own C1-H comparators (critic-picked and random) under its own lock, model profile and successor rule. Its Stage 0 is filed before Study 1's confirmatory lock and before any Study 1 rating. Cost: about $13–17k (estimate). (b) Include it as a second study in Study 1's Stage 1: one IPA and one lock window, but a larger review. (c) Defer it. Study 1 then claims only C1-H, and the product cannot cite human-in-the-loop evidence.
  REC: (a). As scheduled in v1, Study 1b could not meet its retirement deadline, and its Stage 0 could have been shaped by interim Study 1 results. Under CR11, the product cannot borrow C1-H's evidence for human-in-the-loop C1.

- [later] D16. Which OSI licence for the study engine and which licence for the data? CR13 requires the commitment and the licence in Stage 0, and release by the end of confirmatory data collection.
  OPTIONS: (a) Apache-2.0 for code and CC-BY-4.0 for data. (b) MIT for code and CC-BY-4.0 for data. (c) Another OSI licence.
  REC: (a). Apache-2.0 includes an explicit patent grant. Before Stage 0, also clear the licence of the frontend-design SKILL.md and add the irrevocable licence clause to the B-Outside invitation. Before releasing generated pages, check the providers' output terms.

- [BLOCKING] D17. What is the status of the distinctiveness outcome (P2/H2a)? v1 called it 'co-primary', but it was gated and Holm-corrected. Both reviewers flagged this as a misstatement of the error structure.
  OPTIONS: (a) P1 and P2 are the two primary outcomes that CR10 requires in the abstract, each with its effect size and CI. H1a is the only primary hypothesis. H2a is a gated key secondary in F1, and the abstract uses a fixed, non-claiming sentence when H1a fails but H2a's CI is above .50. No power change. (b) A true co-primary: H1a and H2a each at α = .025 with a joint gate. Power at 72 briefs stays at about .95 each, but this conflicts with CR4's 'single gate' and needs a charter amendment.
  REC: (a). It reads CR4 and CR10 together without amending the charter, and the labels match the actual error control.

- [BLOCKING] D18. Should the number of confirmatory briefs be fixed now rather than decided after the pilot?
  OPTIONS: (a) Fix 72 confirmatory briefs (12 strata × 6) with no reserve stratum. Simulated power at win .58 is at least .90 at every worst-case Holm level in F1–F3 (F1 .92, F2 .91, F3 .95, F3-EQ .95). Cost is about $8–9k more than 60 briefs (estimate). (b) Fix 60 briefs. F1 (.87), F2 (.85) and F3-EQ (.88) fall below .90, which some RR venues may not accept. (c) Keep v1's 60/72 rule. The feasibility review found that this decision is driven mostly by pilot noise, and it keeps reserve fictionalization on the critical path.
  REC: (a). It removes a noisy post-pilot decision, simplifies the copywriter's work and meets a .90 per-test minimum if the venue has one.

- [BLOCKING] D19. Should Study 1 add a confirmatory test of the article-demonstrated chain alone (H1c: C1-H's pre-D3 snapshot, i.e. SEED, critic loop and ASSET, vs B-Plain, on quality, in F1)? The gated arm C1-H includes AI stand-ins for CUT and TELLS that the article never ran on landing pages.
  OPTIONS: (a) Add H1c to F1. It costs about $1k of lay ratings and no new generation. F1 then has 4 tests, with simulated power .92 at 72 briefs. (b) Do not add it. Instead, justify in Stage 1 why the gate arm includes D3-auto, and rely on H3d (C1-H vs −D3) plus fixed claims-table wording for the split outcomes.
  REC: (a). It lets the paper say whether the article's own demonstrated workflow beats the plain prompt, separately from the project's stand-ins. Because H1c is gated, it cannot rescue a failed H1a.

- [BLOCKING] D20. Add a preregistered positive control to show that the rating pipeline can detect a real difference? Equivalence ('No meaningful effect') claims are confirmatory.
  OPTIONS: (a) In each pool, 24 fixed pairs of independently chosen strong (award-gallery) versus generic (template-pattern) exemplar pages from outside the study, 24 judgments each (about $0.65k). Pass: win ≥ .70 with the 95% CI lower bound above .58. If it fails, no 'No meaningful effect' verdict is allowed. (b) Option (a), plus a small confirmatory A/A contrast (a duplicate B-Plain arm; about $1.5k more). (c) No positive control. Equivalence verdicts then rest on the pilot A/A only.
  REC: (a). It is cheap, independent of the arms, and closes the gap an RR editor is most likely to raise for confirmatory nulls.

- [BLOCKING] D21. What should the expert family be? At the SESOI (win .58), simulated expert power is only about .48–.56 at its Holm level, even at 72 briefs.
  OPTIONS: (a) Estimation only: experts answer the P1 wording on HE1, HE2, HE4 and HE5. Their win rates and 95% CIs, plus lay–expert agreement, are reported with no verdicts. (b) A confirmatory expert family over 4 contrasts, openly powered for win ≥ .62 (about .94 at 72 briefs) and underpowered at .58. A venue with a .90 minimum per test may reject this. (c) Enlarge the panel until expert tests reach .90 at the SESOI. The size still has to be simulated; expect at least double the expert judgments, about $6k or more (estimate).
  REC: (a), unless the venue check (D4) shows you can afford and the venue requires expert verdicts, in which case (c). An underpowered confirmatory family is the weakest option.

- [BLOCKING] D22. How should 'exposure' be counted for held-out AI judges (CR12), given that every arm uses an OpenAI image model while GPT-5.6 Sol is a held-out judge?
  OPTIONS: (a) Count exposure by model line and role: an image generator does not expose an evaluator family. GPT stays on the panel, and a GPT/OpenAI-image preference probe is reported beside its validity flag. (b) Count exposure by provider family: GPT is not held out and is reported only as an exposed, exploratory judge. (c) Switch the image model to a provider with no judge on the panel. This is less faithful to the article, which supplied an OpenAI key.
  REC: (a), defined in Stage 0 with the Monitor's co-signature and the exposure register timestamped now. The image generator does not optimize pages against GPT's taste, and the probe measures the remaining risk. Choose (b) if you want the strictest reading.

- [BLOCKING] D23. Should TELLS-auto make one combined variant instead of one variant per catalog row? The earlier resolution kept the per-row form, and the feasibility review proposes the change only with your agreement.
  OPTIONS: (a) One combined variant applying all of the sweeper's hits, then a single blind keep-or-revert call. This roughly halves D3's cost and latency and removes the variant-branching machinery (estimate). (b) Keep up to 4 per-row variants, each with its own A/B call, as in v1.
  REC: (a). D3-auto is a project-written, labelled stand-in, not article text, and it is ablated by −D3 either way. Per-row human TELLS belongs to Study 1b.

- [later] D24. What does the product do in each outcome pattern? CR10 requires a product-consequences table at Stage 1, and only you can set product defaults.
  OPTIONS: Proposed draft: (1) If H1a is Supported, C1's label for the C1-H scope is 'Supported', and human-in-the-loop C1 shows 'Derived-from-studied'. If it is Inconclusive or Worse, that label is shown and C1 is not presented as improving design. (2) For each block: 'Supported' keeps it in the default; 'No meaningful effect' at both ±.08 and ±.06 allows the block to become optional to save cost; 'No meaningful effect' at ±.08 only, or 'Inconclusive', leaves the default unchanged; 'Worse' means [your choice]. (3) No efficacy claims before Stage 2 is accepted (CR11).
  REC: Adopt the draft and fill in the 'Worse' rows before Stage 1. This is not needed for Stage 0, but it must be fixed before the pilot effects reach the journal.

# RESOLVED CONFLICTS

- Baseline set: what the 'plain' and 'be creative' baselines are (ADR-0024 wording; study1-draft B-Random; methods 'be creative')
  => Unchanged from v1. B-Plain = the article's Baseline 1, verbatim. B-Random = the article's Baseline 2, verbatim, which is the article's own 'be creative' prompt. B-Plain is the H1a gate, and B-Random is in F1.
  WHY: The article has one 'be creative' baseline, and it is the random prompt. CR4 and CR5 require it verbatim.

- Frontend-design skill baseline (B-Skill), including the expert contrast HE3, which the methods review found ungated
  => B-Skill stays a proposed F2 arm behind the H1a gate (D1). HE3 is dropped from the expert set in the recommended design. Experts are estimation-only anyway (D21), and the user can add HE3 back under D1. The pin is the latest commit at the timestamp of a drand round named when the frame is registered, not a date the team picks.
  WHY: An ungated expert claim about a beyond-article baseline contradicted the reason for gating F2, and went beyond what the user was told. A registered pin time removes the team's choice of freeze date.

- Invited outside baseline (CR5): no stated direction for H4c/H4d; the team controlled the ranked universe and the adaptation; the owner had none of C1-H's development help
  => H4c and H4d now predict C1-H > B-Outside, like every other baseline, so 'Worse' is defined if B-Outside wins. The Monitor registers the universe definition and search query before inviting, and invitations go out only after the Monitor is contracted. The owner gets the engineering briefs, one supervised dry run, the same repair cap as C1-H, a published adapter spec, conformance sign-off with published dissent, and an irrevocable licence clause. The 'as published' fallback follows a registered adaptation rule. Status in F2 remains D1.
  WHY: CR11's vocabulary needs a direction. A non-directional verdict set would need a charter amendment. Equal treatment (CR5) means the owner gets what C1-H got.

- Compute-matched best-of-N (methods) versus CRITIC-self (study1-draft)
  => Unchanged: both are kept. B-BoN remains D1, now estimated at about $6k at 72 briefs.
  WHY: They answer different questions. Only B-BoN answers the 'C1-H just spends more compute' objection.

- Pick versus evaluating all candidates
  => Unchanged: all K = 4 candidates are evaluated, under SM-1.
  WHY: A pick would give C1-H a best-of-4 selection advantage. A human pick cannot be blinded.

- Primary test: v1 said 'the registered code is the definition' (power_sim3.py, which is in a scratchpad); the methods review wanted the text to be normative
  => §9.1 now defines everything in text: the estimand, the weighted estimator, the exact two-way Cameron–Gelbach–Miller formula (singleton brief × rater cells, small-sample factors B/(B−1) and R/(R−1), fallback to V_brief when V ≤ 0), df = min(B, R) − 1, and the CI. The text governs. The Monitor certifies the code against it before Stage 0, and CODECHECK before Stage 2. power_sim3.py and its outputs move into the repo with hashes.
  WHY: Both the methods review and the charter audit found the test unspecified while the code sat outside the record. With equal cells, the stated formula reduces algebraically to power_sim3's implementation.

- Power figures: v1 interpolated F1/F2 from the brief-level test; reviewers wanted simulated values at each family's worst-case Holm α
  => §8 now reports the simulated two-way test, taken from power_sim3_results.json at every α (.05, .025, .0167, .0125, .01), at 60 and 72 briefs. The equivalence and non-inferiority rows used the brief-level CI and are flagged for rerun. The T6 shortcut constants are shown to be a fit to the simulated SDs.
  WHY: Those values were already simulated but not used in v1. Using them removes the interpolation and the unsourced-constant objections.

- Multiplicity structure after the v1.1 changes
  => H1a is the single gate. F1 = {H1b, H1c [D19], H2a [D17], H2b}. F2 = beyond-article baselines. F3 and F3-EQ use Holm. F4 is an intersection–union test. FE is estimation only [D21]. The BH set is enumerated (7 tests). Each family is justified as a distinct claim, and the claims table states that verdicts outside H1a carry family-wise control only. The graphical procedure is offered under D6.
  WHY: This keeps CR4's single gate and answers the methods review's call for a justification and an explicit BH set.

- 'Co-primary' P2 versus H2a being gated and Holm-corrected (methods review and charter audit)
  => Provisionally (D17 option a): P1 and P2 are the two primary outcomes that CR10 requires in the abstract. H1a is the only primary hypothesis. H2a is a gated key secondary. A fixed, non-claiming abstract sentence covers the case where H1a fails and H2a's CI lies above .50. Making H2a a true co-primary would conflict with CR4's single gate, so it needs a charter amendment.
  WHY: CR10 itself uses 'co-primaries' for reporting, and CR4 fixes a single gate. Read together, they mean two primary outcomes and one primary hypothesis.

- SESOI: no role in the superiority verdict (methods review); 'Supported (below SESOI)' sits outside CR11's vocabulary (charter audit)
  => CR11's five verdicts are unchanged. Every verdict gets a computed magnitude flag ('at least Δ', 'below Δ', 'Δ not excluded') and, where needed, a reason code. This needs a CR11 interpretation ADR co-signed by the Monitor (D10). F4 partial outcomes and 'Worse within margin' are mapped explicitly.
  WHY: It gives a magnitude rule for every superiority test without inventing a new verdict, and it stops a qualifier from being dropped in product copy.

- Manipulation-check failures: the methods review proposed voiding both the superiority and equivalence verdicts of the affected block
  => A failed manipulation, sensitivity or positive-control check blocks 'No meaningful effect' and turns a non-rejection into 'Inconclusive' with a reason code. 'Supported' and 'Worse' stand.
  WHY: The danger is a failed manipulation read as a substantive null. A superiority result remains a valid intention-to-treat contrast of the recipes as executed.

- Response format: forced choice versus a 'Can't decide' option
  => Unchanged: two-alternative forced choice, followed by a confidence rating (now exploratory).
  WHY: The binary outcome is what the test and the simulation assume.

- Distinctiveness instrument and the DreamSim gate timing
  => Lay pairwise P2 stays the distinctiveness outcome. The DreamSim gate and the detector κ gate keep rules fixed in Stage 0, but they run on development-brief pages during Stage 1 review and are reported in Stage 2. S3 uses a brief-level permutation test. Font share and hue entropy are descriptive.
  WHY: This takes them off the Stage 1 critical path without adding discretion. S3 is an arm-level statistic, so it needs a permutation test, not a paired one.

- Expert panel: underpowered at the SESOI after Holm (methods review); a different question from the lay raters
  => Experts now answer the P1 wording. FE is estimation only in the recommended design (D21): 4 contrasts (HE1, HE2, HE4, HE5), 72 briefs × 8 judgments, 20 experts, about 3 h each over 2–3 sessions. One third-party vendor recruits the experts, the designer, the coders and the Study 1b operators.
  WHY: At win .58 and α .0125, simulated expert power is .48–.56. A matching question removes the rater-type and wording confound in RQ5.

- Lay sessions: 20 minutes is unrealistic; the 25% allowance is thin; connectivity pairs
  => Pay stays $15/h. Sessions are budgeted at 30 minutes until the timing pilot sets the number of experimental trials (on the closed list). The allowance is 35% with a 1.5× cap. Connectivity pairs are dropped. The viewer defaults to one page at a time with Flip, after a side-by-side fold overview. A 20-person usability check on engineering briefs comes first.
  WHY: Forced scrolling of two tall pages and illegible side-by-side scaling make 40 s per trial implausible. The comparison graph is already connected through C1-H.

- Models, retirement and the schedule
  => The D3 recommendation is unchanged (Opus 5.5 / Fable 5.1, fixed effort, pinned and dated OpenAI image snapshot). The generation date is set by rule: the earlier of IPA + 10 days and 2027-06-30. Escrowed generation is shown as the base case. A registered successor rule (newest GA same-tier model with at least 90 days to retirement, plus a bridging check) handles deprecation, model-string changes and late regeneration.
  WHY: With realistic dates, IPA lands around August–November 2027, at or after Fable 5.1's earliest retirement. Retirement must never block the study or force a change of route (CR2).

- Timeline: the methods review wanted Stage 1 pulled earlier; the feasibility review found v1's dates 2–3 months optimistic
  => The central timeline is realistic: Stage 0 around 2027-02-01, pilot in February, Stage 1 around 2027-04-19, escrowed generation in July, IPA estimated August–November, Stage 2 around 2028-Q1. The critical path is shortened without loss of credibility: P0/P1 engineering tiers; confirmatory briefs written during review; gates moved off the Stage 1 path; brief count fixed now (D18); secondary measures trimmed.
  WHY: Stage 1 cannot honestly move earlier with a team of 1–3 people. The fixes cut weeks where no credibility is at stake.

- Escrowed pages after a reviewer-requested change: the methods review said destroy them unread; CR13 requires every request and response to be released
  => They are sealed permanently, never analysed, and released unanalysed in the Stage 2 archive, labelled as a superseded run. Regeneration follows only if at least 21 days remain before retirement; otherwise the successor rule applies, with an editor ruling.
  WHY: Permanent sealing removes the temptation as fully as destruction does, and keeps CR13's completeness.

- D3-auto inside the gated arm; no test of the article-demonstrated chain
  => D3-auto stays inside C1-H, labelled. H1a is described as 'the article's workflow plus project-designed AI stand-ins'. H1c (−D3 snapshot vs B-Plain, P1, in F1) is proposed under D19, at about $1k and with no new generation. The claims table fixes wording for the split outcomes.
  WHY: ADR-0024, ADR-0034 and ADR-0059 rest on D3-auto and −D3. H1c repairs the headline's construct validity at little cost, but it changes what F1 tests, so the user decides.

- TELLS-auto: per-row variants (v1) versus one combined variant (feasibility review)
  => The protocol shows the combined variant as the recommended option (D23), with one blind keep-or-revert call. The per-row form stays available if the user declines.
  WHY: D3-auto is a project-written proxy, not article text. The combined variant roughly halves D3's cost and latency and removes the variant-branching machinery. The earlier resolution had kept the per-row form, so the user decides.

- In-loop TELLS A/B used the P1 question nearly word for word
  => A.13 is reworded to the article's 'top studio execution' framing, which A.7 and A.14 already use. The outcome wordings are registered as instruments. The remaining construct overlap is declared in the CR12 register.
  WHY: It avoids optimizing C1-H against the outcome instrument's exact wording without breaking SM-4 (the A/B judge never sees the catalog).

- GPT-5.6 Sol worker arm
  => Unchanged: excluded and logged for Paper 2 (D14).
  WHY: CR4 bars adding arms after the pilot, and model-family generalization is rung 3.

- Venue: unverified acceptance of escrowed pre-IPA generation
  => D4 is now a go/no-go. Written editor answers on escrowed generation, the successor rule, the power minimum per test, the confidential pilot report and confidential reviewer remarks are due in October. The route never changes (CR2).
  WHY: Escrowed generation is the expected path, so the venue's acceptance is the main schedule risk.

- Critic tool: undefined detectors, prompt-lock comparison, score parser and early-stop behaviour
  => The detectors are fixed in Stage 0: a threshold regex in a score context, at least 8 consecutive tokens of brief or deck overlap, and fenced code or listed HTML/CSS/JS tokens. Prompts are compared after NFKC and whitespace normalization. The score parser accepts decimals. Three blocks count as repeated misuse. An early stop gets one fixed continuation line (A.17), at most twice, then the re-rank. Rates go to the Monitor per arm and to the team pooled.
  WHY: Undefined rules would produce false blocks and early stops concentrated in the loop arms, with loop length depending on the worker's whim.

- Critic calibration (v1's resolution text said 'the recipe changes whatever the result')
  => Corrected: the recipe does not change whatever the result. Critic validity is now a descriptive measurement, run by the Monitor during review and reported in Stage 2. It is no longer listed among the outcome-neutral checks.
  WHY: CR5 forbids tuning. A check with no consequence should not appear among the binding checks.

- Runbook additions to the article's prompts
  => Unchanged: the article's prompts are used verbatim, with only the declared substitutions.
  WHY: Each addition weakens the replication claim.

- ASSET: conditional on a human 'plain?' call versus the article
  => Unchanged: always on.
  WHY: The article applied the image step to all four designs unconditionally.

- Image tool available to all arms, and the OpenAI image model versus GPT as a held-out judge (CR12)
  => The same pinned image tool remains in every arm. Exposure granularity (provider family versus model line and role) is defined in Stage 0 with the Monitor's co-signature (D22). The register is timestamped now, and the held-out judge list is fixed at the lock. A GPT/OpenAI-image preference probe is computed from existing data.
  WHY: The team must not decide at analysis time which judges count as held out. Whether the image model exposes GPT is a judgment call with trade-offs, so the user decides.

- Brief draw could be reconstructed by the team; frame publication; count of briefs
  => The draw uses commit-reveal: the seed is SHA-256(drand round R ‖ Monitor secret). The rejection and edit logs are hash-chained and encrypted to the Monitor; counts are published now and identities at unblinding. The Monitor or copywriter exports the frame by a registered script. Only a hash and the item IDs are published; the full export stays under restricted access. A tie list is filed before round R. A stratum shortfall rule is added. The count is fixed at 72 with no reserve (D18).
  WHY: Under v1, the public script and round would have revealed all 72 sealed products about four weeks before the freeze. Third-party data terms argue against republishing the full listing.

- Development briefs: the charter audit would reveal them to the team; the feasibility review would seal them until the pilot release
  => They are sealed until the Monitor's release. Every dry run, cost probe, spike and load test, and the B-Outside owner's dry run, uses 3–4 published engineering briefs.
  WHY: This is the stricter option. It makes CR4's 'the Monitor sees pilot effects alone' literally true, at almost no cost.

- Opaque stimulus IDs (charter audit) versus the team's unavoidable ability to link stimuli to arms (feasibility review)
  => Both: rater-facing files get HMAC IDs on a cookieless origin. The real protection is ratings custody: responses are encrypted in the browser to the Monitor, and a Monitor-controlled validity service returns only exclusion flags and counts. The Judge build hash is in the lock manifest. All AI-judge and outcome-metric results are encrypted to the Monitor. The Stage 1 states plainly that the team can link stimuli to arms but never sees ratings.
  WHY: Perceptual matching defeats byte-level blinding of stimuli. Keeping the team away from the responses is what stops interim looks.

- Pilot release: per-arm diagnostics (feasibility review) versus no per-arm outcome-related release (charter audit)
  => The Monitor sees everything per arm. The release gives per-arm cost, timing, failure, retry, refusal and spend-stop rates (CR4's 'failure rates'). It gives copy compliance and render flags pooled only, and the list of unmirrored hosts with no arm labels. A registered threshold lets the Monitor trigger an all-arm mirror repair. AI-judge agreement is no longer released. Only the Monitor runs outcome metrics and AI judges on pilot outputs.
  WHY: The team needs to fix infrastructure but must not see guardrail outcomes by arm.

- Pilot design and the sealed pilot report's route
  => All arms plus A/A on the 12 sealed development briefs, on the confirmatory backend. About 1,500 lay judgments, encrypted to the Monitor. The Monitor sends the arm-level report directly to the editor as confidential material. A closed list fixes which quantities may change between Stage 0 and Stage 1; any other change is flagged and co-signed, and design changes are barred unless the editor or a reviewer requests them.
  WHY: The charter audit found nothing limited Stage 0→1 changes, and the report could leak through the authors.

- Claude as an AI judge
  => Unchanged: the panel is GPT-5.6 Sol, Gemini 3.1 Pro and one open-weight model; Fable 5.1 is a labelled probe. Every judge is reported with a validity flag. PPI, pointwise scores and distractor probes are deferred.
  WHY: CR8 requires every judge to be reported. The trimming reduces build work.

- Rater exclusions and gold items, which were undefined for the distinctiveness pool
  => Four check items per session. P1 pool: 3 designer-built defect-gold pairs plus 1 instructed-response item. P2 pool: 4 instructed-response items. All come from pages outside the study, are disjoint from the positive control, and are frozen by hash. The exclusion rules are unchanged and computed by the validity service. For gold accuracy of 80–90%: a sensitivity analysis. Below 80%: a pause with a closed list of permitted actions.
  WHY: Distinctiveness has no objective gold answer. The exclusion rule must be fixed in advance (CR8).

- Positive control and the confirmatory A/A (methods review)
  => Proposed under D20: designer-chosen strong-versus-generic exemplar pairs in each pool (24 pairs × 24 judgments). Threshold: win ≥ .70 with the CI lower bound above .58. Failure blocks 'No meaningful effect' in F3-EQ. A confirmatory A/A contrast is offered as an option. A pilot A/A failure triggers a registered checklist and a re-run before Stage 1.
  WHY: Equivalence claims are confirmatory, so the rating pipeline must be shown able to detect a difference. Adding contrasts and cost is the user's call.

- Generation replication and the replay cache
  => K = 4 is unchanged. Generation calls are never served by a replay cache, memoization or deduplication keyed on content. A duplicate first-response hash within an arm × brief halts the run as a suspected cache fault.
  WHY: Byte-identical first requests would otherwise collapse the four candidates into one, biasing S2 and P2.

- 'No cross-arm cache hits' check, which byte-identical forks make impossible
  => Each arm has its own Anthropic workspace and spend-capped key. The check is reworded as 'no cache reads across workspaces (from usage logs) and no replay or memoized response for any generation call'.
  WHY: Caches are reported to be isolated per workspace, so the property holds by construction. The real threat is replay, not shared cost.

- Tall full-page renders shrunk below legibility at the model input limit, versus the 'one image' critic input rule
  => Every model call gets the same tiled 'model view' (1440 × 2560 native tiles, at most 6), with a registered fallback when per-request image limits bind. The critic fidelity check is reworded to 'the model view of one render'. The port-rule wording is ratified under D10. The change is declared as deviation 13.
  WHY: A 1440 × 10,000 px page shrunk to about 2,576 px is a thumbnail. The tiles are still views of one render.

- Offline sandbox handicapping single-shot baselines that load CDNs and fonts
  => A frozen CDN, font and npm mirror built by a registered rule, intercepted identically at build, in the worker's render tool and in the final renderer. Unmirrored requests are logged. A mirror fix is an all-arm infrastructure repair. The change is declared as deviation 15.
  WHY: Loop arms see and fix broken renders, while baselines do not. Without a mirror, the infrastructure would bias the H1a gate.

- Spend caps per step as Class Q quality failures (v1) versus caps as spend protection (feasibility review)
  => The cap is per candidate: max(5× the pilot median, 1.5× the pilot maximum), under a hard per-study ceiling. A cap hit is a 'spend stop'. The last valid snapshot becomes the stimulus, and the event is reported per arm and excluded in a sensitivity analysis. The loop cap is also a process event, not a failure.
  WHY: 48 pilot candidates cannot estimate a heavy-tailed cost distribution. Caps would otherwise penalize the long-lineage arms mechanically.

- Drift handling: Monitor discretion (v1), automatic resume (feasibility review), model change as a deviation (charter audit)
  => Combined. Error-rate and latency pauses resume automatically after the canaries pass for 2 consecutive hours, with a Monitor or deputy veto, and the window extends by the paused time up to 21 days. A change in the returned model string halts the run, creates a deviation and triggers the successor rule.
  WHY: Scripted rules relieve the Monitor bottleneck (CR8). A model change is not a transient fault.

- Repairs 'until the lock' after the pilot, an undefined 'lock', and no rule beyond the cap
  => Four named events: prompt registration, freeze, Stage 1 manifest and lock. After the pilot, the Monitor must classify a repair before any rerun. A repair may not touch the article's verbatim prompts. The Monitor decides which arms it applies to, and it enters the diff table. Beyond the cap of 5, the arm runs as frozen. If the arm is non-functional (more than 50% Class Q), a new Stage 0 version is filed publicly. Infrastructure fixes are counted separately.
  WHY: Repairing C1-H's multi-step failures after seeing pilot pages raises its win rate directly, so the charter audit's tightening applies.

- Open pre-freeze window for project prompts, and paid dry runs before the Monitor
  => Prompt registration happens before the first paid study-prompt call and before round R. After it, changes are repair-only. Harness development has its own registry entry and keys, and its calls enter the tuning ledger. No paid run of a study recipe happens before the Monitor is contracted; any that does counts as tuning. The AI-contribution statement discloses that Claude drafted the prompts in chat.
  WHY: CR5 is a day-one rule. Under v1, C1-H-only prompts could have been iterated for about 10 weeks.

- Sealed material in team logs, key separation, and unseeded random draws
  => The recognition probe runs on the Monitor's machine with the Monitor's keys. Request and response bodies of sealed calls are encrypted to the Monitor. Each material has its own key pair (§4.5 table). Every random draw uses a drand round named in advance, and the rating schedule is pre-generated and hash-registered.
  WHY: Each was a path to peek at or re-roll results that the charter audit found.

- Ledger tamper window and verification of the lock by the harness itself
  => Ledger entries and artifact hashes stream in real time to write-once storage the Monitor owns, with hourly OpenTimestamps anchors. After the run, the Monitor independently checks the executed manifests and container digests. The pilot gets dedicated keys and provider reconciliation too.
  WHY: A daily root left a 24-hour rewrite window, and the pilot's nuisance parameters feed the caps and B-BoN's N.

- Monitor terms (charter audit) versus the Monitor as a bottleneck (feasibility review)
  => The contract carries all six CR1 powers, an independence attestation, termination only for cause, keys passing to the deputy, and a priced scope of work (estimate $10–20k). Monitor, deputy and guarantor are three different people (D7). Discretionary steps become scripted rules with 48-hour co-signature, and the deputy may act on all of them.
  WHY: The rules close the gaps in CR1 and remove on-call discretion, as CR8 prefers.

- Secondary analyses underspecified (methods review) versus too many instruments (feasibility review)
  => Trimmed and specified. S5, PPI, pointwise AI scores and distractor probes are deferred. Quality-weighted Vendi, the Bayesian Bradley–Terry model (with MCMC criteria), S8 and confidence ratings are exploratory. The BH set is enumerated (S2a–c, S3a–b, S4a–b), each with its statistic, test and direction. Guardrail margins carry written rationales and are tested unadjusted at one-sided .025.
  WHY: Trimming before Stage 0 costs no credibility. Every remaining test is then fully specified.

- Raster-image adjustment presented as a robustness check
  => It is relabelled as a controlled-direct-effect analysis, with a stated model, and it cannot change any verdict.
  WHY: Image presence is a mediator of ASSET, not a confounder.

- Implicit estimand, unstated pairing allocation, and the scheduler cap of 5 versus the simulation's 3 judgments per rater
  => The estimand is defined explicitly, with equal stratum weights. Unmatched pairings use the four cycles once each plus two seeded extra cycles, so each candidate appears 6 times, as in power_sim3. The scheduler cap is 6 per contrast per session, supported by the simulated type I error of .053 at m = 3 and .051 at m = 6.
  WHY: This closes the methods review's estimand and allocation questions with values that are already simulated.

- 60/72 brief rule: two decision methods (charter audit) and a decision driven mostly by pilot noise (feasibility review)
  => Recommended (D18): fix 72 confirmatory briefs now, with no reserve stratum, giving power of at least .90 at every worst-case Holm level in F1–F3. If the user keeps the rule, the only method is a simulation rerun by the Monitor.
  WHY: At 60 briefs, F1 (.87) and F2 (.85) miss .90. A decision on a 12-brief pilot SD is mostly noise.

- Power below .90 at the fixed sample size, with no stated action
  => With N fixed, the Monitor reruns the simulation on the released components. The Stage 1 reports the achieved power for every confirmatory test, and no test is added, dropped or moved. The venue's per-test minimum is settled under D4 beforehand.
  WHY: Dropping tests after seeing nuisance parameters opens a choice. Fixed-N honesty plus a pre-checked venue rule avoids it.

- Study 1b timing (charter audit and feasibility review)
  => Recommended (D15): decoupled. Study 1b generates its own C1-H comparators under its own lock and successor rule. Its Stage 0 is filed before Study 1's confirmatory lock and before any Study 1 rating.
  WHY: As scheduled in v1, Study 1b could not meet its retirement deadline and could have been shaped by interim Study 1 results.

- Copywriter workload and custody
  => The copywriter is contracted in October and calibrated on engineering briefs. R-FICT and the deck guide are registered before round R. There is one logged channel, encryption on the copywriter's machine and a hash-chained edit log. Only the 12 development briefs are written before the pilot; the 72 confirmatory briefs are written during Stage 1 review. S5 answer options are no longer needed.
  WHY: Four weeks over US Thanksgiving was not enough time, and CR6 requires every edit to be logged.

- Brand-tone balancing across strata
  => Unchanged: coded and reported, not balanced.
  WHY: Balancing would require non-random selection.

- Budget: v1's $60k central versus the feasibility review's $80–90k at 60 briefs
  => Re-itemized at 72 briefs: central ≈ $100k (≈ $66–141k), all estimates. The increase comes from re-priced generation, 30-minute sessions, the Monitor, red team, copywriter and legal lines, compute, hosting and cache lines, and the pre-pilot runs. Decision-dependent and contingent items, including a $15–20k regeneration reserve, are listed separately. A logged cost probe and quotes replace the guesses before D13.
  WHY: Known omissions should not be hidden in the 25% contingency. Every line is marked as an estimate.

# REVIEWS

VERDICT: I would not grant in-principle acceptance to v1. I would return it as not yet ready for Stage 1 review, with major revision expected. The bias-control architecture is unusually strong: an independent Monitor holds the keys, a single preregistered H1a gate, fixed N with no interim looks, scripted exclusions and replacement on opaque IDs, ITT with a failure taxonomy, Monitor-run confirmatory analysis, a nuisance-only pilot release, and a beacon-seeded draw with copywriter escrow. The arithmetic also holds where I could check it. I recomputed the §8 'T6 shortcut' and it reproduces H1a .95, F1 about .90, F2 .87, F3 .91 and H3f .95.

Three things block IPA as written:
1. The hypothesis set, SESOI, error-control scope, venue, model profile, ethics route and baseline prompts are all still open 'blocking' user decisions (D1–D8, D10). Several hypotheses are therefore conditional ('as adopted under D1', 'B-Skill (else B-Outside)').
2. The primary test's finite-sample form, and every power figure, are defined by reference to power_sim3.py. That file is not in the repository. Only C:/Users/arvik/OneDrive/Documents/ActAI/docs/research/2026-10-06-harness-research/power_sim2.py exists, and it simulates a brief-level t-test with an 800-rater pool, not the two-way cluster-robust test.
3. The core materials, the four article prompts, are still [TRANSCRIBE], so reviewers cannot check the 'verbatim' baseline claim.

Beyond those, several things need work before submission:
- P2 is called 'co-primary' but is gated and Holm-corrected.
- The SESOI plays no part in the superiority decision rule, and its rationale argues against itself.
- Outcome-neutral and manipulation checks have no binding consequences, which CR8 (ADR-0051) requires. A failed D3-auto or ASSET manipulation could even yield a 'no meaningful effect' equivalence verdict.
- There is no positive control, although equivalence claims are confirmatory.
- The expert family is underpowered at the SESOI once its Holm level is applied.
- The study design and claims table is deferred.
- The secondary analyses are underspecified.

User-decision flags:
- B-Skill, B-Outside and B-BoN are correctly flagged under D1. However, HE3 in the ungated expert family makes a beyond-article baseline a confirmatory claim whatever D1 and H1a decide.
- Two fixes I propose would add study elements and also need the user's decision: a positive-control contrast, and an article-core (−D3 snapshot) versus B-Plain contrast.
  [fatal] §2 hypotheses table; Appendix B.1 (D1–D8, D10): Most of the confirmatory design is still an open 'blocking' user decision:
- H4a–H4e exist only 'as adopted under D1', so F2's membership and Holm size (4 or 5 tests) are unknown.
- HE3 reads 'B-Skill (else B-Outside)'.
- Δ is a planning value (D5).
- Whether F3, F3-EQ and F4 are gated is D6.
- The 
  [fatal] §8 Sampling plan; §9.1 primary test; Appendix B.2 items 5–6: The protocol leans on power_sim3.py three ways:
- it is the 'source' of every power figure;
- it holds the finite-sample adjustment and the negative-variance fallback of the primary test;
- it is declared normative ('the registered code is the definition').
The file is not in the repository. Only po
  [fatal] Appendix A (A.B2, A.SEED, A.CRIT-W, A.ASSET); §5.3; D2: These four article prompts are marked [TRANSCRIBE] and given only as paraphrases:
- B-Random;
- SEED;
- the critic-loop worker prompt;
- ASSET.
CR4 (ADR-0047) requires the baseline prompts verbatim at Stage 0, and the replication claim rests on fidelity to these texts. Reviewers cannot assess either
  [major] §2 gatekeeping; §6.1; §9.11: P2 is called 'co-primary' (§6.1), and the abstract is to report 'both co-primaries (H1a and H2a)'. Inferentially, though, H2a is a gated, Holm-corrected member of F1, and it is 'not tested' if H1a fails. Calling a gated secondary 'co-primary' misstates the error structure, and reviewers will treat t
  [major] §2 decision rules; §9.3; §9.4: The SESOI is used to plan power but plays no part in the superiority decision rule. At 60 briefs, H1a rejects once the win rate exceeds about .543. A 'Supported' headline is therefore possible for an effect the authors themselves define as below the smallest effect of interest. 'Supported (below SES
  [major] §9.3 SESOI rationale (D5): The SESOI rationale works against itself. Point 2 argues that at .58 the difference 'nobody could tell from chance by eye', which suggests .58 itself is not practically meaningful, yet it is then used as the smallest effect of interest. Point 3, 'the stimulus budget detects .58', is a resource justi
  [major] §8 power table; §7.6 experts: At the SESOI (win .58) and 60 briefs, several confirmatory tests fall below the .90 that many RR venues expect:
- F1 ≈ .89–.90;
- F2 .87 at α .0125, and lower at α .01 with five tests;
- F3-EQ with Holm .88.
FE is the most serious case. Its power is reported only at α .05 and win .60/.62, but Holm o
  [major] §6.4 fidelity and outcome-neutral checks: CR8 (ADR-0051) requires numeric thresholds and stated consequences. Several checks have only interpretive consequences:
- if ASSET integrates images in under 80% of candidates, H3c is 'read in that light';
- if the DOM difference falls below 50%, H3d is 'read in that light';
- if the A/A arm fails, 
  [major] §6.4; §9 (equivalence claims): The confirmatory run has no positive control showing that the rating pipeline (viewer, pool, exclusions) can detect a difference of SESOI size. The A/A arm, a negative control, runs only in the pilot. Gold pairs are used for rater exclusion, so they cannot also serve as the sensitivity check. RR edi
  [major] §7.2, §7.4 exclusions; B.2 item 10: The main exclusion rule ('2 or more of the 4 gold and instructed-response items were failed') depends on gold items that are undefined for the distinctiveness pool (B.2 item 10 is open). It is also unclear for the quality pool: who builds the gold pairs, from what stimuli, and with what keyed answer
  [major] §2 FE family; §7.6: HE3 ('B-Skill (else B-Outside)') sits in FE, and FE is tested whatever H1a's result. A beyond-article baseline therefore becomes a confirmatory expert claim, ungated, whatever is decided under D1 and even if H1a fails. In the lay data the same contrast (F2) is gated behind H1a. This contradicts the 
  [major] §1, §3.1, §3.2 (C1-H definition); H1a gate: The gated 'replication' arm C1-H contains components the article never applied to landing pages:
- D3-auto AI proxies for CUT and TELLS, which 01-blocks marks 'experimental';
- loop caps, a plateau rule and a re-rank.
The article's landing-page demonstration ran SEED, then the critic loop, then ASSE
  [major] §9.11; B.2 item 13 (CR10 tables): The study design table and the results-to-claims table are deferred until D1–D6 are decided. This is the editor red team's request: a prospective interpretation for each hypothesis, including product consequences. Many RR venues require such a table at Stage 1, and CR10 requires it too. Without it, 
  [major] §6.2, §6.3, §9.7 secondary outcomes and guardrails: The secondary analyses are underspecified:
- the Benjamini–Hochberg set is never listed, so neither its size nor its members are known;
- S3 (cross-brief homogeneity) is an arm-level statistic, so a 'Wilcoxon signed-rank on paired per-brief differences' cannot be computed for it;
- S4's negative-bin
  [major] §12 timeline; §15.3 retirement contingency: The schedule submits Stage 1 around 2027-03-01, and pre-IPA escrowed generation triggers if IPA has not arrived by 2027-06-30. That leaves about 17 weeks for review including revision rounds, so the trigger is likely to fire. If Stage 1 reviewers then ask for design changes (for example the positive

VERDICT: Not ready for Stage 0. The protocol assigns a named mechanism to every rule from CR1 to CR14, and much of it is implemented well: Stage 0 is filed before pilot generation, H1a is the single gate, baselines are frozen verbatim before the pilot, the brief draw is drand-seeded, exclusions, failure classes and ITT are scripted, every AI judge is reported with a validity flag, generation is escrowed if retirement forces it, and the route never changes. But two design-level leaks defeat CR4 and CR6 as written, and nobody would see them being used.

(1) The team exports the sampling frame, and the draw script and drand round are public, so the team can recompute the permutation and the public rejection log and learn which real products sit behind all 72 sealed briefs. That happens about four weeks before C1-H is frozen.

(2) The "opaque" stimulus IDs are content hashes. With the team-run archive, which is tagged by arm, and the team-hosted Judge database, the team can recover arm-level pilot effects and interim confirmatory effects.

There are also 18 major issues. They leave places where the team can still:
- **tune:** an open pre-freeze window for project prompts that only C1-H uses; repairs after the pilot until an undefined "lock";
- **choose:** unlimited changes between Stage 0 and Stage 1; random draws with no named seed; exposure scope decided at analysis time; a primary-test function that exists only in a temporary scratchpad (power_sim3.py is not in the repo) and does not match the estimand;
- **peek:** team-run AI judges and metrics on pilot pages; the sealed pilot report's path to the journal and reviewers; plaintext sealed briefs in gateway logs; decryption keys not separated by material; a ledger that could be rewritten within a day;
- **spin:** a SESOI justified by power; a "co-primary" P2 sitting behind the gate; an undefined verdict for B-Outside; the in-loop TELLS A/B using the P1 question word for word.

The CR1 Monitor terms are incomplete, and the co-investigator's roles collide.

Caveat: Claude ran this audit, the same model family that drafted the protocol and serves as the study's worker and critic. It is not the Integrity Monitor's review, and a human Monitor must repeat it.

Key files: the protocol v1 (provided inline); the charter at C:/Users/arvik/OneDrive/Documents/ActAI/docs/adr/0044-*.md through 0057-*.md, plus 0059 and 0060; and C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-OneDrive-Documents-ActAI/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/power_sim3.py, which is not in the repo.
  [fatal] §4.1–4.2 Sampling frame and draw (CR6): The draw can be reconstructed, so the sealed briefs are not sealed. The team exports the 'complete listing' itself, and the draw script and drand round R are registered publicly. The team can therefore recompute each stratum's permutation the moment round R is published (~2026-11-20). The public rej
  [fatal] §4.5, §4.7 (Files), §7.2 Scheduler, §10 Custody (CR4, CR6, CR1(b)): 'The team sees opaque IDs only' is not blinding. Stimulus files carry content-hashed names. The team-operated gateway tags every call by arm (§5.10), and the team-run archive holds every render with its lineage. Re-hashing the archived renders therefore maps every opaque ID to its arm. The Judge app
  [major] §5.10 Freeze; Appendix A drafts A.0–A.16; §4.5 dry runs; §12 timeline (CR5, CR3, CR1): The repair-only rule starts only at the freeze, before pilot generation (~2026-12-18). Until then the project prompts used only by the C1-H family are still 'drafts ... to be finalized': D3-auto (A.9–A.13), re-rank (A.7), score line (A.6) and CRITIC-self routing (A.8). §4.5 also allows 'harness dry 
  [major] §10 Pilot: release list and custody (CR4): Only the human pilot ratings are sealed. The team runs pilot generation and holds every page with its arm, so it can compute arm-level pilot effects on S2–S5, G1–G4, the tells count and any AI judge. The frozen release list itself sends the team per-arm copy compliance and render-flag rates, which a
  [major] §10 and CR4 row: Stage 0 → Stage 1 changes (CR4): Nothing limits what may change between Stage 0 and Stage 1; the diff table only records the changes. Hypotheses, directions, family membership, D6 gating, margins, guardrail thresholds and B-Outside's status can all move in Stage 1. By then the team has seen the pilot pages, the nuisance parameters 
  [major] §10 'go to the journal with the Stage 1'; Appendix B.2 item 1 (CR4, CR2): The protocol does not say who sends the sealed arm-level pilot effects to the journal. If the authors upload them, the team sees them. Reviewers who read them will write comments the authors receive (for example, 'the pilot suggests −D3 is null; consider an equivalence claim'), which leaks direction
  [major] §9.1, §9.10, B.2 item 5, §8 (CR4, CR9, CR14): CR4 requires one primary test. The protocol defines it as 'the registered code' plus 'the finite-sample adjustment and fallback implemented in power_sim3.py'. That file exists only in the session's temporary scratchpad: it is not in git, not hashed and not timestamped. docs/research holds only power
  [major] §9.3 SESOI rationale, D5 (CR4): Rationale point 3 ('the stimulus budget detects .58 with power ≥ .90') derives the margin from power, the pattern the Editor lens flagged. Point 2 ('nobody could tell from chance by eye') would justify .10 just as easily. At ±.08, a block with a true win rate of .57 can be labelled 'No meaningful ef
  [major] §2 gatekeeping, §6.1, §9.11 abstract (CR10): P2 is called 'co-primary', and the abstract reports H1a and H2a. Yet H2a sits in the gated family F1, tested at a worst-case α of .0167, and is 'not tested' if H1a fails. If H1a fails and H2a's CI lies above .50, the 'co-primary' label invites an abstract that leads with distinctiveness.
  [major] §2 H4c/H4d, §9.4 verdicts (CR10, CR11): H4c and H4d (C1-H vs B-Outside, the outside baseline CR5 requires) state no direction. 'Supported' requires a predicted direction, and 'Worse' is defined relative to one, so the verdict for this contrast is undefined. The label and abstract sentence would be chosen after the data.
  [major] §5.4 step 4, A.13 TELLS A/B vs A.15 and P1 (CR12, ADR-0027/0015, CR5): TELLS-auto's in-loop keep-or-revert call asks the P1 outcome question nearly word for word ('Which page looks better designed?'), the same wording as the AI-judge quality prompt. Only the C1-H family gets an in-loop AI selection on the outcome question, so the team's choice of wording partly optimiz
  [major] §5.1 image model, §7.7 judges, CR12 row (CR12): CR12 retires a model family as a held-out judge once the product uses it 'as a feature'. Every arm uses a pinned OpenAI image model, and the product's ASSET block will probably use it too, while GPT-5.6 Sol is a held-out judge. GPT may also favour its own family's images, and C1-H uses the most imag
  [major] §4.3 recognition probe; §5.1 gateway logging (CR6): The probe sends decrypted confirmatory and reserve briefs to the worker and judge models through the team's gateway, which logs every request and response, headers included. Plaintext sealed briefs therefore land in team-readable logs before Stage 0, months before the lock. The same path exposes bri
  [major] §4.5 encryption; §15.3 escrow; §7.7 sealed validation set (CR6): 'Decrypted only inside the locked confirmatory run' means the team-operated harness holds a decryption key during the run. The protocol does not separate keys, so the key the harness receives may also open the stimulus-to-arm map, the escrow store from before IPA, the sealed validation labels or the
  [major] §5.8 run order; §7.2 scheduler; §7.7; §6.2; §14 (CR6, CR8): Several random draws name no seed in advance:
- run order 'at the lock' (no drand round named);
- candidate pairings and side assignment;
- the 200-pair sealed validation set;
- the 8 AI-judge pairs per brief-contrast;
- the 150 pages for detector validation;
- gold-trial placement;
- the A/A labels
  [major] §5.10 repairs 'until the lock'; §12 (CR5, CR7): 'Lock' is not pinned to a time: the pre-pilot freeze, the Stage 1 manifest and the lock after IPA are all called 'the lock'. Repairs stay allowed 'until the lock', that is, after the team has seen every pilot page and the per-arm failure rates. A failure card loses almost every comparison, so repair
  [major] §5.3 B-Outside invitation rule (CR5): The team still controls several choices:
- what counts as an 'open-source design-quality approach for coding agents', which is the universe that gets ranked;
- the wording of the invitation and any incentive;
- how a multi-turn or tool-dependent recipe is adapted to the harness;
- which human steps 
  [major] §11 CR1 row; D7; §9.10 guarantor (CR1): The CR1 row leaves out several parts of CR1:
- power (e): read access to the registry, archive and ledger;
- power (f): the contractual right to post results plus a dissent if a deadline is missed, a right that survives the company;
- the yearly integrity report;
- replacement as a public registry e
  [major] §11 CR7 row: ledger and reconciliation (CR7): The ledger root is timestamped once a day, and provider reconciliation compares per-key call and token counts, not content. Within the 24-hour window, outputs from an off-key rerun of matching size could replace ledger entries and archive artifacts without detection. The harness, which the team can 
  [major] Appendix A TRANSCRIBE prompts; CR4 row; D2 (CR4, CR13): CR4 requires the baseline prompts verbatim in a public Stage 0, and CR13 requires the prompts to be published by the end of data collection. Four prompts come from a paid article. If the author or the publisher refuses permission, there is no contingency. The user, an interested party, would also se

VERDICT: Feasible only with restructuring. The study design is sound, but the central schedule is about 2–3 months too optimistic for a 1–3 person team. The pilot-critical engineering alone is roughly 15–25 engineer-weeks, against the ~10 calendar weeks allowed (holidays included), and Registered Report Stage 1 review commonly runs past the assumed 8–16 weeks. On realistic dates, in-principle acceptance (IPA) arrives in about Aug–Nov 2027, at or after Fable 5.1's earliest retirement (2027-09-01). So the escrowed pre-IPA generation path in §15.3 is the expected case, not a contingency, and nobody has yet confirmed that the candidate venues accept it. That makes it the one go/no-go item: settle it with the editors as part of D4, in October.

Study 1b cannot meet its own retirement deadline as scheduled. A realistic central cost is about $80–90k before B-BoN or the 72-brief rule, not $60k. The main gaps are cost_model.py's D3 and context-growth assumptions, the Monitor fee, the copywriter, the red team and lay session length.

Several failure modes in the generation pipeline would silently bias or block the study and must be designed out before the pilot:
- a request-hash replay cache that could collapse the K=4 candidates into one;
- offline CDNs and fonts that handicap single-shot baselines;
- tall full-page renders downscaled below legibility at the model's 2576 px limit;
- the API rules for Opus 5.5 and Fable 5.1: no edits to earlier turns, forced tool choice rejected, refusals and silent fallbacks;
- an impossible "no cross-arm cache hits" lock check;
- undefined detectors in the critic filter and an undefined rule for when the loop ends.

The proposed simplifications would recover roughly 6–10 weeks without weakening credibility:
- fix the brief count now (72 recommended);
- fictionalize the confirmatory briefs during review rather than before the pilot;
- move the DreamSim gate, detector κ coding and critic-validity run off the Stage 1 critical path;
- trim the secondary outcomes before Stage 0;
- use one Anthropic workspace per arm;
- turn the Monitor's on-call decisions into scripted rules;
- use separate engineering briefs for harness work;
- run Study 1b on its own timeline, separate from Study 1.
  [fatal] §12 Timeline, §15.3 retirement contingency, D4 venue: The central path assumes harness + gates by 12-18, Stage 0 ~12-21, pilot in January, Stage 1 ~03-01, and IPA in May–June after 8–16 weeks of review (unverified). Realistically, a 1–3 person team reaches the pilot around March and Stage 1 around May. RR Stage 1 review often needs two or more rounds, 
  [major] §12 harness row; ADR-0059 'before the pilot' items: The pilot is a 'full dry run of the pipeline'. Before 2027-01-04 it needs:
- the gateway spend gate and hash-chained ledger;
- the recipe format and bypass transform;
- the validator with taint tracking, and the conformance suite;
- escrow;
- the sandbox plus npm, CDN and font mirrors;
- the render 
  [major] §5.2, §5.9; architecture.md 'replay cache keyed by request hash': K=4 independence depends on fresh sampling, because temperature and top_p are unavailable. The four sessions of each arm send byte-identical first requests: the same system prompt, prompt and brief block. Any request-hash cache would return the same first response to all four. That includes the engi
  [major] §4.6–4.7 offline build and render; §5.2: Pages are built in an offline sandbox and rendered from an offline origin. Plain-prompt single-file pages commonly load Tailwind from cdn.tailwindcss.com, Google Fonts, or scripts from unpkg or jsdelivr. Offline, these render unstyled or with fallback fonts. Loop arms see the broken render through t
  [major] §4.7 viewports; §5.4 critic tool; §7.7 AI judges: Current Claude models accept at most 2576 px on the long edge (~3.75 MP, ≤4,784 visual tokens). A desktop full-page render of 1440 × 6,000–15,000 px reaches the critic, the worker's render tool, CUT and TELLS reviewers, the re-rank and the B-BoN selector at roughly 250–620 px wide. Body copy is then
  [major] §5.1 model profile, §5.2 harness, §5.9 failure taxonomy: Several API behaviours of Opus 5.5 and Fable 5.1 break the harness as written.
- (a) Organizations created on or after 2026-08-31, which includes a new dedicated study org, are enforced on the preserved-thinking history-editing check. Any edit to an earlier turn returns 400: dropping old screenshots
  [major] §6.4 fidelity checks; ADR-0059 assertions: Branches are forked byte-identically from C1-H and B-Plain conversations into other arms, and every arm shares the system prompt and tool definitions. With prompt caching on in one workspace, cross-arm cache hits are certain, so 'No cross-arm cache hits — 100%, otherwise the lock refuses to run' blo
  [major] §5.4 step 2 (design_critic tool, loop limits): Three parts of the critic loop are undefined.
- (a) The gateway blocks critic prompts containing 'the threshold, code or brief text', but the detectors are not specified. Natural critic prompts mention scores ('score out of 10'), numbers and the product category. False positives lead to repeated blo
  [major] §13 budget; cost_model.py: cost_model.py misses several costs.
- **D3 is under-priced:** it is costed at 4 Fable calls plus 2 worker fixes ($2.42). §5.4 specifies CUT for up to 2 rounds, a TELLS sweep, and up to 4 swap variants, each with a worker edit, a render and a blind A/B. That is about 5–6 Fable calls and 4–6 worker ed
  [major] §7.2 session and viewer; §13 A3: A 30-trial session in 20 minutes means about 40 s per trial. That has to cover forced scrolling to the bottom of two full pages (often 4–10k px), the 8 s lock, the choice and confidence rating, plus consent, the screener and the blinding check. Two 1440 px renders side by side in a 1280–1440 px wind
  [major] §8 sample-size rule (60 vs 72): The rule switches to 72 briefs if re-run matched power is below .90 at win .58 and α .0125. The planning values already give .907 at 60 briefs, right at the threshold. The pilot estimates the between-brief SD from 12 briefs × 8 judgments, where within-brief noise (.218/8) dominates.

I simulated thi
  [major] CR1 / §11 / §12 (Monitor), §13 C1: The Monitor sits on the critical path at many points:
- contracted by 11-15, five weeks away, with a publication-freedom contract that needs legal review first;
- approves the Stage 0 thresholds over the holidays;
- applies the B-Outside invitation rule, although §12 sends invitations in October, be
  [major] §14 Study 1b: Study 1b is a separate Registered Report filed after Study 1's Stage 1 (~March), so its own IPA cannot plausibly arrive before its 2027-08-15 operator deadline or the 2027-09-01 Fable window. It also uses Study 1's confirmatory C1-H pages as comparators, and those exist only after Study 1's own late
  [major] §5.3 B-Outside invitation rule: The leading outside approaches are Claude Code skills or plugins. They rely on multi-file progressive disclosure, slash commands, subagents, hooks or MCP browsers. The engine is not Claude Code and only injects text into the system prompt, so 'runs unmodified' is undefined. Owners have nothing to te
  [major] §5.1 routing, §5.8 generation window, §12 accounts: A new dedicated organization starts in low usage tiers with rate and monthly spend limits. Confirmatory generation means about $15–20k in 10 days, a burst of about 36 root sessions per brief within one hour, and Fable multi-image calls. That likely exceeds self-serve limits. Priority Tier is unavail
  [major] §4.2–4.4 copywriter; §12 (11-20 → 12-18): Four weeks, spanning US Thanksgiving, must cover:
- screening about 150–250 frame items with every rejection logged;
- stratum and tone coding;
- 72–84 fictionalized briefs, each with trademark searches in three offices;
- 72–84 copy decks marked REQUIRED or OPTIONAL;
- the recognition-probe round t

# STATS
I ran the simulations and saved the script as power_sim3.py. The full run took 894 s on 16 cores: 4,000 reps per cell and 480–960 reps per mixed-logistic cell. statsmodels is not installed and I installed nothing, so the GEE and the crossed mixed logistic are written by hand in numpy/scipy. A built-in self-check (`--selfcheck`) shows the GEE matches a generic iterative GEE exactly and the mixed-logistic fitter recovers the components it was given. All variance components are the study1-draft assumptions until the Integrity Monitor's pilot release replaces them.

The data model differs from power_sim2 in two ways:
- **Rater pools.** Raters are a finite pool shared across briefs: lay raters give 3 judgments each per contrast, and the experts are a fixed panel of 12 or 20.
- **Pairings.** Candidate pairings are balanced within each brief.

**1) Choosing the primary test.**
- **GEE adds nothing here.** With a fixed number of judgments per brief, an intercept-only GEE clustered by brief gives exactly the pooled win rate, the same estimate as the brief-level test.
  - Its default sandwich z-test is liberal: type I .058–.059, pooled over 36,000 null reps.
  - With the Mancl–DeRouen correction and a t(B−1) reference it is about the same as the brief-level t-test.
- **The crossed mixed logistic** (brief, candidate and rater effects, Laplace approximation) gains no power.
  - It is conservative for lay raters (.021–.051) and slightly liberal for experts (.050–.071).
  - The rater SD collapses toward 0 for lay data. It works as a robustness check, not as the deciding test.
- **The brief-level t-test is close to nominal for lay raters**: .052 at α .05, and .0145 against .0125 at α .0125.
- **It is badly liberal for the expert panel**: .07–.16, because the same 12–20 experts judge every brief and their shared taste is ignored.
- **The fix is a two-way (brief × rater) cluster-robust SE on the same brief-level estimate.** It holds .041–.058 in every scenario and costs lay power only .005 on average (at most .02).

**2) Sample size**, at J=24 lay judgments per brief-contrast:

| Briefs | H1a gate, win .58, α .05 | Matched ablations, win .58, α .0125 |
|---|---|---|
| 48 | .90 | .82 |
| 60 | .95 | .91 |
| 72 | .98 | .95 |

- Downstream replication contrasts at win .58 under worst-case Holm (α .025 / .0125): .84/.77 at 48 briefs, .92/.87 at 60, .96/.92 at 72.
- A true win rate of .55 is underpowered everywhere (≤ .74).
- More judgments per brief buy little. The spread of per-brief win rates is about .140² + .195/J for unmatched contrasts, so roughly 70% of the variance is between briefs and only more briefs reduce it.
- **Equivalence when the true effect is zero**, matched ablations at J=24 and 48/60/72 briefs:
  - ±.08: .93/.97/.99 per test at α .05, and .75/.88/.95 with worst-case Holm over 4 equivalence claims (.0125).
  - ±.06: .64/.78/.88 per test.
  - ±.05: not reachable in this grid (≤ .74).

**3) Expert panel** (8 judgments per brief-contrast, 48 briefs, using the valid two-way test). 20 experts beat 12 for the same 1,920 judgments and expert hours:
- win .62, α .05: .94 vs .90
- win .60: .84 vs .77
- win .62, α .01: .80 vs .68
- if expert taste varies more (SD .5): .88 vs .80

The draft's ".90 at 62%" came from power_sim2's default pool of 800 raters, not 20 experts, and from the brief-only test. Done correctly, at the draft's α .0167 the figure is .86 for 20 experts and .76 for 12.

**Decisions for you:**
- **Extra baselines.** You were told Paper 1 tests C1 against the plain and 'be creative' baselines. B-Skill (Anthropic's frontend-design skill, already in the draft), the outside baseline under CR5 and a best-of-N arm would each add a contrast and enlarge the Holm families, so the tables show α .05/.025/.0125.
- **Smallest effect worth detecting and the equivalence margin.**
- **Two-sided tests.** I used two-sided tests that also require the predicted direction.
- **Error control within each family or across the whole study.** A study-wide correction would push α lower than the tables assume.
PRIMARY: Use one primary test for every human pairwise contrast, lay and expert.
- **Estimate:** the mean of the per-brief win proportions. The number of judgments per brief-contrast is fixed by CR8's replace-to-quota rule, so this equals the pooled win rate.
- **Test:** against .50 with a two-way (brief × rater) cluster-robust standard error (Cameron-Gelbach-Miller), using a t reference with df = min(briefs, raters) − 1.
- **Decision rule:** two-sided, and a win also requires the estimate to be in the predicted direction. The equivalence and non-inferiority intervals use the same SE.
- **Why:**
  - For lay pools it behaves like the brief-level t-test, at .005 less power on average.
  - It stays nominal (.041–.058) in every scenario, including the 12- or 20-person expert panel, where the brief-only t-test over-rejects (.07–.16).
  - It is about 10 lines of script the Monitor can rerun.
- **Sensitivity and robustness, all preregistered:**
  - the brief-level t-test and the sign-flip randomization test as sensitivity analyses;
  - the crossed mixed logistic (win ~ 1 + position + brief, candidate and rater effects, lme4 glmer run by the Monitor) as robustness. It is not used to decide, because it is conservative for lay data and its rater variance collapses toward 0.
- **Drop GEE as the primary.** It gives the same estimate here, and its default z-test is liberal (.058–.059).
- **Scheduler requirements:** the Judge scheduler must log rater IDs, show each rater any brief at most once per contrast, and balance candidate pairings within each brief.
N: Use 60 confirmatory briefs (12 strata × 5). With the 12 development briefs, that means writing 72 briefs instead of the draft's 60.
- **Lay raters:** 24 judgments per brief-contrast in each question pool (quality and distinctiveness), about 3 per rater per contrast.
- **Experts:** 20 experts × 8 judgments per brief-contrast, analysed with the two-way test. At 60 briefs that is 2,400 judgments, about 120 per expert. Do not use 12: for the same expert hours, 20 gives .94 against .90 at win .62 and .84 against .77 at .60 (48 briefs).
- **What 60 × 24 delivers under the assumed components:**
  - H1a gate: power .95 at win .58 (α .05).
  - Downstream replication contrasts: .92 / .87 at .58 (α .025 / .0125).
  - Matched ablations: .91 at .58 (α .0125).
  - Non-inferiority for −SEED: .95.
  - Equivalence at ±.08: .97 per claim, .88 with Holm over 4 claims.
  - Variable cost is about $14.9k, against $12.0k at 48 × 24.
- **Go to 72 briefs (about +$3k) if:**
  - you want ≥ .90 on Holm-adjusted equivalence at ±.08;
  - Stage 0 sets the margin at ±.06 (.88 per claim at 72, .78 at 60);
  - or the Monitor's pilot components push matched-ablation power at .58 below .90. Rerun power_sim3.py with the released components, or apply the shortcut formula in T6. This replaces the draft's brief-SD > .8 / candidate-SD > 1.0 trigger.
- **Effects of .55 and margins of ±.05 cannot be reached in this grid.** They need roughly twice the briefs.
- **Prefer briefs to judgments:** about 70% of the variance in per-brief win rates is between briefs, so going from 24 to 32 judgments adds only about .02–.04.

## T1. Primary-test choice: type I error (alpha .05, two-sided) and power. Lay: 48 briefs, 24 judgments per brief-contrast, 3 judgments per rater per contrast unless noted. U = unmatched contrast (all candidate pairings), M = matched lineage (rho .6). Reps per cell in brackets.
| Test | Type I lay U / M | Type I lay stress* | Type I experts, 12-person panel: U / M / U at expert SD .5 | Type I experts, 20-person panel: U / M | Power lay U win .60 @ .0125 | Power lay M win .58 @ .0125 | Power experts, 20, U win .62 @ .05 |
|---|---|---|---|---|---|---|---|
| brief-level t-test (draft primary) | .052 / .053 [36k pooled] | .059 | .075 / .095 / .136 [4k] | .071 / .072 [4k] | .94 | .82 | .97 (inflated, not valid) |
| sign-flip randomization (brief level) | .051 / .047 [4k] | .056 | n/a | n/a | .93 | .80 | n/a |
| GEE-z (logit, exchangeable, clustered by brief) | .058 / .059 [36k] | .066 | .096 / .126 / .166 [960] | .081 / .086 [960] | .95 | .84 | .96 (inflated) |
| GEE, Mancl-DeRouen SE + t(B-1) | .049 / .049 [36k] | .056 | .084 / .110 / .146 [960] | .069 / .067 [960] | .93 | .80 | .95 (inflated) |
| **two-way (brief x rater) cluster-robust t, df = min(B,R)-1** | **.049 / .048 [36k]** | **.051** | **.041 / .050 / .048 [4k]** | **.050 / .048 [4k]** | **.93** | **.81** | **.94** |
| crossed mixed logistic, Laplace, Wald z | .035 / .051 [960] | .021 [480] | .062 / .069 / .071 [960] | .060 / .050 [960] | .93 (t-test on the same data .94) [480] | .77 (t-test .77) [480] | .94 [480] |

*Stress: brief SD .8, candidate SD 1.2, rater SD .8, 6 judgments per rater per contrast. At alpha .0125 under the null (pooled 36k): t-test .0144 / .0147 vs two-way .0132 / .0131. Averaged over the whole grid, the two-way test's power is .005 below the t-test's (at most .020). Brief-only expert type I is inflated because the same 12–20 experts judge every brief.

## T2. Unmatched contrasts (H1a gate; H1b/H1c; distinctiveness; -SEED). Brief-level t-test power at alpha .05 / .025 / .0125 (gate / worst-case Holm with 2 / 4 contrasts). Lay, 3 judgments per rater per contrast, 4,000 reps per cell.
| Briefs | Judgments per brief-contrast | win .55 | win .58 | win .60 | win .62 | type I @.05 | generation + lay cost* |
|---|---|---|---|---|---|---|---|
| 48 | 16 | .48/.37/.27 | .86/.78/.69 | .97/.94/.90 | .99/.99/.98 | .047 | $10.9k |
| 48 | 24 | .55/.42/.32 | .90/.84/.77 | .98/.96/.94 | >.99/.99/.99 | .051 | $12.0k |
| 48 | 32 | .56/.45/.34 | .92/.87/.80 | .99/.97/.95 | >.99/>.99/.99 | .061 | $13.1k |
| 60 | 16 | .57/.46/.35 | .93/.88/.81 | .99/.98/.96 | >.99 | .056 | $13.6k |
| 60 | 24 | .62/.51/.41 | .95/.92/.87 | .99/.99/.98 | >.99 | .044 | $14.9k |
| 60 | 32 | .65/.54/.44 | .97/.94/.90 | >.99/.99/.99 | >.99 | .049 | $16.3k |
| 72 | 16 | .66/.54/.44 | .96/.93/.89 | >.99/.99/.98 | >.99 | .052 | $16.3k |
| 72 | 24 | .70/.60/.50 | .98/.96/.92 | >.99/>.99/.99 | >.99 | .050 | $17.9k |
| 72 | 32 | .74/.63/.54 | .99/.97/.95 | >.99/>.99/.99 | >.99 | .054 | $19.6k |

*Variable cost only, from cost_model.py's unverified assumptions: $180 per brief for generation (9 arms, 4 candidates, 25% contingency), plus 12 contrasts x briefs x judgments x $0.24 per lay judgment (20% extras, 33.3% Prolific fee). Excludes the pilot, experts, copy decks and any extra baseline.

## T3. Matched-lineage ablations (H3a-d: -CRITIC, CRITIC-self, -ASSET, -D3). Brief-level t-test power at alpha .0125 / .01 (worst-case Holm with 4 / 5 contrasts).
| Briefs | Judgments per brief-contrast | win .55 | win .58 | win .60 | win .62 | type I @.05 |
|---|---|---|---|---|---|---|
| 48 | 16 | .30/.27 | .74/.71 | .93/.91 | .98/.98 | .046 |
| 48 | 24 | .36/.33 | .82/.79 | .96/.95 | >.99 | .045 |
| 48 | 32 | .40/.37 | .85/.83 | .98/.97 | >.99 | .054 |
| 60 | 16 | .39/.36 | .85/.83 | .97/.96 | >.99 | .049 |
| 60 | 24 | .47/.43 | .91/.90 | .99/.99 | >.99 | .060 |
| 60 | 32 | .51/.48 | .94/.93 | .99/.99 | >.99 | .056 |
| 72 | 16 | .46/.43 | .92/.91 | .99/.99 | >.99 | .054 |
| 72 | 24 | .53/.50 | .95/.94 | >.99 | >.99 | .053 |
| 72 | 32 | .61/.57 | .97/.97 | >.99 | >.99 | .055 |

## T4. Equivalence (TOST) power when the true win rate is exactly .50. Cell = 90% CI inside ±margin (alpha .05 per claim) / 97.5% CI inside (worst-case Holm over 4 claims). Non-inferiority for -SEED quality: lower 95% bound > .42. Last two columns: SD of per-brief win rates (unmatched / matched).
| Briefs | Judgments | U ±.08 | U ±.06 | U ±.05 | M ±.08 | M ±.06 | M ±.05 | non-inferiority U | SD U / M |
|---|---|---|---|---|---|---|---|---|---|
| 48 | 16 | .84/.56 | .47/.07 | .20/.00 | .87/.61 | .51/.10 | .25/.01 | .86 | .179/.172 |
| 48 | 24 | .89/.65 | .56/.15 | .30/.01 | .93/.75 | .64/.24 | .39/.02 | .90 | .167/.158 |
| 48 | 32 | .90/.72 | .62/.21 | .35/.03 | .95/.80 | .70/.33 | .44/.05 | .92 | .161/.151 |
| 60 | 16 | .92/.74 | .63/.23 | .37/.02 | .94/.79 | .68/.31 | .43/.05 | .92 | .179/.172 |
| 60 | 24 | .96/.83 | .73/.36 | .48/.07 | .97/.88 | .78/.46 | .54/.13 | .95 | .167/.158 |
| 60 | 32 | .97/.87 | .77/.43 | .52/.11 | .98/.92 | .83/.55 | .62/.21 | .97 | .161/.151 |
| 72 | 16 | .96/.86 | .75/.41 | .51/.09 | .97/.89 | .79/.48 | .56/.15 | .96 | .179/.172 |
| 72 | 24 | .98/.92 | .83/.54 | .61/.18 | .99/.95 | .88/.63 | .68/.31 | .98 | .167/.158 |
| 72 | 32 | .99/.94 | .85/.60 | .65/.26 | .99/.97 | .90/.71 | .74/.38 | .99 | .161/.151 |

If the true block effect is .52 or .53 instead of .50 (normal approximation, J=24, matched, ±.08, alpha .05): .82 / .70 at 48 briefs, .90 / .78 at 60, .94 / .85 at 72.

## T5. Expert panel: 8 judgments per brief-contrast, 48 briefs. Cell = brief-only t-test (ignores the shared panel) / two-way brief x expert cluster-robust t (valid). 4,000 reps.
| Panel size | Expert taste SD | Contrast | type I @.05 | win .58 | win .60 | win .62 | win .65 | win .62 @ .01 |
|---|---|---|---|---|---|---|---|---|
| 12 | .3 (assumed) | U | .075 / .041 | .71 / .57 | .86 / .77 | .96 / .90 | >.99 / .99 | .87 / .68 |
| 12 | .3 | M | .095 / .050 | .72 / .56 | .87 / .76 | .96 / .90 | >.99 / .98 | .87 / .67 |
| 12 | .5 | U | .136 / .048 | .69 / .44 | .83 / .65 | .93 / .80 | .99 / .94 | .84 / .52 |
| 12 | .5 | M | .163 / .047 | .69 / .42 | .84 / .60 | .93 / .78 | .99 / .92 | .84 / .49 |
| 20 | .3 (assumed) | U | .071 / .050 | .72 / .65 | .89 / .84 | .97 / .94 | >.99 / .99 | .88 / .80 |
| 20 | .3 | M | .072 / .048 | .72 / .64 | .89 / .82 | .97 / .94 | >.99 / .99 | .88 / .79 |
| 20 | .5 | U | .100 / .048 | .70 / .54 | .86 / .76 | .95 / .88 | >.99 / .99 | .86 / .70 |
| 20 | .5 | M | .116 / .054 | .71 / .54 | .86 / .74 | .95 / .88 | .99 / .98 | .87 / .67 |

Two-way test with more briefs, cell = win .60 / .62 at alpha .05:

| Panel size | Contrast | 48 briefs | 60 briefs | 72 briefs |
|---|---|---|---|---|
| 12 | U | .77 / .90 | .84 / .94 | .88 / .96 |
| 12 | M | .76 / .90 | .82 / .94 | .87 / .96 |
| 20 | U | .84 / .94 | .90 / .97 | .93 / .98 |
| 20 | M | .82 / .94 | .89 / .97 | .93 / .98 |

At the draft's alpha .0167, win .62, two-way test: .86 with 20 experts, .76 with 12 (the draft's .90 used an 800-rater pool).

## T6. How the brief count holds up if the variance components differ (24 judgments per brief-contrast, brief-level t-test). Cell = unmatched win .60 @ .025 / matched win .58 @ .0125. Last column: SD of per-brief win rates at 48 briefs.
| Scenario | 48 briefs | 60 briefs | 72 briefs | SD U / M |
|---|---|---|---|---|
| assumed (brief .5, candidate .8, rater .5, rho .6) | .97 / .81 | .99 / .89 | >.99 / .95 | .162 / .155 |
| brief SD .8 | .88 / .61 | .95 / .74 | .98 / .83 | .191 / .190 |
| candidate SD 1.2 | .94 / .76 | .98 / .87 | .99 / .93 | .173 / .163 |
| brief SD .8 + candidate SD 1.2 | .88 / .60 | .95 / .73 | .97 / .82 | .193 / .192 |
| optimistic (brief .3, candidate .6) | >.99 / .94 | >.99 / .98 | >.99 / .99 | .138 / .129 |
| rater SD .8, 6 judgments per rater | .97 / .83 | .99 / .91 | >.99 / .96 | .158 / .150 |
| rho .4 | .96 / .80 | .99 / .89 | >.99 / .94 | .162 / .159 |

Resizing shortcut (matches the Monte Carlo within about .02): power ≈ P(noncentral t, df = B-1, ncp = sqrt(B)*(win - .5)/SD > t_crit). The SD of per-brief win rates is about sqrt(.140² + .195/J) unmatched and sqrt(.126² + .218/J) matched.

CAVEATS:
- All variance components are planning assumptions from study1-draft.md: brief SD .5, candidate SD .8, lay rater SD .5, expert rater SD .3, rho .6, K=4, 3 judgments per lay rater per contrast. The pilot release replaces them under CR4. The script takes --tau-b --sig-c --sig-r --sig-r-expert --rho --m overrides, and the T6 shortcut needs only the SD of per-brief win rates.
- 'True win rate' is the marginal win rate, averaged over briefs, candidates and raters; delta is calibrated to it. That is what the brief-mean estimate targets. The mixed logistic's coefficient is a conditional log-odds and is larger in magnitude.
- Every test is two-sided and also requires the predicted direction. Holm power is shown at the worst-case α/m, which is a lower bound; real Holm power is higher. Power for H1a and a downstream contrast together is at least P(H1a) + P(downstream) − 1. That is close to the downstream power alone if H1a's true effect is ≥ .62, as expected against Plain (≥ .65).
- Holm family sizes depend on decisions that are yours. B-Skill (Anthropic's frontend-design skill, already in the draft but not part of what you were told Paper 1 tests), the CR5 outside baseline and a best-of-N arm would each add a contrast to the replication and distinctiveness families. The tables show α .05/.025/.0125 for that reason. Whether error is controlled within each family or across the whole study is also open; a study-wide correction would push α below these columns.
- Equivalence power assumes a true effect of exactly .50. At .52 or .53 it falls: matched, ±.08, 60 briefs: .97 → .90 → .78. Under CR4 the margin must come from a written rationale (Stage 0), not from these tables or the pilot.
- The lay grid uses the brief-level t-test, because it is cheap to run at 4,000 reps per cell. The recommended two-way test has the same power to within .005 on average (at most .02 lower) and slightly smaller equivalence power.
- The crossed mixed logistic is hand-written: a Laplace approximation with the fixed effect estimated jointly (lme4 nAGQ=0 style), and one SD shared by the A and X candidate effects. It is not lme4. The Monitor should run glmer in R for the preregistered robustness model.
- Not simulated: position (left/right) bias, which is randomized and only adds noise; rater exclusions and replacements; ITT failed pages; unequal judgments per brief, under which GEE and the brief mean weight briefs differently; outcomes being correlated across contrasts. Candidate pairings are assumed balanced within brief.
- Monte Carlo error: about ±.007 at type I .05 with 4,000 reps (±.002 pooled over 36,000), ±.016 at power .5. Mixed-logistic cells have 480–960 reps.
- Cost columns cover generation and lay ratings only, using cost_model.py's unverified token assumptions. They exclude the pilot, experts (about $5.6k at 60 briefs at the draft's pace), copy decks, the IRB and any extra baseline arm.
- Several of the draft's numbers need correcting:
- Expert power: '.90 at 62%' used power_sim2's default 800-rater pool and the brief-only test. The valid figure at α .0167 is .86 with 20 experts, .76 with 12.
- Type I: the claim 'checked at nominal' is slightly optimistic for the brief-only test at small α (.0145 against .0125).
- Venue power rules: RR venues often expect ≥ .90 power per test. Check PLOS ONE RR's and RSOS's actual rules.

# PROMPTS

- Baseline 1: plain prompt (the article's control) (pp06 (scratchpad/pages/p06.png), 'Prompt:' block under Technique 1, exact=True): Build me a landing page for my productivity app.
  NOTE: This is the one direct quote I reproduce. Source: Anshu Chimala, 'How to turn your AI into a world-class designer', Lenny's Newsletter, 2026-09-01, p6. The article shows the whole prompt, and it matches the task's wording exactly, final period included. Setup: four separate Claude Code instances eac

- Baseline 2: 'be creative' prompt (pp07, 'Prompt:' block, exact=False): [NOT VERBATIM: copyright limit; transcribe from p07] The Baseline 1 sentence, unchanged, followed by two short imperative sentences (13 words in total). The first asks for a totally unique result. The second tells the model to make every design decision completely at random.
  NOTE: The article shows the full prompt: three sentences in one block. The phrases 'totally unique' and 'completely at random' named in the task are the article's own words. A page-edge crop cuts the first word of the third sentence to two letters ('Ma'); article_notes.md and the context give 'Make'. Labe

- Technique 1 SEED: String Seed of Thought procedure prompt (pp08, 'Prompt:' block (outputs on p09), exact=False): [NOT VERBATIM: transcribe from p08] It opens with a first-person restatement of the Baseline 1 request (same product phrase). Then comes a procedure header and three numbered steps. (1) Use a shell script to produce a long random alphanumeric string. (2) Derive the creative direction from the string (palette, layout, typography, and so on), looking past the surface for sub-patterns, special number
  NOTE: The article presents this as the real prompt in a 'Prompt:' block, not a paraphrase; article_notes.md is wrong to label it '(paraphrased)'. The full prompt is shown. A page-edge crop cuts the last word of step 2 after 'insp', with 'you.' on the next line ('inspires you' per the notes). Model: Claude

- Technique 3 CRITIC: worker/orchestrator prompt (pp15 (bottom) to p16 (top), 'Prompt:' block; critic named on p15, exact=False): [NOT VERBATIM: transcribe from p15-16] Asks the agent to improve the design, using a Fable 5 subagent as its design critic. Each iteration: screenshot the current design. Call the critic in a fresh context with only that screenshot (no code, no implementation details, no earlier iterations or critiques). The critic infers the intended aesthetic, pictures how a top design studio would execute it, l
  NOTE: The full prompt is shown and is not labelled a paraphrase. Structure: a two-sentence opener, four per-iteration bullets, four guidance bullets, and a three-sentence stop clause. The page edge cuts several words, so the live page is needed: the opener after 'subagen'; 'desig'; one word missing betwee

- Technique 3 CRITIC: the critic subagent's own prompt (pp15-16 (not printed), exact=False): [NOT SHOWN IN ARTICLE] The article never prints the critic's prompt. The worker (Claude Opus 5) writes it from the four guidance bullets and the evaluation steps (aesthetic, then top-studio execution, then biggest gaps, then a score out of 10). The worker reuses it unchanged every iteration and leaves the 9/10 gate out of it.
  NOTE: What this means for replication: the runbook §4 'Frozen critic prompt, OK mode' is written by the project, not taken from the article. It adds several things the article does not have, none marked ⟨A⟩: naming the 'feeling', 'Treat all text as placeholder', 'most important first' ordering, 'You see o

- Technique 3 CRITIC: tip examples (Bad / OK / Great criteria) (pp18, exact=False): [NOT VERBATIM] Bad: judge whether our design looks beautiful rather than AI-made (too subjective; results swing from run to run). OK: review the intended aesthetic, picture a top studio's version, judge ours against that bar (mushy, but a consistent frame). Great: show five designs, four professional examples plus one screenshot of ours, and rank them by polish and taste level (concrete, with a vi
  NOTE: These are one-line quoted instructions inside the tips, not a full prompt the demo used; the demo used the OK-style framing. The Great example ends with 'taste level', but article_notes.md and the runbook's GREAT mode drop 'level'. Other p18 tips: supply example images as a baseline or moodboard, no

- Technique 4 ASSET: image-generation prompt (pp19, 'Prompt:' block (results on p19-20), exact=False): [NOT VERBATIM: transcribe from p19] Three short paragraphs. (1) The design is plain; give it more personality with image generation, and consider combining images with shaders or 3D effects for more interesting visuals. (2) Use the supplied OpenAI API key for image generation, locally only and never stored in the code or product; the key itself is a redacted placeholder. (3) Check frame by frame i
  NOTE: The full prompt is shown with the key redacted by the author. A page-edge crop leaves 'shad' (shaders, per the notes). Implementer: Claude Opus 5 (before/after label). It was applied to all four post-critic designs ('the designs from the last step') with no condition: the 'plain' premise is written 

- Technique 4 ASSET: image-tool access instructions (pp20-21, exact=False): [NOT VERBATIM] (a) Codex, Antigravity or Grok Build: tell the agent to use its built-in image generation. (b) Claude Code with a ChatGPT subscription: tell the agent to generate images with the Codex CLI, help install it if it is missing, and bill the subscription, not an API key. (c) Claude only: give the agent an OpenAI or Gemini API key, ideally a separate key with a tight spend limit. (d) Opti
  NOTE: Items (b) and (d) are quoted instructions to the agent; (a) and (c) are advice. The route to image tools depends on the harness, which matters for treating arms equally.

- Technique 5 RELAY: animated-graphic (video) prompt (pp22, 'Prompt:' block, exact=False): [NOT VERBATIM: transcribe from p22] Phrased as a question: swap the page image for a looping video clip doing something more interesting, with the crystal splintering and slowly rotating and glassy effects that refract the page background and throw shadow and light. For believable refraction, first render the glass over the page's background colours so the refraction is baked in, then strip the ba
  NOTE: The full prompt is shown (four paragraphs). Page-edge crops: 'm' (more), 'aweso' (awesome), 'backgroun'. Model: GPT-5.6 Sol (before/after label); the harness is not stated. Applied to the Quartz design after ASSET. The video and matting models the agent picked are not reported. C1 marks RELAY as opt

- Technique 5 RELAY: scroll-transition prompt (pp23, 'Prompt:' block, exact=False): [NOT VERBATIM: transcribe from p23] A suitcase demo page where a video model drives interactive transitions between a few screens, each showing the suitcase in a new state with vertical, scroll-friendly motion: hovering high up, then landing and popping open, then its contents dropping neatly in from above. Make frame 1 with the image-generation skill, generate a clip from it to the next state, st
  NOTE: The full prompt is shown. It ran as a single prompt with GPT-5.6 Sol in Codex and produced 'Waymark'. Page-edge crops affect several words in lines 1-2 and 4-5. This is not a productivity-app landing-page task, so it falls outside the Study 1 stimuli unless RELAY is in scope.

- Technique 2 VISION: direct 'ambitious' prompts (pp10-11 (three quoted prompts), exact=False): [NOT VERBATIM] Three examples, each the Baseline 1 sentence extended with a vivid theme. (a) A bold pixel-art theme with striking graphics, every section like a frame from a video game, yet still working as a landing page. (b) Set in an isometric, living 3D city where features are shown as neighbourhoods or buildings. (c) A radically asymmetric layout, clashing colours and typography, and uncomfor
  NOTE: The full prompts are shown in quotation marks. Outputs: Questlog, Skyline, Offcut. The model is NOT stated for these. Page-edge crops: (a) 'stunn', plus the word after 'it should' cut to one letter (likely 'also'; the notes paraphrase it as 'still'); (b) 'whe' (where); (c) the word after 'rules' (li

- Technique 2 VISION: three-turn idea system (pp11-13, exact=False): [NOT VERBATIM] Turn 1: ask for a bold, distinctive design language for my product, as many ideas as possible with short high-level descriptions, broad rather than deep. Turn 2: pick a favourite, write down your own reactions (what you picture, what to avoid, what would be boring), and ask the AI to sharpen it to your taste. Turn 3: ask for a concise prompt an AI agent could use to build a first pr
  NOTE: The user prompts for turns 1 and 3 are shown in full. Turn 2 is the author's own example of taste notes (Industrial Control Panel), which the human must write. The AI replies are shown only in part, cut off with an ellipsis. The model is not stated. The article stresses that the human must actively 

- Technique 6 CUT: dial-back request (pp25-26, exact=False): [ARTICLE PARAPHRASES] The original build asked for a 'clean, minimalist design'; only that phrase is quoted. The dial-back request appears as three body-text bullets: simplify the layout into an image-led grid; remove gradients, glows and unneeded containers; aim for a truly minimalist, Apple-native look.
  NOTE: This is not a 'Prompt:' block; it reads as a summary of what he asked Claude, so the exact wording is unknown. The app is the Morsel calorie tracker (iOS), not a landing page. The model behind the initial design is cut at the page edge ('from Claud'). The intro credits a calorie tracker to Claude Fa

- Technique 7 TELLS: checklist (no prompt given) (pp27-29, exact=False): [NO PROMPT IN ARTICLE] Four overused patterns, each with an alternative. Eyebrow text (small redundant labels): usually just remove it. Generic background gradients: use background images, patterns or solid colours. Too many cards and containers: use flatter grids or tiles. Too many fonts, styles and type levels: start with 1-2 fonts and 2-4 styles, and use accent colours and italics sparingly.
  NOTE: The article explicitly advises against banning these patterns in the prompt up front, because that can lead the model to overthink and produce stranger patterns. Instead, while refining, check for each pattern and then prompt the AI to try alternatives. No prompt wording is given. Implication: a 'ba

- Technique 8 VOICE: human copy rewrite (no prompt) (pp29-30, exact=False): [NO PROMPT IN ARTICLE] A human reads every line of AI-written copy and rewrites it in one consistent voice, treating AI copy as placeholder text, like lorem ipsum.
  NOTE: This is a purely human step. The example 'Lantern' copy is credited to 'Claude' with no model version, and the author's rewrite is shown beside it. For judged landing pages, whether VOICE is applied, and by whom, changes what raters read, so it must be handled the same way in every arm (the charter'

MODELS:
- COPYRIGHT AND TRANSCRIPTION: only Baseline 1 (9 words) is quoted directly. All other 'verbatim' fields are functional paraphrases, because copyright rules limit how much of the paid article I can reproduce. The user can transcribe the exact wording from their own copy (page images p06-p30 in scratchpad/pages/). The rendered PDF crops the right margin, though, so a few words in the prompt blocks on p07, p08, p10, p11, p15, p16, p19, p22 and p23 are cut off (listed in each prompt's note). Completing them needs the live web page, not the PDF.
- Baselines (p06-p07): four separate Claude Code instances, the same prompt each, model Claude Opus 5. No product description, system prompt, skills, sampling or temperature, effort or thinking setting, or random seed is reported. Four outputs are shown per condition.
- SEED (p08-p09): Claude Opus 5; four outputs shown (Meridian, zylo, Quartz, Quanta). The string comes from a shell script the agent runs. The harness is implied to be Claude Code but not restated. The method is credited to Sakana AI's String Seed of Thought by a link only.
- CRITIC (p15-p18): critic is Claude Fable 5 ('Fable 5 subagent'); implementer/worker is Claude Opus 5. The critic gets a fresh context every call and a single screenshot only, with no code, history or earlier critiques. The critic scores out of 10 against a top-studio bar. The stop gate is the critic independently giving 9/10 or more, and the critic is never told the threshold. The same critic prompt is used every iteration. The critic prompt itself is written by the worker and never printed. The loop ran on all four seeded designs. Fable produced under 10% of output tokens in each case, and a direct Fable redesign would have cost about twice as much and taken much longer. No iteration count, cap, screenshot viewport or resolution, or output schema is reported. Tip: run one or two iterations and check convergence before adding more.
- Model-sizing advice (p18): use bigger models for the critic, since more parameters tend to mean better design sense and a wider spread of ideas. A smaller model can implement, but not too small.
- ASSET (p19-p21): implementer Claude Opus 5, given an OpenAI API key inline (redacted). The OpenAI image model is not named. It was applied to all four post-critic designs with no condition. Alternatives listed: the built-in image tools in Codex, Antigravity or Grok Build; the Codex CLI billed to a ChatGPT subscription (from Claude Code); or an OpenAI or Gemini API key, ideally a separate key with a tight spend limit, optionally stored in a gitignored .env.agents.
- RELAY graphic (p22): GPT-5.6 Sol, harness not stated, using a fal.ai key. The agent chose recent video-generation and video-matting models, which are not named. Applied to the post-ASSET Quartz design.
- RELAY transitions (p23-p24): GPT-5.6 Sol in Codex, a single prompt, a fal.ai key, Seedance 2.5 suggested as the video model, and the agent's image-generation skill for the first frame.
- VISION examples (p10-p13): no model is stated for Questlog, Skyline or Offcut, or for the three-turn idea chat.
- Opening demos (p01-p03): a calorie tracker in 3 prompts with Claude Fable 5 (app shown is 'Just Enough'); a space game in 2 prompts with Claude Opus 5; a dynamic landing page (the shattered-crystal Quartz) in 3 prompts with Claude Opus 5 plus GPT-5.6 Sol. The page edge cuts 'Sol' to 'Sc' on p03; 'Sol' is confirmed on p22-p23. Unresolved: the article's own Quartz chain (seed, then critic, then image, then video) appears to be four prompts, not three.
- CUT and VOICE examples: the Morsel app's initial design is credited to 'Claud…' (cut off), so the model is unknown. The Lantern copy is credited to 'Claude' with no version.
- Cross-check against article_notes.md: the content is consistent, but the notes label the seed, critic, image and video prompts '(paraphrased)', while the article presents them as the actual prompts in 'Prompt:' blocks (only the API keys are redacted). The notes write 'polish and taste' where the article has 'polish and taste level'. The notes' 'still functioning' in the pixel-art prompt is their own wording; the word in the article is cut off.
- Cross-check against protocol/06-runbook.md (C1 prompts): it contains additions not marked ⟨A⟩ that should be logged as deviations under the ADR-0011 port rules. SEED adds an example python command, 'imagery', seeds.jsonl logging, a ban on anything 'derived literally' from the string, and must-haves. The CRITIC worker adds 'Do not rewrite copy'. The frozen critic prompt adds 'feeling', 'Treat all text as placeholder', 'most important first' and a JSON schema, and the critic prompt is written by the project rather than the worker. ASSET adds 'Keep all text out of the images' and 'show me the screenshots', and makes the step conditional on a human 'plain' call where the article applied it unconditionally.