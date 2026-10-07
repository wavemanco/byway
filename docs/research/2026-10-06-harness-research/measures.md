# measures

## Summary
Recommendation: humans decide the headline claims of Study 1 (C1 landing pages). Automated measures and AI judges come in as validated secondary outcomes, as mechanism checks for each block, and as guardrails. They never serve as unvalidated primaries.

The evidence supports this. General VLMs judged UI quality near chance: GPT-4V scored 51.6% against human designers, versus 75.1% for UIClip. A 2025 study found MLLM pairwise UI judgments 53–60% accurate overall, close to chance for similar UIs and above 90% only when quality gaps were large. Human designers agree only modestly with each other on UI quality (Krippendorff's alpha 0.37 in the UIClip paper). Leave-one-out ablations produce exactly the subtle differences where AI judges are weakest. A second problem is circularity: C1's own critic is a frontier VLM judge, and C1's TELLS catalog overlaps the public slop detectors. Without controls, automated measures will partly score C1 against its own targets.

PROPOSED STUDY 1 MEASURE SET
Unit: task × condition × run. Each run has k=4 candidates after the critic stage. Each task has a fixed copy deck, so copy is held constant across conditions.

PRIMARY (two co-primaries, Holm-corrected):
- P1 Quality: blind pairwise preference from lay raters ("Which page is better designed?"). Pages are shown as identical full-page renders with the desktop above-the-fold view first. Analysis: Bradley-Terry / mixed-effects logistic model with task and rater random effects. Contrasts: C1 vs Plain and C1 vs 'be creative'.
- P2 Distinctiveness (diversity within a task): Vendi Score over the k=4 screenshots of a task×condition cell, always compared at equal n. The similarity kernel is DreamSim on text-masked above-the-fold renders. That kernel is pre-registered only after a pilot shows it matches human odd-one-out triplet judgments better than DINOv2, CLIP/SigLIP and a DOM-structure kernel. If it fails that gate, P2 switches to human-rated distinctiveness.

SECONDARY:
- S1 Expert designer panel pairwise on a random subset.
- S2 Lay 'looks AI-made / template' judgment, plus a 5-second 'name the intended feeling' test. These map to C1's own success criteria.
- S3 Held-out cross-family AI-judge panel. It excludes C1's critic family, judges in both orders, and is validated with the alternative-annotator test. Its labels are combined with a random human-labeled subset by prediction-powered inference, which gives valid confidence intervals on the ablation contrasts.
- S4 Slop load, split into patterns that overlap the TELLS catalog vs held-out patterns. Instruments: design-slop-cop (MIT, pinned) and Impeccable detect (Apache-2.0, slop subset only, pinned), plus emergent tells mined from pilot outputs.
- S5 Homogeneity across tasks within a condition ('house style'): mean DreamSim similarity, modal-font share, palette-hue entropy.
- S6 Structural diversity: section-sequence edit distance, APTED tree edit distance on pruned DOM skeletons, and Design2Code-style block/position metrics. This answers 'palette swap or real structural difference?'.
- S7 Exploratory: UIClip scores, AIM/Reinecke-style colorfulness and complexity, element count, raster-image area vs CSS-gradient count.
- S8 Process data (never outcomes): critic score trajectories, rounds to threshold, share of runs hitting the cap, tokens, $, wall-clock.

MANIPULATION CHECKS (pre-registered, one per block):
- SEED should raise P2.
- CRITIC should raise S3 and P1.
- ASSET should raise raster-image area and cut CSS-blob gradients.
- TELLS should cut catalog-overlap slop without raising held-out slop.

GUARDRAILS (non-inferiority vs Plain; failing pages are kept in the analysis, intention-to-treat):
- G1 Render integrity at 1440×900 and 390×844: no uncaught JS errors, no broken assets, no horizontal overflow, CTA visible.
- G2 axe-core critical+serious violations (WCAG 2.x A/AA tags) and contrast failures.
- G3 Lighthouse accessibility and best-practices, plus performance: median of 5 runs, simulated throttling, fixed machine; LCP, CLS and page weight.
- G4 Copy fidelity: copy-deck strings present, no placeholder text or invented stats.

FOR PROSE (C1 copy if VOICE is in scope; paper 2's C3/C6a):
- Quality: expert pairwise as primary, with WQRM and a length-controlled cross-family LLM panel as secondaries.
- AI tells: Antislop-style over-representation rates against a human baseline corpus, a validated tagger for the 7 LAMP categories, and expert human detection.
- Diversity: compression ratio, self-repetition and homogenization (Shaib et al. 'diversity' package), embedding Vendi, and NoveltyBench-style distinct-k with a human-validated equivalence judge.

Every AI judge follows the same rules:
- frozen prompts and model snapshots
- both orders, with inconsistent orderings counted as ties
- several samples per item
- a self-preference audit and distractor-injection probes
- item-level validation against humans; ranking-level correlation alone does not count.

## Recommendations
### Overall measure architecture for Study 1 (C1 replication + leave-one-out ablations) [high]
Pre-register two human-anchored co-primaries: P1 = lay pairwise quality preference; P2 = human-validated within-task Vendi distinctiveness. Then a fixed list of secondaries (S1–S8), one pre-registered manipulation check per block, and non-inferiority guardrails (G1–G4) as in the summary. Use Holm correction across the two primaries and Benjamini-Hochberg across secondaries. Report effect sizes with bootstrap CIs clustered by task. Freeze measure definitions, model snapshots and tool commit hashes before the main run.
- Why: C1 makes two claims: pages look better, and they look less generic and more one-of-a-kind. One primary per claim keeps power manageable. Ablations differ subtly, and that is where AI judges are weakest. A 2025 benchmark found MLLM pairwise UI accuracy of 53–60% overall, near chance for similar UIs. So AI judges belong in secondary, PPI-augmented roles. JUDGE-BENCH (ACL 2025) concludes that LLM judges must be validated per task before use.
- Src: https://arxiv.org/html/2510.08783v1; https://arxiv.org/abs/2406.18403; https://arxiv.org/html/2404.12500

### P1 quality: how to collect and model human preference [high]
Use blind pairwise comparisons within a task (same brief and copy deck) on identical static renders: a scrollable full page at 1440 px wide, with the above-the-fold view shown first. Each pair gets ≥5 lay raters. Fit a Bradley-Terry / mixed-effects logistic model with task and rater random effects. Expert designers rate a random subset as secondary S1. Do not use Likert ratings for the headline.
- Why: Designers agree only modestly on UI quality (alpha = 0.37 in UIClip's BetterApp study), so each pair needs many raters and a model that absorbs rater variance. UI-Bench used expert pairwise comparisons with a TrueSkill-style model to get calibrated CIs. MLLM-as-a-Judge (ICML 2024) found pairwise judgment tracks humans better than scoring. A 2025 UI-judge study found Likert exact accuracy of only 35–38%.
- Src: https://arxiv.org/html/2404.12500; https://arxiv.org/abs/2508.20410; https://arxiv.org/abs/2402.04788; https://arxiv.org/html/2510.08783v1

### P2 distinctiveness: screenshot embeddings and Vendi Score [medium]
Compute Vendi Score (exp of the entropy of the similarity-matrix eigenvalues, i.e. the 'effective number of distinct items') over the k=4 candidates per task×condition, always at equal n. Primary kernel: DreamSim cosine similarity on above-the-fold renders with text masked. Masking draws grey boxes over DOM text nodes so copy doesn't drive similarity. Sensitivity kernels: DINOv2, CLIP/SigLIP, and a DOM-structure kernel (S6). Pre-register the kernel only after a pilot of about 150 human odd-one-out triplets shows it beats the alternatives. Also report a quality-weighted Vendi so 'diverse garbage' cannot win.
- Why: Vendi needs no reference set and works with any positive semidefinite kernel. On human perceptual 2AFC (NIGHTS), DreamSim agrees with humans 96.2% of the time vs DINO 90.1% and CLIP 83.1%, and it is sensitive to layout and color. But it was trained on natural images, not UIs, which is why the pilot gate is needed. An embedding-similarity diversity outcome has journal precedent: Doshi & Hauser, Science Advances 2024, found AI-assisted stories more similar to one another. Quality-weighted Vendi (ICML 2024) handles the quality/diversity trade-off.
- Src: https://arxiv.org/abs/2210.02410; https://arxiv.org/html/2306.09344; https://arxiv.org/abs/2304.07193; https://arxiv.org/abs/2405.02449; https://scale.stanford.edu/ai/repository/generative-ai-enhances-individual-creativity-reduces-collective-diversity-novel

### NoveltyBench-style distinctness and cross-task homogeneity [medium]
Add two secondaries. (a) distinct-k: a validated equivalence judge (human-calibrated LLM: 'same design concept, or only a palette/font swap?') partitions the 4 candidates into classes and we count them. (b) House-style homogeneity across tasks within a condition: mean DreamSim similarity between pages for different briefs, share of pages using the condition's modal font family, and the entropy of dominant hue clusters (CIELAB k-means).
- Why: NoveltyBench measures functional distinctness with a learned equivalence partition (distinct_k). It found frontier models less diverse than humans, and larger models in a family often less diverse than smaller ones. The 'Kiln ×4' complaint and the sameness Krebs reported are about convergence across briefs, which within-task Vendi misses. Padmakumar & He (ICLR 2024) showed feedback-tuned models homogenize content across authors.
- Src: https://arxiv.org/abs/2504.05228; https://arxiv.org/abs/2309.05196; https://adriankrebs.ch/blog/design-slop/

### Layout-structure similarity from the DOM [medium]
Extract a pruned DOM skeleton per page: landmark and section elements with their layout role, grid/flex column counts, and block bounding boxes from Playwright. Compute (i) the edit distance between typed section sequences (hero/features/social-proof/pricing/FAQ/CTA, labeled by a validated classifier); (ii) APTED tree edit distance on the skeletons; (iii) Design2Code-style block-match and position similarity between pairs. Use these both as a Vendi kernel and as descriptive outcomes.
- Why: This tests C1's success criterion: directions that are 'clearly different, not palette swaps.' Pixel and semantic embeddings mix palette with structure, while DOM features isolate structure. Design2Code (NAACL 2025) already defines block, text, position and color metrics for web pages. APTED is the standard MIT-licensed tree-edit-distance implementation.
- Src: https://arxiv.org/abs/2403.03163; https://github.com/DatabaseGroup/apted

### UI AI-tell detectors (Krebs, Impeccable, Hallmark) [medium]
Primary slop instrument: design-slop-cop at a pinned commit. It is deterministic (headless browser plus computed styles), MIT-licensed, and ships 165 labeled sites and an eval script. Secondary: Impeccable `detect --json` at a pinned version, reporting the AI-slop rules separately from the general-quality rules. Do NOT use Hallmark as a measurement instrument. Its 57 'slop-test gates' are generation-time skill instructions, and I could not verify a standalone deterministic detector. Split every slop count into rules that overlap the TELLS catalog and held-out rules. Add 'emergent tells' mined from recurrence in pilot outputs (e.g. second-generation defaults) as a pre-registered list. Re-validate precision on 100 of our own pages against human labels.
- Why: The detectors and C1's TELLS catalog share patterns (gradients, cards, typography), so TELLS lowers overlapping counts mechanically. Only held-out patterns show whether TELLS generalizes or just moves the mode to the next default. Krebs reports about 5–10% false positives from manual QA, and validation is not independent. Rule counts drift: the blog says 16 patterns, the repo README lists 14; Impeccable's README says 60 rules, its slop page 67 plus 6 design-review patterns. Pinning is mandatory.
- Src: https://github.com/AdrianKrebs/design-slop-cop; https://adriankrebs.ch/blog/design-slop/; https://github.com/pbakaus/impeccable; https://impeccable.style/slop; https://github.com/Nutlope/hallmark

### Specialized UI-quality critics and datasets (UIClip, UICrit, Design Arena, ArtifactsBench, OpenDesign) [medium]
UIClip: exploratory secondary only. Weights are on Hugging Face; use the webpairs+humanpairs variant and report its agreement on our human pairs. UICrit: use it to evaluate the CRITIC block's critiques (do the critic's named gaps match expert critiques?), not page quality; it covers mobile apps. Design Arena: external sanity anchor only. I found no research dataset or API, so at most compare base-model orderings. ArtifactsBench-style per-task checklists: use for interpretable diagnostics from the AI-judge panel, not the headline.
- Why: UIClip reached 75% vs GPT-4V's 51.6%, but on 2023-era models and data. It does worse on real apps (57.9%) and sees only static single screens. UICrit is 3,059 critiques on 983 mobile UIs from 7 designers, and gave a 55% gain in LLM feedback. ArtifactsBench's 94.4% figure is ranking consistency with WebDev Arena at the model level. OpenDesign reported 60–80% agreement with Design Arena. Ranking-level agreement doesn't show validity for individual pages, which is what ablations need.
- Src: https://arxiv.org/abs/2404.12500; https://huggingface.co/collections/biglab/uiclip-uist-2024; https://arxiv.org/abs/2407.08850; https://arxiv.org/abs/2507.04952; https://notes.designarena.ai/how-microsoft-research-asia-used-design-arena-to-validate-their-aesthetic-coding-benchmark/; https://arxiv.org/abs/2510.23272

### Held-out AI-judge panel design [high]
Build a panel of ≥3 judges from distinct families: OpenAI GPT-5.x, Google Gemini, and one open-weight VLM for reproducibility. Exclude the family of C1's critic and worker (Claude) from the headline panel. Run a Claude judge separately as a self-preference probe. Judges see the same renders as humans, with a prompt different from C1's critic prompt and no references used in the loop. Pairwise, both orders, temperature fixed, 3 samples per order; aggregate by majority, and count order-inconsistent outcomes as ties. Also collect a pointwise rubric score per page as a robustness check.
- Why: PoLL found a panel of smaller judges from disjoint families beat a single GPT-4 judge on human correlation and intra-model bias, at about 7× lower cost. MT-Bench documented position, verbosity and self-enhancement bias. Swapping positions flipped Vicuna-vs-ChatGPT outcomes on 66 of 80 queries until balanced-position calibration was applied. Self-preference rises linearly with self-recognition. C1's protocol already forbids the loop critic from being the success judge.
- Src: https://arxiv.org/abs/2404.18796; https://arxiv.org/abs/2306.05685; https://arxiv.org/abs/2305.17926; https://arxiv.org/abs/2404.13076

### Validating AI judges against humans so they can be secondary outcomes [high]
Collect a validation set drawn at random from the full pair pool, not hand-picked (needed for PPI): about 200 pairs × 5 lay raters, plus 100 pairs × 3 experts. For each judge and for the panel, report: item-level agreement vs the human leave-one-out majority; Krippendorff's alpha alongside the human-human ceiling; and the Alternative Annotator Test (leave-one-annotator-out; epsilon = 0.1 against crowd raters, 0.2 against experts; qualify only if winning rate ≥ 0.5) with its advantage probability. Never accept ranking-level correlation alone. Then use prediction-powered inference: judges label every pair, humans label a random subset, and PPI produces valid CIs for the ablation contrasts.
- Why: The alt-test needs ≥3 annotators and 50–100 items, and gives an interpretable 'as good as a random human annotator' probability. PPI guarantees valid confidence intervals whatever the predictor's quality, and the intervals narrow as the judge improves. That makes AI judges a power lever, not a bias risk, for the expensive ablation arms. JUDGE-BENCH shows agreement varies a lot by task and by whether the text is human- or model-generated.
- Src: https://arxiv.org/html/2501.10970; https://arxiv.org/abs/2301.09633; https://arxiv.org/abs/2406.18403

### Judge bias probes: position, distractors, length, self-preference [high]
Run four probes on every qualified judge and report them in the paper. (1) Position consistency: share of pairs whose outcome survives an order swap; proposed gate ≥80%. (2) Distractor injection: duplicate pages with only a slop feature added (purple gradient, stat banner, glassmorphism, headline badge) or with more content; a valid judge should not prefer them. (3) Self-preference: each judge's win rate for its own family's outputs vs the rest of the panel. (4) For prose, length: a GLM length-control adjustment as in length-controlled AlpacaEval, or length-matched pairs.
- Why: C1's generator was optimized against a VLM critic, so it may have learned features an evaluation judge would also reward. Tripathi et al. (COLM 2025) found pairwise judgments flip about 35% of the time under distractor features, vs 9% for absolute scores. That is why pointwise scoring is kept as a robustness check. Length control raised AlpacaEval's Spearman correlation with Chatbot Arena from 0.94 to 0.98 and reduced gaming.
- Src: https://arxiv.org/abs/2504.14716; https://arxiv.org/abs/2404.04475; https://arxiv.org/abs/2404.13076

### Render protocol (what humans and judges see) [high]
One Playwright renderer feeds every measure. Pin the Chromium version. Viewports 1440×900 (primary) and 390×844 (secondary), DPR 2. Wait for network idle and fonts.ready, disable or settle animations by forcing reduced motion and waiting a fixed time, cap full-page height, and strip any watermarks or condition metadata. Humans, AI judges, embeddings and detectors all use the same image files, cached with content hashes. Text-masked variants are derived from the same DOM pass.
- Why: Any difference in how pages are rendered across conditions confounds every outcome. Reinecke et al. showed even a 500 ms exposure carries strong aesthetic signal: complexity and colorfulness models plus demographics explain about half the variance in appeal. Rendering details therefore matter. AIM-style complexity metrics also need consistent captures.
- Src: https://www.eecs.harvard.edu/~kgajos/papers/2013/reinecke13predicting.shtml; https://people.kth.se/~weinkauf/publications/absoulasvirta18.html

### Block-level manipulation checks for the ablations [medium]
Pre-register one mechanism measure per block, separate from the outcomes:
- SEED: within-task Vendi and distinct-k.
- CRITIC: AI-panel quality, plus the critic's own score trajectory (process only).
- ASSET: raster-image area fraction and count of CSS-gradient/blob backgrounds.
- TELLS: catalog-overlap slop count.

State a directional prediction for each leave-one-out arm on P1 and P2.
- Why: Reviewers will ask whether an ablated block failed to work or worked without mattering. Mechanism checks separate those cases. They come from C1's own success criteria: 'fewer elements than the first build, and real imagery instead of CSS blobs' and '3–5 seeded directions … clearly different.'
- Src: https://arxiv.org/abs/2504.05228; https://github.com/AdrianKrebs/design-slop-cop

### Accessibility and functional guardrails [high]
Analyze guardrails as non-inferiority against Plain, with margins pre-registered after the pilot (proposed: ≤1 additional critical/serious axe violation per page; median LCP increase ≤1.0 s; CLS ≤0.1).
- G1 render integrity (binary): no uncaught errors, no failed asset requests, no horizontal overflow at 390 px, primary CTA visible above the fold, no text-box overlaps.
- G2 axe-core: count of critical+serious violations under wcag2a/wcag2aa/wcag21aa/wcag22aa tags, color-contrast reported separately.
- G3 Lighthouse: accessibility and best-practices scores, plus performance as the median of 5 runs with simulated throttling, one run at a time, on a fixed ≥2-core machine.
- G4 copy fidelity.

Keep failing pages in all analyses (intention-to-treat).
- Why: ASSET and RELAY add images and motion, the most likely route to heavier, slower pages. axe-core finds about 57% of WCAG issues automatically and aims for zero false positives, so it is a floor, not a certification. Lighthouse says the median of 5 runs is about twice as stable as 1 run, and simulated throttling reduces variance.
- Src: https://github.com/dequelabs/axe-core; https://developer.chrome.com/docs/lighthouse/performance/performance-scoring; https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md

### Prose quality measures (C1 copy if in scope; C3/C6a in paper 2) [medium]
Primary: expert writer pairwise judgments. Secondary: WQRM (released ModernBERT-based reward model), validated on our own expert pairs before use because its training data is literary paragraph edits. Also a cross-family LLM panel with length control. Treat LLM 'quality' scores of fiction as secondary only.
- Why: Chakrabarty et al. found most competitive baselines, including state-of-the-art LLMs, barely beat random on writing quality. WQRM reached 74% on the WQ benchmark, and experts preferred WQRM-selected text in 66% of cases (72.2% when the reward gap was over 1 point). A 2026 study found frontier-era MLLM aesthetic critiques 'mostly different' from human ones, and LLM judges ranged from 9% to 81% preference on identical pairs.
- Src: https://arxiv.org/abs/2504.07532; https://arxiv.org/abs/2606.29689

### Prose AI-tell and diversity measures [medium]
Tells:
- an Antislop-style over-representation profile: rate per 1,000 words of n-grams over-represented relative to a matched human corpus, with the profile built on held-out pilot text so the test isn't circular;
- an LLM span tagger for the 7 LAMP idiosyncrasy categories, validated against expert edits;
- the Shaib et al. slop dimensions;
- expert human 'AI or human?' detection as the gold standard (heavy ChatGPT users).

Commercial AI detectors are exploratory only.

Diversity:
- the Shaib et al. 'diversity' package (compression ratio, long-n-gram self-repetition, self-BLEU, BERTScore homogenization);
- embedding Vendi;
- NoveltyBench distinct-k;
- optionally the Creativity Index for linguistic novelty against web text.
- Why: Antislop finds some patterns over 1,000× more frequent in LLM text than in human text. LAMP (CHI 2025) gives a 7-category taxonomy from 1,057 professionally edited paragraphs. In Russell et al. (ACL 2025), a majority vote of 5 heavy-ChatGPT-user annotators misclassified 1 of 300 articles, beating most automatic detectors. Shaib et al. recommend those four diversity families because they correlate weakly with each other. The Creativity Index found professional authors 66.2% higher than LLMs.
- Src: https://arxiv.org/abs/2510.15061; https://arxiv.org/abs/2409.14509; https://arxiv.org/abs/2509.19163; https://arxiv.org/abs/2501.15654; https://arxiv.org/abs/2403.00553; https://arxiv.org/abs/2410.04265

### Copy confound control in Study 1 [medium]
Give every task a fixed, human-written copy deck that all conditions must use. Measure fidelity (G4: share of deck strings rendered verbatim, no placeholders, no invented statistics). Evaluate VOICE separately: in paper 2, or a later Study 1b where only copy varies.
- Why: C1 treats copy as placeholder until the human VOICE step, but raters and judges react strongly to copy. If copy differs by condition, P1 differences cannot be attributed to design blocks. A fixed deck also keeps text constant within a task, so DreamSim/Vendi diversity reflects design rather than wording. Design2Code's text-match metric is a ready template for the fidelity check.
- Src: https://arxiv.org/abs/2403.03163

## Options
### Rater pool for P1 (quality) -> Lay raters (Prolific) primary, experts secondary on a random subset
- Lay raters (Prolific) primary, experts secondary on a random subset: + Powered cheaply; matches end-user relevance; expert subset adds design-validity evidence; random subset allows PPI-style combination | - Lay taste may favour prototypical or simple layouts over distinctive ones; reviewers at design venues may want experts
- Expert designer panel primary: + Highest construct validity for a 'world-class designer' claim | - Expensive and slow; designer alpha around 0.37 still needs many raters per pair; small panels raise generalizability concerns
- AI-judge panel primary: + Cheapest, fastest, fully reproducible | - Near-chance on subtle UI differences in published tests; circular with C1's VLM critic; not acceptable to reputable venues as sole evidence
### P2 distinctiveness instrument -> DreamSim-Vendi on text-masked renders, gated by a human triplet pilot (fallback: human-rated distinctiveness)
- DreamSim-Vendi on text-masked renders, gated by a human triplet pilot (fallback: human-rated distinctiveness): + Cheap, continuous, set-level; best published perceptual-similarity agreement; pilot gate makes it defensible | - Not validated on UIs yet; needs pilot cost and pre-registered fallback
- DINOv2 or CLIP/SigLIP embedding Vendi: + Widely used, easy | - Lower human perceptual agreement than DreamSim on NIGHTS (DINO 90.1%, CLIP 83.1%); CLIP-type models read text, which inflates differences
- Human-rated distinctiveness only: + Direct construct validity | - Costly; set-level judgments of 4 pages are cognitively heavy; lower reliability
### Composition of the held-out AI-judge panel -> Cross-family panel excluding the critic's family (GPT-5.x + Gemini + one open-weight VLM); Claude run separately as a self-preference probe
- Cross-family panel excluding the critic's family (GPT-5.x + Gemini + one open-weight VLM); Claude run separately as a self-preference probe: + Avoids self-preference and loop circularity; the open-weight judge survives API deprecation; PoLL evidence favours diverse panels | - Open-weight VLM may be weaker; needs hosted inference (e.g. via OpenRouter)
- All frontier families including Claude: + Strongest individual judges | - Claude Fable is C1's critic, so the design rewards its own taste (Goodhart)
- Single strongest judge: + Simple, cheap | - Single-model bias; weakest methodological standing
### AI-judge format -> Pairwise in both orders as headline, plus pointwise rubric as robustness
- Pairwise in both orders as headline, plus pointwise rubric as robustness: + Pairwise aligns best with humans (MLLM-as-a-Judge); pointwise resists distractor features (Tripathi); disagreement between them is diagnostic | - About 2–3× judge calls
- Pairwise only: + Cheaper; matches human task | - 35% flip rate under distractor features
- Checklist/rubric (ArtifactsBench-style) only: + Interpretable diagnostics | - Rubric items may not capture holistic taste; checklists can become targets
### UI slop/tell instrument -> design-slop-cop primary + Impeccable detect secondary (slop subset), both pinned, with catalog-overlap vs held-out split and mined emergent tells
- design-slop-cop primary + Impeccable detect secondary (slop subset), both pinned, with catalog-overlap vs held-out split and mined emergent tells: + Deterministic, open licenses, slop-cop ships labelled data and an eval script; the split handles TELLS circularity | - Rule sets drift; 5–10% false-positive estimate is informal; must re-validate on our pages
- Hallmark slop-test gates: + Large rule set (57+ gates) | - Generation-time skill instructions, not a verified deterministic detector; unsuitable as a measurement instrument
- Custom LLM-based slop judge: + Flexible, can catch novel tells | - Adds another unvalidated judge; reproducibility issues
### Role of AI judges in the ablation (rung-2) contrasts -> PPI: judges label all pairs, humans label a random subset; PPI-augmented estimates reported as pre-registered secondary (or primary for ablations if the pilot shows strong judge-human correlation)
- PPI: judges label all pairs, humans label a random subset; PPI-augmented estimates reported as pre-registered secondary (or primary for ablations if the pilot shows strong judge-human correlation): + Valid CIs whatever the judge's quality; buys power cheaply; publishable rigor | - Requires random (not curated) human subset; gains are small if judges are near chance on subtle contrasts
- Humans rate all ablation pairs: + Simplest inference | - Most expensive arm of the study
- AI judges alone for ablations: + Cheapest | - Not valid evidence for a journal claim
### What raters and judges see -> Static renders: scrollable full page at 1440 px with above-the-fold first; 390 px mobile secondary; RELAY motion excluded from Study 1
- Static renders: scrollable full page at 1440 px with above-the-fold first; 390 px mobile secondary; RELAY motion excluded from Study 1: + Fully controlled and identical for humans, judges and metrics; cheap | - Misses motion and interaction value from ASSET video and RELAY
- Live pages in an iframe: + Ecological validity | - Uncontrolled timing, animation and network variance; judges can't consume it identically
- Static + short screen recordings: + Captures motion | - Video judging is less validated; adds cost and complexity
### Copy handling across conditions -> Fixed human-written copy deck per task + fidelity guardrail
- Fixed human-written copy deck per task + fidelity guardrail: + Removes the biggest confound; keeps embeddings focused on design | - Departs from the article's flow where copy is generated, then human-voiced
- Generated copy, rated as-is: + Ecological | - Copy differences confound design effects
- Generated copy + human VOICE in every condition: + Faithful to C1 | - Human writing time and variability enter every arm; hard to blind

## Risks
- Goodhart/circularity: C1's in-loop critic is a frontier VLM judge, so any similar evaluation judge partly re-scores the generator's own objective and inflates C1's apparent advantage. => Keep the critic family out of the headline panel. Use a different judge prompt and no references used in the loop. Run the self-preference audit and distractor probes. Keep human P1 as the primary.
- Detector/catalog overlap: TELLS uses a catalog that shares patterns with slop-cop and Impeccable, so slop counts fall mechanically. => Split every slop count into catalog-overlap and held-out patterns. Add emergent tells mined from pilot recurrence. If an Impeccable-skill baseline is added, demote Impeccable detect, because that skill optimizes against its own detector.
- Embedding diversity rewards broken or incoherent pages ('diverse garbage'), and CLIP-like models respond to text rather than design. => Compute diversity on text-masked renders. Report quality-weighted Vendi. Report diversity among pages that pass G1. Gate the kernel with a human triplet pilot.
- AI judges are near chance on subtle ablation contrasts (53–60% overall pairwise accuracy in a 2025 study; near 50% for similar UIs), so ablation effects go undetected or come out noisy. => Estimate judge-human agreement in the pilot and feed it into the power analysis. Use PPI so AI judges can only narrow CIs, never bias them. Fund human labels for the ablation arms where the pilot shows judges are weak.
- Low human agreement on design quality (designer alpha about 0.37) caps every validity coefficient and inflates the sample size needed. => Pairwise format, ≥5 raters per pair, rater random effects, attention and consistency checks. Report the human-human ceiling next to every judge metric.
- Instrument drift: rule counts already differ between sources (Krebs 16 vs repo 14; Impeccable 60 vs 67). Model APIs and VLM judges get deprecated. => Pin commit hashes, package versions and model snapshot IDs. Archive every render, raw judge output and detector JSON with content hashes. Include one open-weight judge, and publish the frozen harness.
- Validation-set leakage: tuning judge prompts or thresholds on the same human labels used to report judge validity. => Split human labels into a calibration set (prompt and threshold tuning) and a sealed validation set used once, after pre-registration.
- Lighthouse performance variance makes guardrail failures look like noise, or the reverse. => Median of 5 runs, simulated throttling, one run at a time on dedicated hardware. Analyze as non-inferiority with pre-set margins.
- WQRM and LLM prose judges are out of domain for marketing copy (WQRM was trained on literary paragraph edits; ModernBERT has a limited context length). => Validate on our own expert-labeled pairs before use, keep them secondary, and score at paragraph level.
- Static screenshots can't measure motion, interaction or video (ASSET video, RELAY), so they understate or misrepresent those blocks. => Exclude RELAY from Study 1, or evaluate it in a separate sub-study with recorded clips and a dedicated human task.

## Questions
- Is Study 1's headline claim 'C1 pages are better' (quality), 'C1 pages are less generic' (distinctiveness), or both? Two co-primaries cost power, roughly doubling the human-rating budget for the same detectable effect.
- For P1, who defines 'good design': general consumers (Prolific lay raters, cheaper, user-relevant) or professional designers (higher validity, more expensive)? Do you have budget or access for a 5–8 person expert panel on a subset?
- Are you OK excluding Claude-family models from the headline AI-judge panel, given C1's critic is Claude Fable? Claude would still run as a separate self-preference probe.
- Should Study 1 use a fixed human-written copy deck per task, which removes copy as a confound but departs from the article's flow? VOICE would then be studied separately.
- Should RELAY (video and scroll effects) and the human pick step be out of Study 1? Static-render measures can't evaluate motion, and a human pick adds an unblinded human choice to the treatment.
- Will you add a practitioner baseline such as 'plain prompt + Impeccable or Hallmark skill'? Reviewers will likely ask for it, and it changes which slop detector can be used without bias.
- Which venue family is the target (e.g. CHI/UIST vs ACL/EMNLP vs NeurIPS Datasets & Benchmarks vs a journal like TOCHI/IJHCS)? It shifts the weight between human-centred measures and benchmark-style automated measures.
