# study1

## Summary
Recommended Study 1 design. It is a preregistered, within-brief experiment that compares a headless, automatable C1 ("C1-H") against three prompting baselines and five block ablations. All arms run on 48 confirmatory landing-page briefs, sampled at random across 12 product categories and fictionalized, plus 12 development briefs used for the pilot. Each arm produces 4 candidates per brief (the article's x4), giving about 1,728 confirmatory pages.

The 9 arms:
- Baselines: B-Plain, B-Random (the article's "be totally unique, make every decision at random" prompt) and B-Skill (Anthropic's frontend-design skill, pinned).
- C1-H: SEED x4, then a blind Fable 5.1 critic loop in OK mode with the hidden 9/10 threshold (probe 2, cap 5), then ASSET on every candidate, then D3-auto.
- Ablations: -SEED, -CRITIC, -ASSET, -D3, and CRITIC-self. CRITIC-self is a compute-matched mechanism ablation: the worker reviews its own screenshots in its own context.

Ablations branch from shared design lineages. Each ablation is compared against the same seed root, which makes it cheaper and lowers variance; -D3 costs nothing because it is the snapshot taken before D3.

Human-in-the-loop handling:
- VISION is excluded; Study 1 uses the seed route only.
- The "plain?" gate is replaced by a fixed always-on rule.
- There is no pick step: every candidate is evaluated.
- CUT and TELLS run as a clearly labeled AI stand-in (D3-auto), which is itself ablated.
- VOICE is neutralized by an identical human-written copy deck for every arm (VOICE-early). This also removes copy as a confound.
- Human-in-the-loop C1 (VISION, human pick, human CUT/TELLS/VOICE) becomes Study 1b, run with trained designer-operators on the same harness and with the same raters.

Measurement:
- Primary outcomes are lay pairwise preference for quality and, separately, for distinctiveness, collected on Prolific.
- Secondary outcomes: an expert panel; held-out non-Claude AI judges (GPT-5.6 Sol and Gemini 3.1 Pro); diversity within each brief (Vendi score over DreamSim embeddings, validated by a human triplet task); homogeneity across briefs; a deterministic 16-pattern tell detector (Krebs-style), independent of the D3 catalog; a 5-second comprehension test; defect checks; and cost.

Analysis and power:
- Primary inference is a cluster-level test across briefs, with Holm correction within each hypothesis family and a GLMM as the robustness check. Equivalence and non-inferiority use a 0.08 win-rate margin.
- A Monte Carlo power simulation (assumptions stated) gives these results at 48 briefs, 4 candidates and 24 lay judgments per brief per contrast:
  - power 0.94 to detect a 60% win rate in the replication contrasts;
  - power 0.81 for a 58% win rate and 0.96 for 60% in the matched ablation contrasts;
  - about 0.87 power to show a block is equivalent to no effect when its true effect is zero.
- The pilot re-estimates the variance parameters, and a preregistered rule can raise the brief count to 60.

Cost: about $24k for the core study, itemized below. Generation is about $8.7k, plus about $2.2k for the pilot. Lay raters are about $3.3–3.6k for roughly 16.6k judgments from about 550 people. The expert panel is about $5k, copy decks about $2.4k, and AI judges about $0.5–1k. A lean version costs about $20k.

Route: an OSF preregistration, or a Registered Report through PCI RR, which is recommended because several ablations will likely come out null. A rough timeline: about 4 weeks to build the harness, 2 weeks of pilot, then freeze, 10 days of generation, 2 weeks of rating and 2 weeks of analysis.

Scripts used for the numbers: C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-OneDrive-Documents-ActAI/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/power_sim2.py and .../cost_model.py

## Recommendations
### Research questions and directional hypotheses [high]
RQ1, replication on quality. H1a–c: P(C1-H preferred over X) > .50 on lay pairwise 'Which page looks better designed?', for X in {B-Plain, B-Random, B-Skill}. Expected effect is ≥.65 against Plain and Random and about .58–.60 against Skill.

RQ2, replication on distinctiveness. H2a–c: C1-H is judged more distinctive than each baseline (lay pairwise). Secondary hypotheses:
- H2d: C1-H has higher diversity within each brief (Vendi over DreamSim) and lower homogeneity across briefs than B-Plain and B-Random.
- H2e: C1-H has fewer catalogued tells than B-Plain and B-Random. Nothing is hypothesized for B-Skill, because its avoid-list targets the same patterns.

RQ3, block contributions. Each block is tested on the outcome it is theorized to move:
- H3a: C1-H beats -CRITIC on quality.
- H3b: C1-H beats CRITIC-self on quality. This tests whether the gain comes from a separate, blind, stronger critic or just from more iterations.
- H3c: C1-H beats -ASSET on quality.
- H3d: C1-H beats -D3 on quality.
- H3e: C1-H is more distinctive than -SEED and more diverse by Vendi score, and is NON-INFERIOR to -SEED on quality (lower 95% bound > .42).

RQ4, measurement (secondary). How well do held-out non-Claude AI judges and automated metrics agree with humans? This validates the harness for paper 2.

RQ5 (descriptive): $ per candidate and quality per $.

Holm families:
- F1 = H1a–c.
- F2 = H2a–c plus the distinctiveness part of H3e.
- F3 = H3a–d.
- The H3e non-inferiority test stands alone.
- H2d–e form a secondary family.
- Why: Block-specific outcomes keep the ablations from being judged on outcomes they were never meant to move. For example, SEED buys diversity and may not raise preference, so its test is diversity plus quality non-inferiority, not superiority. Separate families keep the multiplicity correction honest without crushing power. These hypotheses map one-to-one onto C1's own success criteria in 03-configurations.md, which call for distinct directions, a held-out evaluator and fewer elements.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/03-configurations.md; https://www.psychologicalscience.org/journals/ampps/2515245918770963/

### Baseline conditions [high]
All baselines run 4 independent fresh sessions per brief.
- B-Plain: 'Build a landing page for [product]', plus the shared brief block (product facts, locked copy deck, must-haves).
- B-Random: the article's 'be totally unique, make every decision at random' prompt, verbatim, plus the same block.
- B-Skill: B-Plain with Anthropic's frontend-design SKILL.md loaded, pinned to a commit hash. The skill is about 2,600 words. It uses a two-pass plan, critique and build process, and its avoid-list covers eyebrow labels, identical cards and default typefaces. That makes it the strong baseline and a direct test of banning up front versus auditing after (05 #6).

Every arm, C1 included, uses:
- the same worker (claude-opus-5-5 with effort set explicitly, e.g. 'high', because the API default is 'medium');
- the same sandbox and the same static-build requirement;
- the SAME generate_image tool available, with one pinned image model (e.g. Gemini 3.1 Flash Image).

With tool access equal, ASSET's effect comes only from the explicit instruction, which matches the block's own claim that agents underuse tools until told to use them.

Left out on purpose:
- a 'skill + self-refine' baseline, because CRITIC-self already supplies the compute-matched contrast;
- C1+skill, because it contradicts the article's no-up-front-bans rule. Move it to Study 2.
- Why: Reviewers will want at least one strong, widely used baseline alongside the two article baselines. Equal tool availability removes an 'it just had images' objection. Fixing effort explicitly matters because Opus 5.5's default effort differs from Claude Code's defaults, and sampling parameters can't be set on these models.
- Src: https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/05-more-to-explore.md

### Definition of the C1-H treatment arm [high]
D1 is x4[SEED]. The agent runs the shell command that generates the string; the harness logs the string and the per-axis direction to seeds.jsonl. The seed prompt is runbook §3 with the ⟨A⟩ structural axis.

D2 is each[critic loop]:
- Critic: claude-fable-5-1, run as a fresh, isolated call that sees only the renders.
- Prompt: the frozen OK-mode critic prompt from runbook §4.
- Renders: desktop full-page, mobile full-page and the above-the-fold crop.
- Gate: the hidden 9/10 threshold held by the worker, with probe 2, cap 5, the plateau rule and a fresh best-snapshot re-rank at exit.
- Then ASSET on every candidate. The '?H plain?' gate becomes ALWAYS-ON, with 1–3 slots and ≤3 retries per slot.

D3-auto, a labeled stand-in:
- CUT: a fresh-context Fable 5.1 'taste owner' sees only the renders and issues an itemized removal directive (the five probes, removal verbs only, ≤2 rounds). The worker applies it.
- TELLS: a sweep using ONLY the article's 4-row catalog, one swap per prompt. A blind Fable A/B call keeps the better version.
- CRITIC-check: defects only.

What stays out:
- VISION, the human pick, backtracks and recalibration mid-study (the critic is calibrated once in the pilot and then frozen);
- RELAY;
- human VOICE.

Use OK mode, not GREAT. GREAT would require curating 4 references per brief, which adds a design decision that could confound the result.

In the paper, always call this arm 'C1-H (headless)' and never just 'C1'.
- Why: This keeps everything the article actually demonstrated end-to-end with agents: seeded drafts → critic loop on each → image enrichment. Every human gate becomes an explicit, preregistered rule, so nothing hidden is left to the experimenter. Running all candidates through D2 follows the article ('all four seeded drafts went through the critic'). The ⟨A⟩ cap of 5 and the calibration step are declared amendments.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/06-runbook.md; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/01-blocks.md

### Which ablations are worth their cost [high]
INCLUDE these five. Costs are per brief, from the cost model.
- -SEED: plain roots, which are reused from B-Plain, then the full D2/D3 pipeline (~$31). This tests the article's T1 claim, judged on diversity and distinctiveness.
- -CRITIC: seed build, then ASSET, then D3 (~$15). This tests T3, the article's central technique.
- CRITIC-self: the worker reviews its own screenshots in its own context, with the same prompt text, cap and 9/10 rule (~$29). This is the compute-matched mechanism test of 'blind separate critic' versus 'more iterations'. It is the single most valuable addition for reviewers.
- -ASSET: the post-critic snapshot, then D3 (~$10).
- -D3: the snapshot taken before D3 ($0).

DEFER or EXCLUDE these:
- -RELAY: the block is optional, applies only after a pick, motion is invisible in static ratings, and video generation is costly.
- -VISION and -VOICE: these are human blocks and belong in Study 1b.
- Separate -CUT and -TELLS arms: D3-auto is a stand-in, so splitting it doubles cost for a weakly valid construct. Split only with human operators, and only if -D3 shows an effect.
- A critic-tier ablation (Opus 5.5 as the blind critic): +$29 per brief. Move it to Study 2.
- GREAT mode.
- -pick: the evaluation design already removes the pick, since every candidate is evaluated.
- Why: The blocks included are the article's three automatable techniques plus the D3 stand-in, and each has a cheap branch point. The excluded ones either need human taste or can't be judged with static stimuli. Otherwise they double cost for a construct of low validity.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/03-configurations.md

### Branched (prefix-sharing) generation tree [medium]
Each seeded root grows a tree:
- seed build → -CRITIC branch (ASSET → D3)
- seed build → CRITIC-self branch (self-loop → ASSET → D3)
- seed build → critic loop → -ASSET branch (D3)
- seed build → critic loop → ASSET → [snapshot = -D3] → D3 = C1-H

The plain roots ARE the B-Plain outputs and feed the -SEED pipeline. Ablation contrasts that share a root (-CRITIC, CRITIC-self, -ASSET, -D3) use MATCHED pairs: the same candidate lineage, judged A/B. The estimand is the effect of adding block X to the same design. Baseline contrasts and -SEED use unmatched pairs (all 4×4 candidate pairings).
- Why: Branching cuts generation cost by roughly 40% (-D3 is free) and removes candidate-to-candidate noise from ablation contrasts. It also mirrors how the article itself judges D3 ('keep whichever you like better'). The power simulation includes this matching through a lineage correlation of 0.6.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/02-grammar.md

### Human-in-the-loop blocks: what Study 1 does with them [high]
Use a hybrid of 'restrict Study 1 to automatable stages' and 'AI stand-in for D3 only'.
1. VISION is out; Study 1 uses the seed route only.
2. The decision gates become preregistered deterministic rules: plain? is always run, there is no pick, and there are no backtracks.
3. CUT and TELLS become D3-auto. It is labeled as a stand-in and ablated, because the protocol itself lists a fresh-context reviewer as 'experimental'.
4. VOICE is neutralized by an identical human copy deck (VOICE-early) for every arm.

Then run Study 1b, the human-in-the-loop arm, as its own preregistered study on the same harness, raters and analysis:
- 8 professional designer-operators follow scripted SOPs for VISION (system route), plain?, pick, CUT itemization, TELLS A/B and VOICE rewriting.
- Operators are assigned to briefs in a Latin square on 24 of the Study 1 briefs.
- Contrasts: human-in-the-loop C1 vs C1-H, and the VISION route vs the SEED route.
- Operator is a random effect, and operator time is logged.
- Operators know the condition but not the hypotheses; raters are fully blind.
- Rough cost is about $12–15k, mostly operator time.
- Why: Running operators at full Study 1 scale (48 briefs × several arms × 4 candidates) is unaffordable, and operator skill becomes a confound. A fully AI-stand-in arm changes the construct the article claims, which is human taste. The hybrid gives a clean, reproducible causal test of the automatable mechanics now. It then measures what human taste adds as a separate, smaller study, without over-claiming in paper 1.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/01-blocks.md

### Copy control (removes the biggest confound) [high]
An independent freelance copywriter, not the protocol authors, writes one copy deck per brief:
- brand name, headline, subhead, 3–4 feature blurbs, how-it-works, a pricing teaser, CTA labels and footer;
- strings marked REQUIRED or OPTIONAL.

Every arm receives the deck verbatim. Agents may drop OPTIONAL strings, which CUT may need to do. They may add only labels of 4 words or fewer (nav, badges, eyebrows). Those labels are logged and counted, because eyebrow count is itself a tell.

Compliance check: a DOM text diff against the deck, plus OCR on generated images so no text appears in them. Raters therefore compare identical words in different designs.
- Why: Copy differs wildly between unconstrained runs and drives preference, so without this the study would measure copywriting. The runbook already tells workers 'Do not rewrite copy' and treats copy as placeholder until VOICE. Supplying human copy up front is the protocol's VOICE-early variant, applied to every arm alike.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/06-runbook.md

### Task set (briefs) [high]
Write 60 briefs: 12 development briefs for the pilot and prompt freezing, and 48 confirmatory briefs that stay sealed (SHA-256 hash) until the frozen run.

Sampling:
- Draw from a stratified random sample of real product launches, e.g. Product Hunt daily launches plus Show HN for developer tools, January–June 2026, with a published random seed.
- Use 12 strata × 5 briefs (1 development + 4 confirmatory per stratum). Strata: dev tools/API; B2B SaaS; consumer mobile app; fintech; health/wellness; D2C physical product; hardware/IoT; creative tools; education; local service/hospitality; nonprofit/civic; AI product.
- Balance a brand-tone tag (playful / serious / technical / premium) across strata.

Fictionalize each product: new name with a trademark check, perturbed details. Write it into a fixed 80–120-word template: one-line description, audience, 3 features, primary CTA, tone, must-haves. Attach the copy deck.
- Why: Sampling briefs from real launches, at random, beats briefs written by the experimenters or by an LLM. UI-Bench used 30 GPT-5-generated briefs across 5 categories. Real sampling raises external validity and blocks accusations that the briefs were chosen to favor C1. Fictionalizing prevents models and raters from recognizing brands. Westfall et al. show that when stimuli are a random factor, power plateaus with more raters and must be bought with more stimuli. That is why briefs, not raters, are the sample size that matters.
- Src: https://arxiv.org/html/2508.20410; https://forrt.org/curated_resources/statistical-power-and-optimal-design-in/

### Generation counts and unit of analysis [high]
Use K=4 candidates per arm per brief, the article's x4. Nine arms give 36 final pages per brief: 1,728 confirmatory pages, 432 pilot pages, plus every intermediate snapshot archived. The unit of evaluation is EVERY candidate; there is no human or AI pick before evaluation.

Secondary analysis: does the loop critic's best-snapshot re-rank, used as pick(C), choose the candidate humans prefer more often than chance?

Failures: one automatic retry for infrastructure failures only (container crash, API 5xx). Never retry because of quality. Show any remaining broken pages as rendered (intention-to-treat), and report failure rates per arm.
- Why: Evaluating all candidates removes the best-of-4 selection advantage that would otherwise inflate C1's results over single-shot baselines. It also yields within-brief diversity measures for free. Quality-based retries would be an undisclosed researcher degree of freedom.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/02-grammar.md

### Outcomes (primary, secondary, fidelity checks) [high]
PRIMARY outcomes are two lay pairwise forced choices, each asked of a different set of raters:
- Quality: 'Which page looks better designed?'
- Distinctiveness: 'Which page looks more distinctive — less like other websites you've seen?'

SECONDARY outcomes:
- Expert pairwise, using UI-Bench's question 'Which would you be more likely to deliver to a client?'
- Within-brief diversity: Vendi score over DreamSim embeddings of the 4 candidates.
- Cross-brief homogeneity: mean similarity across different briefs within an arm, the 'hivemind' measure.
- Distance from the B-Plain centroid.
- Tell count from a deterministic DOM/CSS detector reimplementing Krebs's 16 patterns. It is independent of the article's 4-row catalog that D3-auto uses, so the outcome is not taught to the test.
- A 5-second comprehension test ('What does this product do?'), used as clarity non-inferiority.
- Defects: axe-core violations, horizontal overflow at 390px, missing assets, console errors.
- Tokens and $.

FIDELITY and manipulation checks:
- seed spread on each axis;
- critic iterations and score trajectory;
- number of raster images integrated;
- elements, fonts and colors before vs after D3;
- copy compliance %.

Following port rule 8, no outcome uses an AI detector or a 'looks AI-made' rating.
- Why: Asking about quality and distinctiveness separately keeps the 'novel but worse' tradeoff visible. Tuch et al. found users prefer prototypical, low-complexity sites at first impression, which biases lay quality AGAINST distinctive designs. The clarity test and the expert panel guard against that. A deterministic detector is cheap, reproducible and already field-tested on 1,590 Show HN sites, with a manual-QA false-positive rate of 5–10%.
- Src: https://adriankrebs.ch/blog/design-slop/; https://research.google/pubs/the-role-of-visual-complexity-and-prototypicality-regarding-first-impression-of-websites-working-towards-understanding-aesthetic-judgments/; https://arxiv.org/abs/2210.02410; https://arxiv.org/abs/2306.09344; https://arxiv.org/html/2508.20410

### Lay rater design (Prolific) [high]
Recruitment and pay:
- Prolific, desktop/laptop only, ≥98% approval rate, fluent English.
- One question type per rater (quality OR distinctiveness), to avoid halo effects.
- 30 pairs per session, about 20 minutes, paid $4.50 per session (about $13.50/h, above Prolific's recommended $12/h).

Task:
- Each rater sees any brief at most once.
- Left/right is randomized.
- Full-page desktop renders appear side by side in a scrollable viewer with the fold marked. Raters must view for at least 8 s and scroll both pages.
- Forced choice, plus confidence on 3 levels.

Quality control:
- 3 gold checks per session (an unstyled or broken page vs a normal one; an instructed-response item).
- Preregistered exclusion: failing ≥2 golds, or a median response time under 5 s.
- 5% of pairs are repeated by different raters to measure reliability.
- 10% are random 'connectivity' pairs across all 9 arms, so a global Bradley–Terry ranking can be fitted.

Volume: 12 contrasts × 48 briefs × 24 = 13,824 primary judgments, about 16.6k with the extras, from about 553 raters.
- Why: Pairwise forced choice is the field's standard for taste: Chatbot Arena, Design Arena and UI-Bench all use it, and Chatbot Arena reports good crowd–expert agreement. Prolific has stronger attention-check performance and a lower cost per high-quality respondent than MTurk (Douglas et al. 2023). Separating question types and checking with gold pairs addresses halo effects and inattention.
- Src: https://researcher-help.prolific.com/en/article/2273bd; https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0279720; https://arxiv.org/abs/2403.04132; https://notes.designarena.ai/methodology/

### Expert panel [medium]
Recruit 20 professional designers:
- ≥3 years in UI, web or brand design, portfolio-verified;
- recruited OUTSIDE the team's network, excluding anyone who has seen the protocol;
- paid $90/h for about 2.5 h each.

They judge 5 contrasts (H1a–c, H3a–b) × 48 briefs × 8 = 1,920 judgments, with the same viewer and the UI-Bench question.

Analysis: the expert results are secondary-confirmatory. Report per-contrast estimates, test the rater-type × condition interaction (does expertise flip any result?), and report agreement between experts and lay raters.
- Why: Journals will ask whether lay preference equals design quality. UI-Bench's 194-expert, 4,075-match study shows expert pairwise judging is feasible, but it published no reliability statistics; we will. Simulated power at 8 judgments per brief-contrast is about 0.90 for a 62% win rate.
- Src: https://arxiv.org/html/2508.20410

### AI judges and automated metrics (secondary only) [high]
AI judges:
- Use GPT-5.6 Sol and Gemini 3.1 Pro, both non-Claude families. Never use the loop critic, and never use any Claude model as a judge.
- Both judges see the same screenshots with a frozen pairwise prompt, in both orders, for 8 pairs per brief-contrast, via batch APIs.
- Report Cohen's κ against the human majority, sign agreement on each contrast, and Spearman correlation on per-brief win rates.

Validating the automated metrics before relying on them:
- DreamSim on web pages: a human triplet task (~600 triplets × 3 raters). Keep DreamSim as secondary-confirmatory only if it agrees with the human majority ≥70% of the time; otherwise demote it to exploratory.
- Krebs-16 detector: two trained coders on 150 pages; require κ ≥ .70.
- UIClip score: exploratory only.
- Why: Every arm is generated by Claude, and C1-H is optimized against a Claude critic. A Claude judge would therefore be both self-preferring (Panickssery et al.) and Goodhart-contaminated. Even non-Claude judges may share LLM taste with the critic, so where AI and human judges disagree, that is a finding, not noise. DreamSim was trained on synthetic natural-image pairs and was never validated on web pages.
- Src: https://arxiv.org/abs/2404.13076; https://arxiv.org/abs/2404.12500; https://developers.openai.com/api/docs/pricing; https://ai.google.dev/gemini-api/docs/pricing

### Analysis plan [high]
Primary test, per contrast: a cluster-level analysis. For each brief, compute the win proportion. Run a one-sample t-test against .50 across the 48 briefs, two-sided, with Holm correction within each family. This is exactly the statistic the power simulation used.

Robustness: a logistic GLMM (lme4): win ~ 1 + position + (1|rater) + (1|brief) + (1|cand_A) + (1|cand_B). If it disagrees with the primary test, report both; the primary test decides.

Other analyses:
- Global ranking figure: a hierarchical Bradley–Terry model over all 9 arms, using the connectivity pairs.
- Equivalence and non-inferiority: TOST with a margin of ±0.08 on the win-rate scale.
- Automated metrics: paired differences per brief, Wilcoxon signed-rank tests, Holm.
- Tell counts: a negative-binomial GLMM with a random intercept for brief.
- Moderators: product category and brand tone are exploratory; the rater-type interaction is secondary.
- Cost-effectiveness: descriptive only.

Process safeguards:
- Blind analysis: write and freeze the code on simulated and scrambled-label data, then unblind.
- Failed candidates stay in as intention-to-treat; excluding them is a sensitivity analysis.

Reporting: win rates with 95% CIs, odds ratios and BT scores.
- Why: With few clusters (briefs) and crossed random factors, a cluster-level test is robust, transparent and matches the power analysis. The GLMM uses more information but can fail to converge, so it serves as the check. TOST lets the paper claim a block 'does not meaningfully contribute' instead of merely 'no significant effect', which matters because some ablations will likely be null.
- Src: https://www.psychologicalscience.org/journals/ampps/2515245918770963/; https://forrt.org/curated_resources/statistical-power-and-optimal-design-in/

### Power analysis and preliminary sample size [medium]
Method: Monte Carlo, 1,000 reps per cell, on a logit scale.

Assumptions:
- Brief-level heterogeneity in the effect: τ_b = 0.5.
- Quality SD between candidates within an arm: σ_c = 0.8.
- Rater taste SD on each contrast: σ_r = 0.5.
- Matched-lineage correlation for branched ablations: ρ = 0.6.
- K = 4 candidates; brief-level t-test; worst-case Bonferroni within each family (α = .05/3 for replication, .05/4 for ablations).

Results at 48 briefs and 24 lay judgments per brief per contrast:
- Replication contrasts: power 0.94 at a 60% win rate, 0.99 at 62%.
- Matched ablations: 0.81 at 58%, 0.96 at 60%; at 60 briefs, 0.92 at 58%.
- Equivalence: the SD of per-brief win proportions is about 0.17, so the 90% CI half-width is about 0.042. A ±0.08 margin then gives about 0.87 power to show equivalence when the true effect is zero.
- Sensitivity: with τ_b = 0.8, power is 0.95 at 62%.
- Experts with 8 judgments per brief-contrast: 0.90 at 62%.
- Type I error checked at the nominal rate.

Going beyond 24 judgments per brief-contrast adds little; briefs are the binding resource. Preregistered pilot rule: if the 12 development briefs give τ_b > 0.8 or σ_c > 1.0, raise the confirmatory set to 60 briefs (cap 64). Fix this BEFORE confirmatory generation. Pilot data never enter the confirmatory analysis.
- Why: No published variance components exist for agent-built landing pages, so the assumptions are explicit, and a separate pilot (not part of the confirmatory sample) re-estimates them. This kind of nuisance-parameter planning raises no α concerns. Westfall et al. explain why adding raters cannot rescue an under-sampled stimulus set.
- Src: https://forrt.org/curated_resources/statistical-power-and-optimal-design-in/; file:///C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-OneDrive-Documents-ActAI/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/power_sim2.py

### Itemized cost model (shown before any spend) [medium]
Unit costs. Prices: Opus 5.5 at $4/$20 per MTok (cache write $5, cache read $0.20); Fable 5.1 at $10/$50; image input billed as ceil(w/28)×ceil(h/28) visual tokens; Gemini 3.1 Flash Image at $0.101 per 2K image. Token counts are ASSUMPTIONS until the pilot measures them.
- Build session: ~$1.83
- Fix turn: ~$0.80
- Critic call (3 renders): ~$0.21
- Re-rank: ~$0.30
- ASSET pass (including ~4 images): ~$1.32
- D3-auto: ~$2.42

Per brief at K=4: C1-H $38, -SEED $31, CRITIC-self $29, -CRITIC $15, -ASSET $10, -D3 $0, B-Plain $7, B-Random $7, B-Skill $7.5. That totals about $144, or $180 with 25% contingency.

Budget lines:
- Confirmatory generation (48 briefs): ~$8.7k. Plausible range $4.5–17k.
- Pilot (12 development briefs, all arms): ~$2.2k, or $0.8k for 3 arms.
- AI judges (9,216 calls per judge): ~$1.0k, or about $0.5k in batch mode.
- Lay raters: ~$2.5k in rewards + Prolific fee (33.3% academic / 42.8% corporate, with VAT on the fee) = $3.3–3.6k.
- Lay pilot + DreamSim triplets + 5-second test: ~$1.0k.
- Experts: $4.5k + ~$0.5k recruiting and verification.
- Copy decks and fictionalization (60 × ~$40): ~$2.4k. Get a quote.
- Detector coders: ~$0.3k.
- IRB: get a quote.
- Optional GPT-worker arm (24 briefs): ~$1.4k generation + ~$0.6k raters.

Totals: CORE ≈ $24k. LEAN ≈ $20k (12 experts on F1 only, 3-arm pilot, batch judges). Enforce hard per-run caps in USD in the harness, and spend-capped keys for each provider.
- Why: The user asked for an itemized cost before spending. Generation is the main cost driver and the most uncertain, so the pilot's measured cost per arm replaces these assumptions in the preregistration.
- Src: https://claude.com/pricing; https://platform.claude.com/docs/en/build-with-claude/vision; https://ai.google.dev/gemini-api/docs/pricing; https://developers.openai.com/api/docs/pricing; https://researcher-help.prolific.com/en/articles/445239-what-is-your-pricing; file:///C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-OneDrive-Documents-ActAI/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/cost_model.py

### Rendering and stimulus presentation [medium]
Rendering:
- Pinned Playwright and Chromium inside a pinned container image.
- Every site is a static build served offline, with Google Fonts responses cached locally.
- Capture after networkidle + 2 s, with CSS animations disabled and WebGL/shader canvases captured at t = 2 s.
- Desktop renders at 1440×900 (full page plus fold); mobile at 390×844.

What each audience sees:
- Raters see the desktop renders only, in a scrollable viewer.
- Mobile renders feed only the automated defect checks.
- An exploratory expert sub-sample views live sandboxed iframes, to check whether motion changes any conclusion.
- Why: Static stimuli are deterministic, archivable and identical for humans and AI judges, which matters for reproducibility and for judge–human agreement. UI-Bench used live iframes, which is more ecological but harder to control. The trade-off is that animation and ASSET shader effects are partly lost, which is stated as a limitation.
- Src: https://arxiv.org/html/2508.20410; file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/06-runbook.md

### Pilot, freeze and reproducibility controls [high]
Pilot on the 12 development briefs:
- critic calibration (2–3 strong sites vs 2–3 generic AI pages);
- prompt fixes only on development briefs;
- measure costs and failure rates;
- a rater pilot of about 1,500 judgments to estimate τ_b, σ_c and σ_r, timings and gold-check pass rates.

Then FREEZE and hash everything:
- prompts, SKILL.md commit, model IDs and effort levels;
- harness git commit and container digest;
- render settings, catalog version and image model;
- brief and deck hashes.

Confirmatory generation:
- Run all arms INTERLEAVED, block-randomized by brief, inside a window of 10 days or less.
- Log the model string returned on every call.
- Archive every artifact, snapshot and transcript, and never regenerate.
- Freeze and archive the judge calls in the same way.
- Why: Model drift and deprecation are the biggest replicability threats in LLM experiments. Interleaving keeps any drift from being confounded with condition. Archived artifacts make the human evaluation replicable even after the models are retired.
- Src: file:///C:/Users/arvik/OneDrive/Documents/ActAI/protocol/06-runbook.md

### What goes in the preregistration, and the publication route [medium]
Follow the OSF Prereg structure:
1. Hypotheses: the directional H1–H3 with their families.
2. Design: 9 arms, the branch tree, randomization and blinding.
3. Sampling plan: brief sampling frame and seed; 48 briefs (60 under the pilot rule); K=4; 24 lay judgments per brief-contrast; 20 experts; fixed N with no optional stopping; the simulation code and pilot parameters.
4. Variables: exact question wording, metric definitions, validation thresholds.
5. Analysis: primary test, Holm families, the TOST margin of 0.08, the GLMM robustness model, the ITT rule, the exclusion rules, and the list of exploratory analyses.
6. Frozen materials with hashes: prompts, SKILL.md commit, model IDs and effort levels, harness and container versions, critic calibration result.
7. Deviations-log policy and a model-retirement contingency.
8. Ethics approval.
9. Conflict of interest: the authors designed the protocol (allegiance).
10. Open data and materials: all pages, renders, transcripts and de-identified judgments. This is also a dataset contribution.

Route: prefer a Registered Report through PCI RR. A recommended Stage 2 is accepted without further review by PCI RR-friendly journals such as Royal Society Open Science. That protects publication of null ablations. Otherwise, use an OSF preregistration and target an HCI venue (CHI, UIST, IJHCS or TOCHI), citing Cockburn et al. on preregistering HCI experiments.
- Why: Several ablations are likely to be null. A Registered Report guarantees publication on the strength of the design rather than the results, and it is the strongest signal of rigor for a study with this many researcher degrees of freedom.
- Src: https://royalsociety.org/blog/2021/04/rsos-pci-rr/; https://openresearch.ed.ac.uk/pcirr/; https://cronfa.swan.ac.uk/Record/cronfa50415

## Options
### How to handle the human-in-the-loop blocks (VISION taste step, plain? gate, human pick, CUT/TELLS judgment, VOICE) -> C+B hybrid: deterministic rules for gates, D3-auto stand-in (ablated), VISION excluded, VOICE-early fixed copy; Study 1b with 8 operators on 24 briefs
- A. Trained, blinded operators following scripted SOPs at full scale: + Most faithful to C1 as the article describes it; tests human taste directly. | - Very expensive at 48 briefs × arms × 4 candidates. Operator skill becomes a confound. Operators can't be blind to their own condition. Slow.
- B. AI stand-ins for every human step (fully headless): + Cheap, scalable, reproducible. | - Changes the construct: the article's claim is human taste. An AI VISION 'reaction' and AI VOICE contradict the blocks' own guards (paste-back, 'make it sound human').
- C. Restrict Study 1 to automatable stages; human-in-the-loop becomes Study 1b: + Clean causal test of the mechanics; honest scope. | - Leaves D3 untested in Study 1 unless something stands in for it.
- C+B hybrid: deterministic rules for gates, D3-auto stand-in (ablated), VISION excluded, VOICE-early fixed copy; Study 1b with 8 operators on 24 briefs: + Tests every automatable block, including a labeled D3 stand-in. Removes the copy confound. Measures the value of human taste separately, with operator effects modeled. | - Two preregistrations. Paper 1 can claim only 'C1-H'.
### Which candidates get evaluated (the pick step) -> All 4 candidates per arm per brief
- All 4 candidates per arm per brief: + No selection advantage for C1; within-brief diversity measured for free; the pick can be studied as a secondary question. | - Estimates average output quality, not 'best you'd ship'.
- Best-of-4 per arm, picked by a held-out judge: + Closer to real use. | - Brings judge bias into the primary outcome; needs the same picker for every arm.
- One random candidate per arm: + Simple. | - Wastes 3/4 of the generated pages; loses diversity data.
### Copy handling -> Identical human copy deck for all arms (VOICE-early) with a compliance check
- Identical human copy deck for all arms (VOICE-early) with a compliance check: + Removes the largest confound; realistic pages; consistent with the runbook's 'do not rewrite copy'. | - Takes VOICE out of Study 1; needs an independent copywriter (~$2.4k).
- AI copy, text blurred in the screenshots: + No copywriter needed. | - Unnatural stimuli; blurring interacts with typography, which is a key design dimension.
- AI copy as generated: + Most naturalistic. | - Raters judge wording as much as design; confounded with arm.
### Ablation scope -> Core leave-one-out (-SEED, -CRITIC, -ASSET, -D3) + CRITIC-self
- Core leave-one-out (-SEED, -CRITIC, -ASSET, -D3) + CRITIC-self: + Covers every automatable block plus the key mechanism test; branching keeps cost at ~$180 per brief. | - Doesn't separate CUT from TELLS or test critic tier.
- Full: also split -CUT/-TELLS, a critic-tier arm, -RELAY: + Exhaustive. | - +$60–100 per brief; more multiplicity; RELAY can't be judged from static stimuli; the CUT/TELLS split is weakly valid under AI stand-ins.
- Minimal: -SEED and -CRITIC only: + Cheapest. | - Misses ASSET and D3 and the compute-matched control that reviewers will demand.
### Primary judge -> Lay pairwise primary; experts and non-Claude AI judges secondary
- Lay pairwise primary; experts and non-Claude AI judges secondary: + Large N; matches the target population; AI judges get validated rather than trusted. | - Lay raters may prefer prototypical layouts (Tuch), which biases against distinctiveness. Mitigated by the separate distinctiveness question and the expert check.
- Expert panel primary: + Construct validity for 'design quality'. | - Expensive per judgment; small pool; experts' taste may favor novelty.
- AI judges primary: + Cheap and fast. | - Self-preference and Goodhart risk (C1 is optimized against an LLM critic); unvalidated for UI taste.
### Brief source -> Stratified random sample of real launches, fictionalized, with a public seed
- Stratified random sample of real launches, fictionalized, with a public seed: + Auditable; externally valid; not chosen to favor C1. | - Sampling and fictionalization take work.
- LLM-generated briefs (UI-Bench style): + Fast. | - Synthetic; may carry the model's own defaults.
- Hand-written by the team: + Full control. | - Allegiance-bias risk.
### Stimulus presentation -> Static full-page desktop screenshots in a scrollable viewer
- Static full-page desktop screenshots in a scrollable viewer: + Deterministic and archivable; identical for humans and AI judges. | - Loses motion and hover; shader effects frozen.
- Live sandboxed iframes: + Ecological; shows motion. | - Varies with each rater's device; harder to archive; AI judges see something different.
### Primary statistical approach -> Cluster-level test across briefs (primary) + GLMM robustness + hierarchical BT for ranking
- Cluster-level test across briefs (primary) + GLMM robustness + hierarchical BT for ranking: + Robust with few clusters; matches the power simulation; transparent. | - Slightly conservative.
- Bayesian hierarchical Bradley–Terry as primary: + Uses all pairs; natural uncertainty estimates. | - Priors need justifying; reviewers less familiar with it; harder to preregister decision rules.
### Critic bar mode -> OK mode (the article's self-referential critic prompt)
- OK mode (the article's self-referential critic prompt): + Exactly what the article ran for its seeded drafts; no reference curation needed. | - Scores may be noisier.
- GREAT mode (4 references per brief): + Better aligned with humans, per PairS-style evidence. | - Curating references per brief adds a researcher decision and a confound.
### Model versions -> Current models (Opus 5.5 worker, Fable 5.1 critic) for every arm
- Current models (Opus 5.5 worker, Fable 5.1 critic) for every arm: + Relevant; longer availability; cheaper worker. | - Not the article's exact models (Opus 5 / Fable 5).
- The article's exact pair (Opus 5 worker, Fable 5 critic): + Exact-model replication. | - Older models are likely retired sooner; worker ~25% more expensive; less relevant to readers.
### Worker-family generalization inside Study 1 -> Add a small GPT-5.6 Sol worker arm (C1-H vs B-Plain, 24 briefs), preregistered secondary
- Add a small GPT-5.6 Sol worker arm (C1-H vs B-Plain, 24 briefs), preregistered secondary: + Answers 'is this Claude-specific?'; ~$2k. | - Adds one more hypothesis family.
- Defer to paper 2: + Keeps Study 1 simpler. | - Reviewers will flag the single-family limitation.
### Publication route -> Registered Report via PCI RR, then a PCI RR-friendly journal (e.g. RSOS)
- Registered Report via PCI RR, then a PCI RR-friendly journal (e.g. RSOS): + In-principle acceptance protects null ablations; the strongest rigor signal. | - Adds a Stage 1 review cycle before data collection; models may update meanwhile.
- OSF preregistration, then CHI/UIST or IJHCS/TOCHI: + Faster; HCI audience. | - Results-dependent acceptance; nulls are harder to publish.

## Risks
- Model drift or retirement during or after the study (pinned IDs change behavior, preview judge models such as Gemini 3.1 Pro Preview change) => - Pin model IDs and effort levels, and log the model string returned on every call.
- Interleave all arms by brief inside a 10-day window.
- Archive every artifact and transcript, and never regenerate.
- Run judge calls inside one short window.
- Preregister a retirement contingency.
- LLM-judge self-preference and Goodhart effects: C1-H is optimized against a Claude critic, so LLM judges may share that critic's taste => - Humans are the primary judges.
- AI judges come only from non-Claude families, and never the loop critic.
- Judge both orders.
- Report AI–human disagreement as a finding.
- Novelty vs quality confound: lay raters prefer prototypical layouts (Tuch et al.), so distinctive designs may lose on 'quality' even when they are better crafted => - Ask quality and distinctiveness of different raters.
- Add the expert panel and test the rater-type interaction.
- Run the 5-second comprehension test as non-inferiority.
- Test SEED for quality non-inferiority rather than superiority.
- Report the quality × distinctiveness frontier.
- Rater expertise and population: lay and expert judgments diverge; results tied to English-speaking, Western raters => - Preregister both rater types and their interaction.
- Record self-reported design experience.
- State the population; optionally stratify by country.
- Copy confound (wording drives preference) => - Identical human copy deck across arms.
- DOM-diff compliance check and OCR on generated images.
- Allow only short labels, logged and counted.
- Compute confound (C1 uses about 5× the tokens of the baselines) => - The compute-matched CRITIC-self arm.
- Report tokens and $ per arm, plus quality per $.
- Imagery confound (raters may prefer any raster imagery) => - The image tool is available to ALL arms; ASSET only adds the instruction.
- Log image use per arm.
- Sensitivity analysis controlling for raster image presence.
- Selection advantage from the pick step => Evaluate all 4 candidates. Study pick(C) separately as a secondary analysis.
- Experimenter allegiance and researcher degrees of freedom (the authors built the protocol) => - Preregistration or Registered Report.
- Development/confirmatory split with sealed hashes.
- Random brief sampling with a public seed.
- Independent copywriter.
- Blind analysis with scrambled labels.
- Declare the conflict of interest; release open materials.
- Tell outcome taught to the test (D3-auto removes exactly what the detector counts; B-Skill's avoid-list overlaps the detector) => - D3-auto uses only the article's 4-row catalog, while the outcome detector uses Krebs's 16 patterns.
- Report results per pattern and flag patterns that overlap.
- Make no tell hypothesis for B-Skill.
- Unvalidated automated metrics (DreamSim, Vendi on web pages; detector false positives) => - Human triplet validation with a ≥70% agreement threshold, otherwise demote the metric to exploratory.
- Two-coder validation of the detector, κ ≥ .70.
- Static stimuli miss motion and shader work from ASSET => - Animations settled with a fixed capture time.
- Exploratory live-iframe expert check.
- State the limitation.
- Brief or brand recognition by models or raters => Fictionalized names with a trademark check, and perturbed product details.
- Underpowered ablations if brief heterogeneity is larger than assumed => - Pilot re-estimation with a preregistered rule to raise briefs to 60 (cap 64).
- Equivalence tests so nulls stay interpretable.
- Briefs, not raters, are where extra power is bought.
- Pipeline failures that differ by arm (C1 has more steps that can fail) => - One infrastructure-only retry.
- Intention-to-treat handling.
- Report failure rates per arm, with a sensitivity analysis excluding failures.
- Headless C1 over-claimed as 'C1' => - Name the arm C1-H throughout.
- Make Study 1b (human operators) the test of human taste.
- Cost overrun from long agent turns => - Pilot-measured costs written into the preregistration.
- Hard USD caps per run in the harness.
- Spend-capped keys for each provider.

## Questions
- B-Random baseline wording: can you paste the article's exact 'random' prompt (and its seed and image-generation prompts) so the baselines are verbatim? The protocol files only paraphrase it. Or do you approve using the paraphrases, which weakens 'replication'?
- Ethics: do you, or a collaborator, have an institutional affiliation with an IRB? Journals such as RSOS or PLOS require an ethics statement for the Prolific and expert rating. If not, should I budget an independent IRB review (quote needed)?
- Publication route: a Registered Report through PCI RR (in-principle acceptance before data collection, protects null ablations, but adds a review cycle) or an OSF preregistration aimed at CHI/UIST or IJHCS/TOCHI?
- Budget: approve the core design (about $24k) or the lean one (about $20k)? Either way, may I spend the pilot first (about $2.2k generation + about $0.6k raters) and come back with measured costs before the confirmatory run?
- Prolific account type: academic or non-profit (33.3% fee) or corporate (42.8% fee)?
- Should the optional GPT-5.6 Sol worker arm (C1-H vs B-Plain on 24 briefs, about $2k) be part of Study 1, or deferred to paper 2?
- Who writes the briefs' copy decks? I recommend an independent freelancer rather than you or the team, to avoid allegiance bias. Any preferred channel for recruiting the 20-person expert designer panel?
- Rater population: restrict lay raters to the US and UK, or deliberately include other regions? Culture affects aesthetic preference, and this changes the paper's claims.
