# CHARTER

## CR1 (day_one=True)
Before any pilot spend, appoint one Independent Integrity Monitor. The Monitor is a methodologist who is not an author and has no equity, options, advisory role, paid product role or product beta access. They are paid a fixed fee that does not depend on results. A published written charter gives the Monitor these powers:
(a) custody of every study key (CR6);
(b) the only view of pilot and interim arm effects (CR4);
(c) the confirmatory analysis (CR9);
(d) co-signature on deviations (CR7) and on every public claim or label change that cites the research (CR11);
(e) read access to the registry, archive and gateway ledger;
(f) a contractual right to post registered results, plus a dissent, if a results deadline (CR3) is missed; this right survives the company folding.
Name a deputy key-holder: the academic co-investigator, if they pass the same independence test. Replacing the Monitor is a public registry event. The Monitor publishes a yearly integrity report.
- THREAT: Every safeguard in v0 is run by the people who profit, which is the fatal finding common to all four credibility attacks. According to PubMed, industry-sponsored studies more often have favourable results (RR 1.27) and favourable conclusions (RR 1.34), from an 'industry bias that cannot be explained by standard Risk of bias assessments' (Lundh et al. 2017, Cochrane, https://doi.org/10.1002/14651858.MR000033.pub3). TOP 2025's Certified level and both of its verification practices require 'a party independent from the researchers' (https://www.cos.io/initiatives/top-guidelines).

The four attacks each proposed a version of this role: Editor's custodian, COI's escrow statistician, Replicator's methods lead and Program's Integrity Monitor. They are merged into one role so a 1–3 person team signs one contract, not four. Program's 'not an author' condition is kept over Editor's 'the co-investigator may be custodian', because a co-author shares the paper's interest.
- ENFORCED: External party (the Monitor), under a published contract, plus system access: keys are encrypted to the Monitor, and the Monitor has read-only access to the ledger and registry.
- OWNER: The team lead signs the contract; the Monitor holds the powers.
- COST: Roughly $3–8k a year as a fixed fee (the attackers' estimate, not verified), plus about 2 hours a month of team time. The team also gives up control over when results are unblinded and who publishes the first numbers, which is the point.

## CR2 (day_one=True)
Every confirmatory study that a paper headline or a public product claim will cite runs as a Registered Report with in-principle acceptance (IPA). The journal must accept declared financial interests.
- Do not use PCI RR: its policy bars authors with financial conflicts.
- Fix the venue and record it as an ADR before Stage 0.
- No fallback to a plain preregistration. If one RR venue declines, submit to another RR venue.
- Make the Stage 1 public on acceptance, with no embargo.
- Handle model-retirement pressure through escrowed generation (CR6) and a model-retirement contingency preregistered in Stage 0. Never handle it by changing route.
- THREAT: Two problems: the default route is closed, and v0's fallback is an escape hatch the team triggers itself.

PCI's policy, verified at the source, says 'Authors should have no financial conflict of interest relating to the articles they submit to PCI'. A conflict covers salary, shares or patents linked to the research within the past four years. It tells conflicted authors to submit elsewhere (https://peercommunityin.org/?p=8096). COI, Replicator and Program recommended PCI RR; Editor's finding overrides them because the policy makes PCI unavailable to equity holders.

CC1's OSF fallback would let the team drop IPA after seeing the pilot. Registered Reports had 44% positive results against 96% in standard reports (Scheel, Schijen & Lakens, https://www.psychologicalscience.org/journals/ampps/25152459211007467/).

Verified alternatives:
- PLOS ONE grants IPA, publishes the Stage 1 protocol as its own article (https://everyone.plos.org/2021/03/30/registered-reports-one-year-at-plos-one), and requires shares, employment and patents to be declared rather than barring them (https://journals.plos.org/plosone/s/competing-interests).
- RSOS accepted direct Registered Report submissions as of 2021 (https://royalsociety.org/blog/2021/04/rsos-pci-rr/). Its conflict-of-interest terms were not checked.
- ENFORCED: External party (the journal's editor and reviewers), plus process (the route ADR, timestamped before Stage 0).
- OWNER: The team lead chooses; the Monitor confirms the ADR predates Stage 0.
- COST: An article processing charge (PLOS ONE and RSOS both charge; amounts not checked). The team gives up PCI's free review. Stage 1 review time was not verified for these journals. It squeezes the model-retirement window: tooling.md lists Opus 5.5 as 'not before 2027-09-22' and Fable 5.1 as 'not before 2027-09-01'.

## CR3 (day_one=True)
Keep a public, append-only Program Registry: a folder in the public repo, mirrored to a timestamped external archive.

Before its first paid model call or rater round, each of these gets an entry: every study, pilot and development-brief tuning run, and every product evaluation that compares configurations, recipes or blocks using human raters or AI judges. An entry records:
- ID, question and arms;
- recipe hashes and judge type;
- N and phase;
- planned dates and the results-due date.
The gateway and the Judge app refuse to spend without a live entry whose phase permits it.

Deadlines:
- Results (every registered outcome, nulls included, plus data) are due within 90 days for pilots and evaluations, and within 12 months for studies.
- An abandoned entry gets a dated reason and releases whatever data exists.
- An entry's existence is never embargoed. Design details may be embargoed for at most 12 months.

The registry also holds the research roadmap: ladder rungs, candidate Paper 2 domains and comparator-selection criteria. Changes to it are dated and flagged whenever product information prompted them. Every paper and every claim reports the denominator: how many registered studies and arms tested that recipe or block.
- THREAT: The file drawer at program level, and agenda capture. Pilots, internal evaluations and abandoned studies can vanish, and favourable product evaluations get promoted. A Registered Report stops selective reporting inside one study, not selection of which studies exist.

WHO treats 12 months after completion as the longest acceptable time to post results (https://www.who.int/news/item/09-04-2015-japan-primary-registries-network).

This merges Editor (a study log with 90-day posting and a Judge gate), COI (a 12-month register) and Program (a gateway gate and the denominator). Both deadlines are kept: Editor's 90 days for small evaluations, WHO's 12 months for full studies.
- ENFORCED: System: the gateway and the Judge app block spend without an entry. External party: the Monitor publishes a list of overdue entries.
- OWNER: Whoever launches the spend files the entry; the Monitor audits.
- COST: About 2 dev days for the gate, then about 30 minutes per entry. Competitors can see the pipeline, and some posted nulls will be uncomfortable.

## CR4 (day_one=True)
Before any pilot rating is unblinded, file a timestamped public Stage 0 registration. It fixes:
- hypotheses and their directions;
- one primary test and a gatekeeping order, with H1a (C1-H vs B-Plain on lay quality) as the single gate for the headline claim;
- the SESOI and equivalence bounds, with a rationale written before any data (for example, a preference shift buyers would notice, or the per-candidate cost break-even), never derived from pilot effects;
- numeric thresholds for outcome-neutral checks, fidelity checks and AI-judge validity;
- exclusion and replacement rules;
- the baseline prompts, verbatim;
- a model-retirement contingency.

Pilot ratings go to the Monitor. The Monitor runs a frozen script that releases only nuisance parameters to the team: variance components, costs, timings, gold-check pass rates and failure rates. Arm-level pilot effects go to the journal with the Stage 1 and become public when it is published. Every change from Stage 0 to Stage 1 goes in a diff table.
- THREAT: The all-arm pilot (about 1,500 judgments) shows the direction of every contrast before these are fixed: the SESOI, the families, the primary test (still open in ADR-0037), the equivalence margins and the thresholds. A null −D3 could quietly become an equivalence claim, and a close CRITIC-self contrast could be moved to exploratory.

Editor's Stage 0 and the pilot firewalls proposed by COI and Replicator converge. The strongest version is kept: the team never sees arm-level pilot effects before IPA, while reviewers see them in full.
- ENFORCED: Process: the Stage 0 registration. External party: the Monitor holds the pilot data. System: the script that releases only nuisance parameters.
- OWNER: The team writes Stage 0; the Monitor approves the thresholds and runs the release script.
- COST: 2–3 days to write Stage 0 earlier than planned, plus a few Monitor hours. The team loses informal access to the pilot results.

## CR5 (day_one=True)
Baselines and the C1-H recipe get equal treatment.

1. **Freeze baselines before the pilot.** Use the article's prompts verbatim. Pin B-Skill to a commit chosen by a preregistered rule, such as the latest release on the lock date.
2. **Before the lock, C1-H may change only to repair failures from a closed list:** build error, crash, tool misuse, copy-deck non-compliance and render failure. For each repair:
   - log the diff, the reason and the author;
   - apply it to every arm where it makes sense;
   - have the Monitor classify it as 'repair, not tuning';
   - stay within a preregistered cap on the number of repairs.
3. **Tuning ledger.** The gateway tags every pre-lock call by arm, recipe hash and workspace, and generates a per-arm ledger (iterations, tokens, dollars, hours). The ledger is published with the Stage 1. Lab refuses to lock a plan without it.
4. **No product shortcuts.** Before IPA, any Playground or product run of a study recipe happens only in a logged workspace. A product recipe version enters a study only through a new Stage 0.
5. **Outside choices.** An independent designer picks the critic calibration exemplars under a preregistered rule. Before the lock, one outside owner of a competing approach is invited to submit a baseline, which is run and reported whatever the result.
- THREAT: Tuning effort is unequal across arms. C1-H gets iterated for months on development briefs, in the Playground and on the product track, while the baselines stay fixed strings. A C1-H win would then partly measure tuning budget. All five attacks raised this. Editor and Program cite the machine-learning evidence that comparisons flip with tuning budget (Dodge et al.; Melis et al.); those papers were not re-opened in this synthesis.
- ENFORCED: System: gateway tagging and ledger generation, and Lab's refusal to lock without a ledger. External party: the Monitor classifies repairs, and an outside owner supplies a baseline.
- OWNER: The engine owner builds the tagging; the Monitor classifies repairs.
- COST: About 1–2 dev days. The outside baseline costs about $7–10 per brief in generation (Replicator's estimate) plus coordination. C1-H may score lower than a fully tuned version would, and that lower score is the honest estimate.

## CR6 (day_one=True)
The team never holds a key that could unblind or reshape a confirmatory study.

**Brief draw:**
- Preregister eligibility rules, strata and the draw script.
- Timestamp a snapshot of the full sampling frame.
- Seed the draw with a future drand round named in advance.

**Copywriter:** the independent copywriter screens eligibility, codes strata and fictionalizes the briefs under a written rulebook. They are blind to the hypotheses and never see generated pages. Every rejection and edit goes into a public log.

**Encryption:**
- Confirmatory briefs, copy decks and the stimulus-to-arm map are encrypted to the Monitor and the deputy at ingest.
- The harness decrypts them only inside the locked confirmatory run.
- The Judge database stores opaque IDs only.
- If the model-retirement window forces generation before IPA, outputs go to storage encrypted to the Monitor, with access logged.

**Unblinding:** the arm map is released only after the hash of the analysis code is registered.
- THREAT: Self-custody. A hash proves a file did not change after hashing, not that nobody read or shaped it. A seed the team picks proves nothing. 'Blind analysis on scrambled labels' is self-blinding when the analyst also holds the key.

drand provides 'verifiable, unpredictable and unbiased random numbers' from a multi-organization network (https://drand.love/). This rule merges Editor's custodian and drand seed, Replicator's beacon and copywriter escrow, and COI's key escrow.
- ENFORCED: System: encryption at ingest, opaque IDs and gated decryption. External parties: the Monitor, the copywriter and the drand beacon.
- OWNER: The engine owner implements it; the Monitor and the copywriter hold the materials.
- COST: 3–5 dev days. Copywriter time rises about 10–20% (Replicator's estimate). Adds 0–2 weeks of calendar time. The team can no longer debug the confirmatory run live; a full dry run on the development briefs offsets this.

## CR7 (day_one=False)
No study can be locked, rerun or changed without an outside record.

1. **Lock check.** A lock is valid only if its manifest hash appears in a public, frozen registration dated before the first confirmatory call. The manifest covers the engine commit; the recipe, prompt, ruleset, model-profile and binding-map hashes; and the container digests. The harness verifies this before it starts.
2. **Dedicated keys.** Confirmatory generation uses dedicated, spend-capped API keys at each provider, used for nothing else.
3. **Ledger.** The gateway writes an append-only, hash-chained ledger. Its daily root hash is timestamped externally with OpenTimestamps.
4. **Reconciliation.** After the run, the Monitor reconciles each provider's per-key usage export, and the Prolific study list, against the archive, and publishes the result. Any call that is not in the archive is a reportable deviation.
5. **Deviations.** Any change to a locked study creates a new lock version and an automatic public deviation entry. After IPA, every change is cleared with the editor before it is made and co-signed by the Monitor. Stage 2 includes the generated deviation table.
- THREAT: Hidden reruns and self-attested locks. In v0 nothing proves the 1,728 pages came from a single run, and the code that enforces the lock is code the team can patch.

Deviations often go undisclosed: according to PubMed, 9 of 27 early preregistered studies disclosed none of their deviations, which concentrated in sample size, exclusions and analysis (Claesen et al. 2021, https://doi.org/10.1098/rsos.211037).

Anthropic's Usage API filters by API key and lists 'Cost reconciliation' as a use, but 'The Admin API is unavailable for individual accounts' (https://platform.claude.com/docs/en/build-with-claude/usage-cost-api). OpenTimestamps is free and 'proves that some data existed prior to some point in time' (https://opentimestamps.org/). This rule merges Replicator, Program and Editor.
- ENFORCED: System: the lock check, the hash-chained ledger and automatic deviation entries. External parties: provider usage records, the timestamp service, the Monitor and the journal editor.
- OWNER: The engine owner builds it; the Monitor reconciles.
- COST: 2–4 dev days, about 4 Monitor hours, and an Anthropic organization account (plus the equivalent at each other provider). Free timestamping.

## CR8 (day_one=True)
Anything that could tilt a result is decided by a preregistered script, not a person, and every such decision is logged.

**Decided by script:**
- Rater exclusions, and recruitment of replacement raters until a preregistered number of valid judgments exists per brief-contrast. Both are applied on opaque IDs before unblinding.
- Whether a failure counts as infrastructure or quality, read from exit codes and HTTP statuses, with no human override and every retry logged.
- A render-failure taxonomy. Intention-to-treat is the default, with a sensitivity analysis that excludes flagged stimuli.
- Copy-deck non-compliance: intention-to-treat, with compliance reported per arm.

**Outcome-neutral checks** have numeric thresholds and stated consequences. They cover gold-pair accuracy, copy compliance and the gateway fidelity assertions, plus an A/A arm in the pilot.

**AI judges:** every AI judge is reported with a validity flag against a sealed human subset. None is dropped, and none is cited as corroboration.

**Raters and experts:**
- They pass a screener: no paid, equity, customer or competitor tie, and not a product user.
- They are told not to use AI tools.
- Focus and paste events are logged.
- They answer a blinding check at the end of the session.
- THREAT: Several gaps:
- Forking paths in exclusions, retries, render failures and judge reporting.
- methods.md says not to report a judge that fails its threshold, which conflicts with reporting every registered analysis.
- Harness bugs that favour one arm (−D3 snapshot timing, the critic seeing code or the threshold, cross-arm cache hits).
- Raters using AI tools, and raters with conflicts of their own.

This merges Editor's outcome-neutral checks and exclusion rules, Replicator's fidelity assertions, A/A arm, render logs and rater AI-use controls, and the rater screener from COI and Editor.
- ENFORCED: System: the Judge app, the failure classifier and the gateway fidelity assertions. Process: thresholds fixed in Stage 0.
- OWNER: The engine owner builds it; the Monitor approves the thresholds at Stage 0.
- COST: 2–3 days of specification and scripts, plus 3–5 dev days for the assertions and A/A plumbing. The A/A arm costs about $250 (Replicator's estimate). Replacement raters add modest Prolific spend.

## CR9 (day_one=False)
The confirmatory analysis is run independently.
- The Monitor, or a statistician they contract under the same independence test, receives the data freeze and the frozen analysis code, whose hash is registered.
- They apply the exclusions, run the confirmatory analysis, and deposit a signed results report with a DOI before the authors draft the Discussion.
- Any gap between that report and the paper is a declared deviation.
- A non-conflicted guarantor signs ICMJE's statement: 'I had full access to all of the data in this study and I take complete responsibility for the integrity of the data and the accuracy of the data analysis.'
- The analysis pipeline gets a CODECHECK certificate, or an equivalent independent reproduction, before Stage 2 submission.
- THREAT: Control of the analysis is the sponsor's main lever, and CC4 made the independent statistician optional ('ideally'). The ICMJE wording is verified (https://www.icmje.org/recommendations/browse/roles-and-responsibilities/author-responsibilities--conflicts-of-interest.html). CODECHECK issues a 'certificate of executable computation' with a DOI (https://codecheck.org.uk/). TOP 2025's Computational Reproducibility practice requires verification by an independent party.
- ENFORCED: External parties: the Monitor or contracted statistician, and CODECHECK.
- OWNER: The Monitor.
- COST: The attackers estimated $2–8k for a statistician, unverified; it may fall within the Monitor's fee. CODECHECK's community checks appear to be volunteer-run, and no fee is stated. Adds 1–2 weeks before Stage 2.

## CR10 (day_one=False)
The Stage 1 includes three tables:
- (a) **Results-to-claims:** the exact abstract sentence for each outcome pattern (each co-primary win/null/loss, crossed with each ablation equivalent/inconclusive/superior).
- (b) **Product consequences:** what the product's label and default become in each pattern, including if H1a fails.
- (c) **Results shell:** a fixed table listing every registered outcome in registered order.

Reporting:
- The abstract reports both co-primaries with effect sizes and CIs.
- The arm is called 'C1-H' everywhere, never 'C1'.
- The paper is described as a controlled test of a headless variant, not an unqualified replication.

Red team and checks:
- Before both Stage 1 and Stage 2 submission, a paid outside red team (3–5 people, a base fee plus a bounty per verified error, at least one from a competing approach) reviews the manuscript and the arm-specific code paths.
- Their report is published.
- The Monitor and one red-team member check the abstract, press text, README and launch posts against the claims table before release.
- THREAT: Spin and outcome switching. Two co-primaries, three baselines, five ablations, about ten secondary outcomes, two human panels and AI judges leave many routes to a positive headline, and 'C1-H' can drift into 'C1'. According to PubMed, industry-sponsored studies show less agreement between results and conclusions (RR 0.83, Lundh et al. 2017, https://doi.org/10.1002/14651858.MR000033.pub3). On a 1–3 person team, nobody is paid to find errors.

This merges COI's claims table and red team, Replicator's red team on code and its framing rule, and Editor's product-consequence table.
- ENFORCED: External parties: the red team, the Monitor and the journal's reviewers. Process: the tables are fixed in Stage 1.
- OWNER: The team drafts the tables; the Monitor and the red team check against them.
- COST: About 1 day to write the tables. The red team costs about $1–3k per round, the attackers' estimate scaled from a published precedent (not verified here).

## CR11 (day_one=True)
**Labels are computed.** The engine computes evidence labels from the registry. Nobody types them by hand, and there is no override flag.

**One vocabulary** is used across protocol, papers and product. Each claim gets two parts:
- a verdict: Supported, No meaningful effect, Inconclusive, Worse or Untested;
- a scope match against the evidence-scope tuple (recipe hash, ruleset, model profile, checkpoint binding, domain and task set, outcome and rater population): Exact, Derived-from-studied (with the differences listed automatically), Composed, or Experimental.

**Limits on labels:**
- Composed recipes never inherit their blocks' labels.
- A label expires at the earlier of the studied model's retirement or 24 months after data freeze, and then degrades to 'Historical'.

**What may be claimed, and when:**
- No efficacy claim ('research-backed', 'proven', 'outperforms', 'studies show') before the Registered Report's Stage 2 is accepted.
- Other registered evaluations may be cited only as exploratory, and only once their results are public.
- Every public claim (site, docs, decks, sales email, talks) carries a claims-register ID, maps to a hypothesis ID and is signed off by the Monitor.
- A CI linter fails site and docs builds that contain claim phrases without a valid, unexpired ID.

**Product surfaces:**
- Showcases are seeded random draws from archived runs, or state their selection ratio.
- The recommender shows the recommended recipe's label, plus 'routing untested' until the recommender itself has been studied.

**Upkeep:** corrections go out within 14 days, and a public claims audit runs every year.
- THREAT: Product claims can outrun the evidence. Paper 1 studies only C1-H: headless, with a fixed copy deck and the Opus 5.5 worker, on landing pages, judged by lay first-impression preference. The product will run human-in-the-loop C1, newer models, composed recipes and a recommender.

v0's 'Studied' label carries no direction, scope or expiry, and the team assigns it. All five attacks raised this. The merged rule takes Program's verdict taxonomy and expiry, Architect's scope tuple and no-override rule, Replicator's 'no claims before Stage 2', and Program's showcase rule.
- ENFORCED: System: the label function, the CI linter, release CI and the gallery sampler. External party: the Monitor's sign-off.
- OWNER: The engine owner builds it; the Monitor signs off; whoever publishes a claim files it.
- COST: 3–5 dev days, plus about 1 hour of Monitor time per marketing release. Commercially, no broad 'research-backed' copy until the evidence exists.

## CR12 (day_one=True)
Evaluation instruments live in the evaluation store, versioned by hash and frozen per study. They include:
- judge prompts and references;
- held-out judge model families;
- the tell detector, similarity embeddings and defect checklist;
- sealed and held-out briefs;
- rater data.

Access:
- Product workspaces cannot read the store.
- A CI import check blocks product code from importing these instruments.
- The product may use only forks, each with its own ID.

Exposure:
- Once the product uses an instrument or a model family as a feature, a quality gate or an optimization target, it is marked exposed.
- For recipes released after that date, an exposed instrument may serve only as an exploratory outcome.
- An exposed model family is retired as a held-out judge.

Data used to develop the recommender or composer is logged with its provenance, so later studies can exclude it.
- THREAT: Teaching to the test. Design rule 4 lets the product reuse the sameness and defect checks. Tuning recipes against them later turns them into circular outcomes. A product quality gate run on GPT or Gemini spoils those families as held-out judges. Editor, COI, Program and Architect all raised this.
- ENFORCED: System: store access scoping, the CI import check, and an exposure register that the evaluation side checks before computing confirmatory metrics.
- OWNER: The engine owner.
- COST: About 1–2 dev days now. The product loses convenient reuse and must maintain its own forks.

## CR13 (day_one=False)
Research code is everything a locked study executes: runner, gateway, sandbox, renderer, critic plumbing, registry, ruleset, validator, Judge app and analysis.

By the end of confirmatory data collection, publish under an OSI licence every engine release a study ran, together with:
- its recipes, prompts and development briefs;
- container image tarballs (not just digests);
- npm-mirror and font-cache snapshots.

By Stage 2 submission, publish with DOIs:
- data and de-identified trial-level ratings;
- every request and response;
- renders and render logs;
- pilot data and the tuning ledger;
- exclusion and deviation logs;
- the provider reconciliation;
- the analysis code.

Product-only code (recommender, composer, product UI) may stay closed, and can never be cited as evidence.
- THREAT: CC5's promise contradicts the open licensing decision in the ADR log. A closed engine leaves C1-H neither re-runnable nor auditable, and a licence that excludes competitors reads as obstruction. tooling.md lists Opus 5.5 as 'not before 2027-09-22' and Fable 5.1 as 'not before 2027-09-01', so a release at publication could come after outsiders lose model access. This merges Editor (decide now, OSI), Replicator (release at the end of data collection, with tarballs) and Architect (open registry and validator).
- ENFORCED: Process: an irrevocable commitment written into Stage 0. System: release CI builds the kit at lock.
- OWNER: The team lead decides; the engine owner packages; the Monitor checks completeness.
- COST: 2–3 days of packaging; storage is roughly free at this scale. Strategically, competitors get the study engine early. That is the trade the user's standard implies.

## CR14 (day_one=True)
**Version control.** Put protocol/, docs/adr/, the registry and the deviation log under git today. Push to a public remote with protected branches and signed commits. At each milestone (Stage 0, lock, draw, IPA, unblinding, Stage 2), archive a tagged snapshot to an external DOI archive.

**ADRs:**
- Accepted ADRs are append-only: CI fails any edit to their Context or Decision sections, and ratifications become new records.
- Ratify the 15 by-continuation ADRs before Stage 0.
- Product-only ADRs may stay private, but their hashes are published.

**Disclosure filings.** Every author, the Monitor, the co-investigator, the copywriter and the expert raters file ICMJE-scope disclosures at Stage 0/1, at Stage 2 and for every later paper.

**A standing public COI page** lists:
- equity and investors;
- the funding source and its role in design, analysis and the decision to publish;
- patents (planned, pending and issued), none of which may delay publication;
- model-provider credits or programmes;
- every agreement that touches research.

**Agreements.** Every investor, partner, customer or provider agreement carries a publication-freedom clause: no edit or veto, no delay beyond a short confidentiality review, and no restriction on data release.

**Per-preregistration statements:**
- Which product telemetry on that domain the authors had seen, auto-filled from the firewall's access logs.
- An AI-contribution statement naming the model family, which is the same family as the study's worker and critic, and the tasks it performed.

**Corrections and consent.** The ADR README's 'independent verifiers' becomes 'AI-assisted verification passes (same model family)'. The IRB and the rater consent form name the commercial sponsor, and the Prolific account type matches who pays.
- THREAT: Several gaps:
- Provenance can be rewritten: the ActAI folder is not a git repository and sits in OneDrive, and the 37 verifier corrections left no diffs.
- The conflict disclosure is one line.
- AI ghost authorship by the same model family under test.
- Future contracts could buy control over publication.

ICMJE says authors must avoid sponsor agreements that 'interfere with authors' access to all of the study's data or that interfere with their ability to analyze and interpret the data and to prepare and publish manuscripts independently when and where they choose' (https://www.icmje.org/recommendations/browse/roles-and-responsibilities/author-responsibilities--conflicts-of-interest.html). PLOS requires a description of the funder's role (https://journals.plos.org/plosone/s/competing-interests).

Disclosure is a floor, not a safeguard; CR1–CR13 carry the weight.
- ENFORCED: System: git rulesets, a CI hash check and the external archive. Disclosure. Process: a contract template.
- OWNER: The team lead; the Monitor checks the disclosures at each stage.
- COST: About half a day for git and the archive, half a day for the ratification session, about 1 hour per person per filing, and a few hours of legal review for the contract clause. Some product strategy becomes public, and some deals may be lost.

# ENGINE REQUIREMENTS
- [Harness spine, before any pilot spend.] Gateway spend gate and ledger:
- Refuse any paid model call without a live Program Registry ID whose phase permits it.
- Tag every call with workspace, study, arm, recipe hash and prompt hash.
- Enforce per-arm and per-study caps.
- Write an append-only, hash-chained ledger and export its daily root for external timestamping.
- Record request IDs, the returned model string, headers and latency.
- Route confirmatory traffic only through dedicated per-study provider keys.
  WHY: Enforces CR3 (no spend without registration), CR5 (the per-arm tuning ledger is generated, not self-reported) and CR7 (hidden reruns show up against the provider's per-key usage).
- [Harness spine (the lock already needs it).] Content-addressed, immutable registry for blocks, glue adapters, frozen prompt templates, rulesets and evaluation instruments.
- Each entry has a semver label and a SHA-256 of its canonical definition.
- A block definition covers role, port signature, knobs with article defaults, ranges and ⟨A⟩ flags, guards, bypass semantics, compatibility row, evidence level and status.
- Entries are deprecated, never deleted.
- Studies pin by hash.
  WHY: A study lock must name every component that shapes a stimulus, including glue (CR7, CR13), and the composer needs a typed parts catalogue.
- [The format spike ADR-0029 already plans, before the pilot.] One canonical recipe format: JSON hashed with RFC 8785, with the schema version included in the hash.
- Required fields: kind (protocol-config, variant, ablation, baseline, composed, experimental), parent hash and derivation, block instances by hash, typed edges, grammar operators only, a max on every loop, checkpoint declarations without bindings, sit-outs with reasons, exception-catalogue references, budget inputs and success criteria judged outside the loop.
- Ablations are derived by a versioned transform using each block's registered bypass, never by hand edits.
- No API for changing the graph at runtime.
  WHY: Gives stable arm identity, reproducible ablations and computed cost (ADR-0026), and lets composed recipes be told apart from studied ones (CR11).
- [Before the pilot.] Model profile (pinned IDs, route, effort) and checkpoint-binding map (live, policy, AI proxy, replay) stored as separate hashed artifacts, recorded in every manifest. The evidence-scope tuple is: recipe, ruleset, model-profile and binding-map hashes, plus domain and task set, plus outcome and rater population.
  WHY: A live-human product C1 must never inherit C1-H's evidence. The label function (CR11) matches on this tuple.
- [Paper 1 subset before the pilot; the composed-kind profile before the product composer ships.] Versioned ruleset and validator.
- Port and default rules carry stable IDs and a class: invariant, hard or default.
- An exception catalogue separates protocol-declared exceptions, study manipulations (legal only in research-frozen recipes bound to a lock, e.g. CRITIC-self, and D3-auto on unpicked candidates under port rule 4) and invariants that are never relaxed.
- Recipes cite exceptions only by ID.
- The verdict is stored in the manifest.
- Dataflow rules (threshold hidden from the critic; seeds, credentials and the tells catalogue kept out of prompts and artifacts; locked voice) are enforced at runtime by role and label taint tracking in the interpreter and gateway.
  WHY: ADR-0011 rules are currently enforced 'by following the runbook, not by code'. Without exception classes, a composer could declare its way past any rule.
- [Paper 1 arms before the pilot; C2–C7 before the product launches.] Conformance suite and fidelity assertions.
- Golden tests: C1–C7 and C6a validate with exactly 03's exceptions; the nine Study 1 arms validate under their kinds; broken fixtures fail with the expected rule ID.
- Gateway fidelity assertions: no code or threshold tokens in critic inputs; non-zero DOM diff between −D3 and C1-H for a stated share of candidates; no cross-arm cache hits; no ASSET instruction in baseline prompts.
- Support for an A/A arm.
- The lock refuses to run unless the suite passes on the pinned ruleset.
- Notation, diagrams and ⟨A⟩ marks are generated from recipe files.
  WHY: CR8. It catches arm-specific harness bugs and the live port rule 4 defect before the lock, and stops the protocol documents drifting (the operator count reads 13, 16, 17 or 22 across files).
- [Before the pilot (a channel field plus the lock check).] Registry channels: protocol, research-frozen, product, workspace/composed.
- A study lock resolves only research-frozen entries.
- It refuses any lineage that includes a product or composed derivation, unless that recipe was promoted through an ADR, a new ID and a new Stage 0.
- The product channel can read protocol and research entries but never write to them.
  WHY: CR5: a product recipe enters a study only through a new Stage 0. It also stops composed recipes receiving C-numbers.
- [Before the confirmatory run.] Lock verification and deviation automation.
- Before the first confirmatory call, the harness fetches the public registration and checks that the manifest hash and date match.
- Any change to a locked study creates a new lock version.
- A public deviation entry is generated by diffing executed manifests against the lock.
  WHY: CR7: no self-attested lock and no silent deviation.
- [Before the brief draw and the pilot.] Escrow path.
- Encrypt to the Monitor's and deputy's keys at ingest: sealed briefs, copy decks, the stimulus-to-arm map, and any generation made before IPA.
- Decryption happens only inside the locked confirmatory run.
- The Judge database stores opaque IDs only.
- Unblinding is gated on a registered hash of the analysis code.
- A frozen pilot-release script outputs only nuisance parameters.
  WHY: CR4 and CR6: the team holds no key that can unblind or reshape a study.
- [Before the first pilot rating.] Judge app integrity.
- Refuse to create a rater round without a registry ID.
- Screener and conflict declaration for raters.
- Per-trial logging of visibility, focus and paste events; side and timing; gold-check fields.
- End-of-session blinding check.
- Exclusions applied by script on opaque IDs.
- Replacement recruitment until a preregistered number of valid judgments per brief-contrast.
  WHY: CR3 and CR8.
- [Render logs and classifier before the pilot; canaries before the confirmatory run.] Run-quality instrumentation.
- A render log for every stimulus: console errors, failed requests, font fallbacks, page height and truncation, and a blank-canvas detector.
- An automated failure classifier from exit codes and HTTP statuses, with no human override and every retry logged.
- Daily drift canaries during the confirmatory window: one long-context, multi-image critic call and one short build call, each with a preregistered pause threshold.
  WHY: CR8. Rendering and drift effects differ by arm, because C1-H's long multi-image calls are exposed to different failures than the one-shot baselines.
- [Registry schema before the pilot (pilot outputs read 'Untested'). Linter and release CI before the first public product surface.] Evidence and claims registry.
- A label function computes verdict plus scope match from registry records, with indirectness differences listed automatically and no override flag.
- An expiry scheduler.
- Product UI and docs render labels only by lookup.
- A claims linter runs in site and docs CI.
- Release CI blocks any product release that claims a label its hash did not earn.
- A seeded showcase sampler.
  WHY: CR11: labels and claims cannot be asserted by interested people.
- [Now, before the product reuses any check.] Instrument firewall.
- The evaluation store is unreadable from product workspaces.
- An instrument registry with hashes and exposure flags.
- A CI import check in product code.
- Forks carry their own IDs.
- The evaluation side checks recipe lineage against the exposure register before computing confirmatory metrics.
- Recommender and composer development data is logged with its provenance.
  WHY: CR12.
- [Built before confirmatory data collection ends.] Replication-kit release CI. At lock it assembles the engine at the locked commit, recipes, prompts, the renderer, the Judge app, container image tarballs, and npm and font snapshots under an OSI licence. At data freeze it assembles Parquet tables with a data dictionary and every log CR13 lists.
  WHY: CR13: open release on fixed dates, before models retire.
- [Before the product's recommender or composer ships; not needed for Paper 1.] Product-side constraints the engine imposes on the recommender and composer.
- Composition goes only through validate, then register (kind=composed, channel=workspace), then run.
- The composed profile allows only admitted blocks, registered knob ranges and declared template slots (frozen block prompts are untouchable), composable exceptions only, and protected human checkpoints (VOICE, C6/C6a authorship).
- Canonical configurations are recommended before anything is composed, and a composed recipe is shown as a diff from the nearest one, with its cost.
- The chooser is stored as versioned predicate data and can answer 'no fit' or 'refused (veto)'.
- Decision traces are logged from the first release.
- Block admission moves through proposed, experimental, admitted and studied, and the Monitor signs any admission of a block that will be studied.
  WHY: ADR-0042's recommend-or-compose north star, without composed recipes borrowing evidence (CR11) or the people who sell a block alone admitting it.

# RESIDUAL RISKS
- The team chooses and pays the Monitor. A fixed fee, a published contract, the deputy and public replacement events make capture visible, but they cannot make it impossible.
- Gateway bypass. Anyone can iterate prompts in a chat interface or another tool outside the gateway. The tuning ledger and registry see only traffic through the gateway, so off-system tuning is covered only by discipline and the AI-contribution disclosure.
- Construct and agenda capture. The team wrote the protocol and chose the configurations, the domain (landing pages) and the primary outcome (lay first-impression preference). Preregistration fixes these choices but cannot make them neutral. The public roadmap, the outside baseline and the red team reduce the risk without removing it.
- The stimuli are visually recognizable. Anyone who looks at the images can guess the arms, and the blinding of raters and experts is imperfect. The blinding check measures this but does not prevent it.
- Taste correlates across LLM families. Agreement between AI judges from other families is not independent corroboration, which is why CR8 keeps them as measurement-validity data only.
- Providers can change behaviour behind a pinned model ID, and retirement ends exact re-execution. Reproducibility after retirement rests on the archive, not on re-runs.
- Much of the design was drafted by Claude, the same family as the study's worker and critic. Sycophancy toward the user's hope that the protocol works cannot be fully audited. Disclosure, human verification of every number, and the red team only partly offset it.
- External services can fail or refuse. Journals may decline or review slowly, and article fees and turnaround were not verified. CODECHECK and red-team availability vary. drand and OpenTimestamps are third-party services.
- Disclosure does not neutralize bias. Readers may still over-trust or under-trust the results. According to PubMed, industry bias survives standard risk-of-bias controls (Lundh et al. 2017, https://doi.org/10.1002/14651858.MR000033.pub3), which is why the charter relies on mechanisms rather than disclosure.
- The team could amend the charter itself. Registering it publicly, versioning it, and requiring the Monitor's countersignature on changes makes any weakening visible, not impossible.
- Third parties (press, investors, users) will overstate results. The claims gate covers only the team's own channels.
- The team will still learn privately from product telemetry and pilot nuisance parameters, and that will shape its next hypotheses. The telemetry-exposure statement and the roadmap log show this drift but do not stop it.
- Bus factor. If both the Monitor and the deputy lose their keys, unblinding is blocked. A sealed key backup with a third party (for example, the journal editor or the co-investigator's institution) needs a procedure.
- Cost and time pressure. The charter adds roughly $5–15k and several engineer-weeks (estimates). The temptation to skip steps peaks exactly when the product needs a win. Only the public registry and the Monitor make a skipped step visible.

# USER DECISIONS
- Q: Which Registered Report venue? PCI RR is closed to authors with a financial conflict (verified). Will you also accept that there is no fallback to a plain preregistration?
  OPTIONS: (a) PLOS ONE Registered Reports: IPA, Stage 1 published as its own article, conflicts declared rather than barred (verified). (b) RSOS direct Registered Report submission (verified as of 2021; conflict-of-interest terms not checked). (c) Another journal from COS's list of RR journals. (d) Ask PCI for an exception anyway; its policy offers no exception process and tells conflicted authors to go elsewhere.
  REC: Shortlist (a) and (b). In one afternoon, check each one's conflict terms for equity-holding authors, its scope for AI and design research, its article fee and its Stage 1 turnaround. Pick before Stage 0, record the choice as an ADR, and accept no non-RR fallback. If one RR venue declines, go to another RR venue.
- Q: Who is the Independent Integrity Monitor, and on what terms?
  OPTIONS: (a) A paid methodologist who is not an author, with the academic co-investigator as deputy key-holder and guarantor. (b) The academic co-investigator as Monitor, who then cannot be an author. (c) A Monitor who is also a co-author (weaker: a co-author shares the paper's interest).
  REC: (a). Budget roughly $3–8k a year (estimate). Publish the contract, including the freedom-to-publish and results-escrow clauses. Confirm in writing that neither the Monitor nor the deputy holds equity, options, an advisory role or product access.
- Q: Licence and timing for releasing the study engine, and where the line between research code and product code falls.
  OPTIONS: (a) OSI licence, released at the end of confirmatory data collection. (b) OSI licence at Stage 2 submission. (c) A replication-only licence that excludes competitive use. (d) Keep the engine closed.
  REC: (a). Option (b) is the minimum the charter tolerates; (c) and (d) are incompatible with 'ABSOLUTELY AND WITHOUT COMPROMISE'. Research code is everything a locked study executes. The recommender, composer and product UI may stay closed, and can never be cited as evidence.
- Q: How much goes in the public Program Registry?
  OPTIONS: (a) Every pilot, tuning run, study and product evaluation that compares configurations, recipes or blocks with raters or AI judges. Existence is always public; design details may be embargoed for at most 12 months. (b) Research studies and pilots only. Product evaluations stay internal and can never be cited.
  REC: (a). Conversion A/B tests on product telemetry may stay internal, but they can be cited publicly only if registered before launch with a fixed horizon or sequential-valid statistics.
- Q: Will you accept the product-claim limits?
  OPTIONS: (a) As drafted: computed labels with no override; no efficacy claims before Stage 2 acceptance; Monitor sign-off; showcases as seeded random draws. (b) As (a), but hand-picked galleries are allowed if they state the selection ratio. (c) Allow citing the Monitor's results report before Stage 2.
  REC: (b). Hand-picked galleries are fine when the ratio is stated (for example, '3 hand-picked of 40'). Reject (c), because peer review of the conclusions is part of the protection.
- Q: When do evidence labels expire, and is there a standing budget to renew them?
  OPTIONS: (a) At the earlier of the studied model's retirement or 24 months after data freeze. (b) At retirement only. (c) At 24 months only. Renewal budget: a bridging study is about $2–4k; a full rerun is about $20–24k (estimates from the study1 cost model).
  REC: (a), plus a budget for one bridging study per model generation the product's claims rely on.
- Q: Approve the credibility add-on budget and infrastructure?
  OPTIONS: A rough $5–15k on top of the ~$24k core, all estimates: Monitor fee; red team at about $1–3k per round, two rounds; invited outside baseline; A/A arm at about $250; third-party expert recruitment at about $1–3k; CODECHECK. Optional: a compute-matched best-of-N arm at about $1.5k. Also: set up an Anthropic organization account, needed because the Admin API that reconciles per-key usage is unavailable to individual accounts (verified), plus dedicated, spend-capped study keys at each provider.
  REC: Approve the core items and the organization account. Decide on best-of-N before Stage 0, because it is an arm.
- Q: Smallest effect of interest (SESOI) and equivalence margin. At ±0.08, a block with a true win rate of 57% can be declared 'negligible', and a product team has a cost reason to want that conclusion.
  OPTIONS: (a) Keep ±0.08, with an explicit rationale written before any data. (b) Tighten the margin and buy power with more briefs (about $2.2k of generation per extra 12 briefs).
  REC: Write the rationale first (a preference shift buyers would notice, or the D3-auto cost break-even) and let it set the margin. If it implies a tighter margin, add briefs rather than raters. Fix this in Stage 0.
- Q: Patents, funding and the legal entity, all of which must be disclosed completely in the first filing.
  OPTIONS: Patents: (a) file none on configurations, the recommender or the composer; (b) file, with full disclosure. Funding: state who pays for Study 1, and that funder's role in design, analysis and the decision to publish.
  REC: Decide before Stage 0 so the first disclosure is complete. If you file, file before Stage 1 submission, disclose it, and commit publicly that no filing will ever delay publication.
- Q: May the product compose new configurations? Protocol 05 §B classes 'an LLM assembling the legos itself' as off-path, a different system.
  OPTIONS: (a) Record a User ADR allowing design-time composition under the engine's composed-kind validator profile. Runtime self-assembly stays parked. Composed recipes are always labelled Composed and never count as evidence. (b) Limit the product to recommending canonical configurations until a composer study exists.
  REC: (a). It matches ADR-0042's north star. Its evaluation needs a separate preregistered study.
- Q: Decision-log visibility and ratification.
  OPTIONS: (a) Research ADRs fully public; product ADRs private, with their hashes published. (b) Everything public. (c) Private, with timestamps only.
  REC: (a). Put the ActAI folder under git today. Ratify the 15 by-continuation ADRs in one session before Stage 0, starting with 8, 11, 12, 13, 15, 17 and 27, which Paper 1 freezes or the validator turns into hard gates. Include the port rule 4 exception for C1-H's D3-auto.
- Q: Engine sequencing: build the credibility gates into the harness spine now, or later?
  OPTIONS: (a) Build the day-one gates before the pilot: gateway registry gate and tagging, escrow, channels and lock provenance, Judge integrity, instrument scoping, schema-versioned recipe hashing. Defer the composer profile. (b) Build only Paper 1 essentials and add the gates later.
  REC: (a). The estimate is roughly 4–7 extra engineer-weeks over the ~4-week spine, much of which Paper 1 needs anyway. Under (b), the pilot would run without the controls that make it credible.

# MORE TO EXPLORE
- Full adversarial collaboration, with a known skeptic of prompt-protocol claims co-signing the predictions and the claims table (Melloni-style, cited by COI and not opened here). It is heavier than the charter's invited-baseline slot.
- A programmatic, multi-study Registered Report covering Paper 1 and Paper 2. PCI offers this format but is unavailable, so check whether the chosen journal supports anything similar.
- Sigstore Rekor as a transparency log, in place of or alongside OpenTimestamps for ledger roots.
- A recognition probe: ask the worker model to name the real product behind a sample of fictionalized briefs, and report the hit rate.
- Exporting run manifests and lineage as a Workflow Run RO-Crate or W3C PROV, for external provenance checks.
- A preregistered conceptual replication on successor models, as the planned answer to model retirement.
- Quality-diversity (MAP-Elites) search over the space of valid recipes.
- A recommender learned from product usage logs, only with separate consent and a separate preregistration.
- LLMs assembling or changing configurations at runtime (protocol 05 §B).
- DSPy- or GEPA-style optimization of block prompts. It conflicts with frozen prompts and with 05 §H's averaging warning.
- Information-flow type systems that formally prove the port rules.
- A third-party block marketplace with signed blocks and supply-chain checks.
- GRADE-style certainty ratings beyond the indirectness differences already in the scope tuple.
- Admitting VERIFY to the lego set as a product-only, off-path extension that is admitted but untested.
- Bayesian estimates reported alongside the frequentist confirmatory tests.
- A live-iframe expert subsample (already planned) as an exploratory check on rendering effects.