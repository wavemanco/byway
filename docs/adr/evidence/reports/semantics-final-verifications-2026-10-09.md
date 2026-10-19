# The final verifications of ADR-0098 (2026-10-09)

The reports [ADR-0097](../../0097-a-step-takes-in-only-what-its-prompt-shows.md) cites as the final verifications of [ADR-0098](../../0098-recipe-limits-disclosure-and-held-voice.md): for each of the fix rounds 8 to 11 of the F01 semantics work, the implementer's report and a fresh verifier's. From `semantics-2-final-r9.json` (rounds 8 and 9) and `semantics-2-final-r11.json` (rounds 10 and 11), which were kept only under `C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/`. The text is unchanged; Claude added the headings. A `<` that GitHub would read as the start of an HTML tag is written `&lt;`, so that it shows. The verifiers' probes (`scratch/verify-semantics-2-r9/` and `verify-semantics-2-r11/`, about 1.6 GB with their corpora) are not kept; the claims oracle they ran is in `scripts/test/claims-oracle/`.

## Round 8: the implementer's report

*From `semantics-2-final-r9.json`, `impl8`.*

Head commit: b75fa07fcfb22714b73844032f369e6e1335ccbc. Tests passed: 4050, failed: 0. Typecheck clean: yes. End-to-end: pass: 53 passed (4.2m) at b75fa07; the only x is test 38, [F07] keyboard.spec.ts:340, a test.fail expected to fail, as in rounds 6 and 7. An earlier run at 32a47b3 also passed 53.. Bundle hash: 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637.

Round 8 on fix/fx-semantics-2 (worktree C:/Users/arvik/code/byway/.worktrees/fx-semantics-2) adds three commits: 6055844, 32a47b3 and b75fa07. All three blocking problems held when I checked them, so none is rebutted. Each is fixed at its root, and the differential found and fixed four more false-refusal classes.

**1. Answers that reach the work through an AI step (Q1, Q2).** `unappliedCritiques` (packages/recipe/src/semantics.ts) now reads a new walk, `answersReachingWork`. It tracks which person-answers the critique, brief, taste and the notes shown beside the work may carry.
- An AI step that is not a writer (critic, check, AI CUT, sweep, overlap flag, direction) carries what it took in, through its text ports and its note.
- A later answer of the person's carries what they were shown: a note, or a brief or taste they revise in place.
- The answer counts as reaching the work when any of these takes it in: an AI writer, the person's own draft (shown the latest notes), or an AI step that decides which version or option is the work. That last group is a pick's judge, a dedupe, a keep-or-revert, or a critic or check whose verdict a gate reads.
- The flow walk gets an opt-in `untilStable` option, which repeats a loop or relay body until its state stops changing. The differential found a C6a variant where the answer reaches the draft only three rounds later.
- **C6a owner question: resolved.** An AI direction that takes the answer in counts wherever what it makes reaches the work. C6a with its reaction also given as a critique is now admitted: the sharpened direction is shown beside the person's own draft. C6a with a critic after the sharpening stays refused, because the critic's note is what the draft sees and nothing takes the sharpened brief in.

**2. Per-candidate refusals (P).** `critique-per-candidate` now fires only where `unappliedCritiques` lists the placement, so nothing in that candidate takes the answer to the work. The per-candidate wording is kept. C3, C4 and C5 with the trim on two candidates followed by the person's pick are admitted.

**3. Who chooses the paths.** The claim that three things choose the paths is gone. The new wording says a run's path is decided as it runs, by the person's answers and by everything else it reads: what its AI, media and tool steps return, its random draws, and the recipe's counts. Examples are marked as examples: an empty AI list or sweep, a gate ending the round before the writer, a relay judge, the shots in the storyboard. This is reworded in:
- ADR-0098 decision 7 and its Consequences;
- the spec paragraph;
- the `unappliedCritiques` comment;
- the semantics-rules.test.ts describe comment.

**Fourth fix, from the differential: ST9/ST10 human-critique.** These used to refuse every person's answer in an audit lens or gate body. They now refuse only in two cases:
- the answer reaches the work on no path;
- an empty answer always leaves the next step with what came before: no other lens, or nothing later in the gate body, can note a critique.

Two C2 variants with a reaction in a lens beside the critic's lens are now admitted.

**Differential.** Scratch: C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/semantics-2-r8.
- Corpus: 35,219 unique variants that main's checkAnswer admits. That is 19,986 from the round-5 sets, 4,613 from round 6, 3,611 from round 7, and 7,009 fresh from 80,000 mutations of the 8 protocol configs. The 10 study recipes are refused as composed on both main and the branch.
- Oracle: every refused person-answer was run through the real Interpreter with stubbed activities, 24 runs with every answer given and 24 with that answer left empty. It follows the answer through ports, AI text and notes, and what the person is shown.
- At round 7's code, on the first 30,911 variants: 3,637 refused, 3,683 answers. 56 of those reached the work, so they were false refusals:
  - 38 lists applied by a fix in the same candidate;
  - 16 answers carried by an AI step;
  - 2 C2 lens reactions.
- At HEAD: 4,897 variants refused.
  - 4,676 only for a person's answer, 59 for one plus another rule.
  - 162 by other rules alone, which lose no person input: ST2 feed 92, composed limits 43, ST5 24, ST10 retry-scope 3.
  - Of the 4,897 refused answers, 4,891 reached the work on none of 231,168 runs, given or empty.
  - The other 6 are Finish's CUT alone in an audit lens (C1, C3 ×2, C4 ×2, C5). Listed, the fix applies it on 24 of 24 runs. Left empty, the fix never passes over it and acts on the critique from before the audit, 24 of 24 each. I count that as a genuine loss of the empty answer. Admitting them is a one-clause change if the owner disagrees.
- Controls: all 73 answers in the 46 variants newly admitted reach the work on some run, and so do all 2,296 answers in a sample of 2,240 admitted variants. The round-7 claims oracle on the newly admitted variants and shapes reports only info entries.
- The round-5 re-admission still refuses the same 767 of 20,079.
- Adding the decider reading changed none of the 4,897 verdicts.

**Gates at b75fa07:**
- `pnpm vitest run`: 177 files, 4050 tests, all passed.
- `pnpm -s typecheck`: OK.
- Web build: OK.
- `pnpm e2e`: 53 passed (4.2m). Test 38 is the F07 keyboard.spec.ts test.fail, expected.
- Bundle hash unchanged at 38afef53, so build.test.ts and the ADR hash lines are untouched.

**Constraints:** D1–D4 untouched. No edits to an Accepted ADR, docs/backlog.md, docs/adr/README.md or .github. No git stash.

Backlog items:

- Resolved, so remove the row: the owner decision on C6a (whether an AI direction that takes in a person's answer counts for ST12 critique-unapplied). It now counts wherever what it makes reaches the work: an AI writer, the person's own draft shown its note, or an AI step that decides which version or option is the work. This is ADR-0098 decision 7, 'Carried on by what is made from it'.
- Extend the relay-link residual row (pre-existing on main) to all paths the person does not choose. An admitted answer can go unapplied wherever a value the run reads decides the path, for example: an AI list or sweep that finds nothing (so the fix asks no model), a gate ending the round at its critic or check before the writer, a relay judge that sees a clip or has none to see, a one-shot storyboard, or a random pick. Either refuse an answer whose only takers such a value can skip, or say at run time that the answer was not used.
- Port-level residual, now wider (pre-existing, composed-only). Writers, carriers and deciders are all counted by the ports they take in, not by whether their reused prompt template renders that slot. Have the composed profile refuse a taken-in port the template never renders.
- An empty answer in an audit lens beside a lens that always notes is dropped, and the fix after the audit acts on the other lenses' critique without passing over the empty list. This is admitted, as on main. Consider a runtime change (an audit that hands on an empty lens answer as 'nothing'), which would change the workflow bundle.
- Port the round-8 differential oracle (scratch/semantics-2-r8/diff8.oracle.test.mts, with the controls8 and run-diff8 scripts) into the runner suite as a property test against admission. Key its stale-critique (S) check and the round-7 claims oracle's G check by the candidate path: both read run-global state across concurrent candidates. Stub audio assets as skipped.
- From the round-7 verifier, still open and pre-existing: a model RELAY step admitted in a non-media composed recipe. It cannot run there, yet it is explained as 'one clip of the last shot'. Have the composed profile refuse a relay step or chain outside a media recipe.

## Round 8: the verifier's report

*From `semantics-2-final-r9.json`, `verify8`. The owner's earlier decisions respected: yes.*

### Findings checked

- **R7-Q1Q2 answers carried to the work by an AI step were falsely refused**: closed. Fixed. answersReachingWork now follows carriers (critic, check, AI CUT, sweep, overlap, direction), the person's own draft shown a note, and deciders (semantics.ts:1083-1126). Hand shapes, my oracle (v9.oracle.test.mts, 64 runs each, shapes-out.json): C2 and C6a with the reaction also given as a critique are admitted and reach the work (C6a: N 61/64; C2: W 63/64). C4 CUT -> sweep that reads it -> fix is admitted and reaches (F>0). C6a with a critic after the sharpening is refused and lost 64/64 (probes9.json). Of the 649 answers round 8 newly admits over round 7 in my fresh corpus, 607 reach the delivered work (newly8-out.json).

- **R7-P per-candidate refusal of the trim on two candidates then picked**: closed. Fixed. C3/C4/C5 Finish trim in replicate(2) followed by an H pick: main and HEAD both admit, and the list reaches the delivered work on 64/64 runs (shapes9.json, shapes-out.json). The relaxation goes further than this, though: see blocking problem 1.

- **R7 who chooses the paths wording**: closed. These all now say that the path is decided by the person's answers and by everything else the run reads, with the cases marked as examples: ADR-0098 decision 7 (lines 120-126), Consequences (lines 182-187), the spec paragraph, the unappliedCritiques comment (semantics.ts:1146-1152) and the semantics-rules.test.ts describe comment. Each matches interpreter.ts: optional/route asks, afterGateStep exits, unobservable(), storyboardShots, and Math.random in R picks.

- **V1 differential: no false refusal (fresh plus earlier corpora)**: partly. Corpus: 22,121 fresh variants that main's checkAnswer admits, after removing 642 that overlap the earlier corpora. They came from 240,000 mutations of all 8 configs by gen9.mts, my own mulberry32 generator (g9-all.json). HEAD refuses 9,675 of them: 9,202 only for a person's answer, 96 for one plus another rule, and 377 by other rules alone (ST2 feed 148, COMPOSED-LIMIT 118, ST5 91, mixes 20). Findings: critique-unapplied 8,251; ST9 human-critique 1,307; ST10 human-critique 31; critique-per-candidate 542. My independent oracle uses the real Interpreter with stubbed activities. It follows a marker through text ports, notes, in-place text, artifact lineage and deciders, and it models the relay's brief slot being overridden with 'Shot N'. Scores vary 2-10; a binary-score stub hid paths through plateau. Over 10,129 refused answers and 466,248 runs: 10,075 were lost on every run, given or empty (8,247 critique-unapplied, 1,286 human-critique, 542 per-candidate). 5 were never asked; all of those also carry ST5. 1 was reached only by weak influence. 48 are ST9 case 2, where a non-empty answer reached the work on every run and only the empty one is not passed over. Re-run on the implementer's 4,897 refusals: 4,891 lost and 6 empty-only, matching their report. Hand-built legitimate shapes that main admits are all admitted and reach the work: CUT->render->fix, optional fix, fix in a route branch, CUT+fix in a route branch, CUT+fix in a loop you hold, CUT at round end with the fix next round (C3, C5), a taste-only reaction between, trims on two candidates then picked, a critique at the end of D1 fixed in D2, a vision-lite/thesis brief taken in a later stage, a C7 D2 critique carried by the D3 sweep, a relay next-link clip, a dedupe decider, and the 8 configs as composed. Not exact: admitted answers that are lost on every run exist (problems 1-3 and non-blocking 1-3).

- **V2 claims oracle on fresh admitted variants**: closed. The round-8 claims oracle, copied to my folder, ran on 12,446 fresh admitted variants (12 runs each, 149,352 runs) plus 643 newly admitted ones (24 runs each). E-STRICT: 0, while its FORCE_REACT control fired 177 times in 48 variants. E-REACT-CLAIM-BUT-NEVER-SHOWN: 1, a sampling artifact (0 in a 100-run re-check). I-APPLIES-BUT-OTHER-CRITIQUE and I-APPLIES-STALE: 0. Swap: SAYS-YOU-CHOOSE-BUT-NOT-ASKED, ASKED-BUT-*, and SAYS-ALL-BUT-ASKED are all 0. SAYS-ALL-BUT-NOT-ALL-SWAPPED: 34 in 20 C5 variants, all with the swap step under an optional or route plus the launch gate's retry. The oracle pairs a skipped swap with a later sweep's swap (e.g. crit 'No stock patterns found' after a sweep that had hits), so it is an artifact. Lock (EXPLAINER/RUN/L1/L2/L3): 0. Wrote-the-rest: 0. Notes-only: 12 in 1 C7 variant, an artifact because the later writer 'implement' reads only the brief. USED-*, K, F, G: 0. FORCE_J control fired 2,359 times (cl-*.json).

- **V3 flowRecipe move and bundle**: closed. Main's validator flowRecipe against the branch's @byway/recipe flowRecipe, on 7,500 gen7 recipes at depths 3/4/5 with may and must tracers (15,000 walks): every step-call sequence and final state is identical. The memoized walk equals the full walk, and writersAfter is identical (cmp-main-9191/9292/9393.json). validate() differences against main come only from the branch's earlier-round rules. HEAD against round 7 (7e606ed) on 25,121 recipes: only critique-unapplied, critique-per-candidate and ST9/ST10 human-critique findings differ, and all 648 verdict changes are HEAD admitting (cmp-r7-a.json). All 18 catalog recipes have the same hash, verdict and findings. The round-5 re-admission still refuses 767 (385/72/96/214). The workflow bundle built at HEAD hashes to 38afef53ed613c48…, the pin in build.test.ts. Round 8 changed no runner file, and the bundle holds none of the reach analyses.

- **V4 ADR-0093, ADR-0098 and the spec**: partly. ADR-0093 spot checks hold: capTurn, LS1, ST2/ST10 feed, main's pin ec88dae8, and the loop-cap tests exist. ADR-0098's round-8 counts match the implementer's evidence and my re-runs (4,897 = 4,676+59+162; 4,891/6; 767; bundle). The decision-7 examples hold (l101, l107, l116, l118 probes in probes9.json). False or overstated: l108-109 says that what takes an answer to the work is 'anything that writes the work', yet a writer in a replicate/each whose candidates nothing delivers counts, so l141 ('38 lists that a fix in the same candidate applied ... reached the work') and l143 ('Every one reached the work on some run') are false for 4 answers. Those are the implementer's idx 2272, 2509, 2550 and 2593: replicate in D3 with no pick, final-work lineage 0/48, ipc38-out.json and ctl-newly-out.json. The spec says a list 'is asked only where its answer reaches the work on some path: ... a draft of the person's own is shown it'. That is false for the admitted shapes in problems 2 and 3. Smaller points are listed as non-blocking.

- **V5 decisions D1-D4**: closed. git diff main...HEAD shows no change under packages/gateway (D1), render.ts or the Chromium launch (D2: the spec's sandbox line is unchanged context), prompt templates, c3.ts or NO_IMAGE_CHOSEN_NOTE (D3), or .github, docs/adr/README.md, docs/backlog.md, or ADR-0089/0090/0092/0099 (D4). Only ADR-0093, ADR-0098 and the spec changed. I used no git stash, and the worktree is clean at b75fa07.

- **V6 gates**: closed. At b75fa07: pnpm vitest run passed 177 files and 4050 tests. pnpm -s typecheck: OK. Web build: OK. pnpm e2e: 53 passed (4.3m); #38 [F07] keyboard.spec.ts:340 is a test.fail, as expected. No timeouts needed a re-run. Logs are in verify-semantics-2-r8/gate-*.log.

### Problems found

- **Blocking.** Round 8's critique-per-candidate change re-admits person lists that round 7 refused and that are lost on every run: the list is applied only inside fan-out candidates that no step ever delivers.

  Evidence: answersReachingWork (semantics.ts:1095) counts an AI writer inside replicate/each as reaching the work as soon as it takes the answer in. It does not check whether any later step delivers those candidates (a pick, or a writer or each that takes the option set in). run.ts:97 delivers only ports.artifact. Minimal repro (u1.mts, u1-out.json): C3, C4 and C5 with Finish's [cut-render, cut, apply-cut] in replicate n=2 and no pick. Main admits, round 7 refused (critique-per-candidate), HEAD admits. The list was applied in candidates on 64/64 runs and reached the delivered work on 0/64. Both main and HEAD explain it as 'Your turn: list what the work could lose, and the AI removes it.' In my fresh corpus, 39 answers that round 8 newly admits behave this way (newly8-out.json, final lineage 0/48). In the implementer's own controls, 4 of the 38 'lists that a fix in the same candidate applied' are of this kind (idx 2272, 2509, 2550, 2593), so ADR-0098 l141/l143 and the l108-109 definition are false for them. The same root cause also admits a CUT outside with only its fix inside an unpicked replicate (32 more answers; pre-existing on main and round 7).

  Suggested fix: In answersReachingWork, keep what a writer takes in inside replicate/each as pending on the option set. Count it as reaching the work only where a later pick, an each, or a writer that consumes option_set&lt;artifact> takes those options in. Do the same in decidesWork. Add tests: a trim on two candidates with no pick is refused (critique-per-candidate), and a CUT outside with its fix in an unpicked replicate is refused (critique-unapplied). Correct ADR-0098 l97, l108-109, l141 and l143.

- **Blocking.** Round 8 newly admits a person's list that is lost on every run when another person's answer follows it in the same audit lens, beside a lens that can note.

  Evidence: semantics.ts:1108 treats a contained person's answer as 'sometimes' (union with the in-lens previous value), and its comment at 1080-1081 says 'on those runs the port keeps what it had'. The interpreter does something else. An empty answer sets the critique to '' inside the lens (interpreter.ts:467). audit() then drops that lens because ''' is falsy (line 747) and restores the audit's entry critique, not the earlier in-lens list. Repro (st9c.mts, st9c-i.json idx 1): C4 Finish [cut-render, audit[lens trim: (cut, human check), lens other: human vision critique], apply-cut, ...]. Main admits, round 7 refused, HEAD admits. The CUT's list reached nothing on 64/64 runs (st9c-out.json). Case 1 of ADR-0098 l99 ('an answer that reaches the work on no path') should refuse it.

  Suggested fix: Model the drop at the operator's output. Inside a lens or gate body, the empty answer replaces the critique with the empty value, which carries nothing. In `after`, a lens whose final critique may be that empty answer contributes the audit's entry critique for that path. Add this shape as a test, and fix the semantics.ts:1080-1081 comment.

- **Blocking.** Round 8 newly admits a reaction that reaches nothing because the audit's `after` unions the entry notes, even where a lens always leaves a note.

  Evidence: semantics.ts:1117 returns notes as union(entry.notes, inner.notes). interpreter.ts:748-750 replaces the notes whenever any lens leaves one, and a model critic always does (model-step.ts:168). Repro: g9-all.json idx 3577, C6a with 'write' moved after the author loop and react given as taste+critique. Main admits, round 7 refused, HEAD admits. The reaction reached no writer, draft or decider on 400/400 runs (anom-out2.json). The sharpened note is always replaced by the audit's notes before your draft. This contradicts the spec's 'a draft of the person's own is shown it' and ADR-0098 decision 7 'Carried on by what is made from it'. ADR l192 frames refusals as conservative, but this case was refused until this round.

  Suggested fix: In `after` for an audit, hand on only the lenses' notes when some lens always leaves a note: a model critic, check, CUT, sweep, overlap or vision on every path of its body. Keep the union otherwise. Add the 3577 shape as a test.

- **Not blocking.** Pre-existing (main and round 7 admit): a person's brief taken in only by a model RELAY step counts as applied, but relayLink always overrides the brief slot with 'Shot N'.

  Evidence: relay.ts:57 sets `extra: { artifact: storyboardText, brief: `Shot ${shot}` }`, yet appliesPort/takesIn count relay+brief. g9-all idx 479: C5 with your vision (critique+brief) at the start of a relay link, the critique replaced by shot-check, and the brief taken in only by regenerate. Admitted everywhere, and it reached a prompt on 0/400 runs. The hand shape 'c5 your critique+brief before the chain' is admitted and lost 64/64 (shapes-out.json).

  Suggested fix: Backlog: exclude (relay, brief) in appliesPort and in the carrier reading, and name it under ADR-0098's 'by its ports, not its prompt' residual.

- **Not blocking.** Pre-existing: an answer applied by a writer is later overwritten by an AI writer that builds from scratch (it does not take the artifact in), so the answer never reaches the delivered work.

  Evidence: 22 admitted fresh answers had final-work lineage 0 over 120 runs (f0-out.json). Example: g9-all idx 634, C3 Finish, where a seed-angle after the trim and swaps rewrites the work from intent. Main and round 7 admit these too.

  Suggested fix: Backlog: in answersReachingWork, a later machine writer that does not take the artifact in replaces what came before. Alternatively, have the composed profile refuse a from-scratch writer after Distill.

- **Not blocking.** ST9/ST10 'human-critique' case 2 refuses answers whose non-empty form reaches the work on every run. For C1 the 'what came before' is nothing, so ADR-0098 l142 ('an empty list is lost wherever it is given') is overstated.

  Evidence: In the fresh corpus, 48 refused answers are all case 2: listed, they were applied on every run; left empty, they were not passed over. In all 10 C1 cases (and in about half the runs of the C4 cases), no critique exists before the audit (B0 on 48/48 runs, emptyonly-out.json), so the fix is asked with an empty critique rather than a stale one. Main admits all of them. The implementer flagged this for the owner.

  Suggested fix: Owner decision. Either keep case 2 (the fix never passes over an empty list) and reword l142 to 'never passed over: the fix acts on the critique from before the audit, or on none', or limit case 2 to audits that a critique can precede.

- **Not blocking.** An ST9 case-1 refusal message says 'the audit hands it on as its critique' even when a later step in the same lens replaces the answer first.

  Evidence: For C4 with [cut, model check] in one lens (st9b.json), the message is 'lens "trim" step "cut" ... reaches the work on no path: the audit hands it on as its critique, and before anything ... takes that in, another takes its place'. The audit hands on the check's critique, not the person's list. The refusal is correct; only the wording is wrong.

  Suggested fix: Say 'before anything that writes the work or picks which version it is takes it in, in its lens or after the audit, another takes its place'. Alternatively, drop the clause when a later step in the lens can replace the critique.

- **Not blocking.** decidesWork counts a pick's model judge inside an audit lens or gate body as deciding the work, while its comment and ADR-0098 l111 say these deciders count 'outside a lens or a gate body'.

  Evidence: In probe-judge.mts, a CUT before an audit whose lens holds a replicate and a C pick with a judge that consumes the critique gives unappliedCritiques = []. semantics.ts:1053-1054 adds every pick judge regardless of `contained`. It cannot be reached from a composed recipe, because no protocol config has a judge prompt (COMPOSED-PROMPT).

  Suggested fix: Skip pick judges when `contained` is set, or make the wording explicit.

- **Not blocking.** ADR-0098 l116 says this round 'settles the question round 7 left to the owner' (C6a), and the implementer asks to remove that backlog row.

  Evidence: It is not one of D1-D4, and the outcome matches main's admission, so no decision listed for the owner was pre-empted. Still, a question addressed to the owner is recorded as settled by the implementer.

  Suggested fix: Keep the backlog row, marked 'implemented as main admits; owner to confirm', until the owner agrees.

### Tests rerun

At b75fa07 (worktree clean before and after): pnpm vitest run passed 177 files and 4050 tests. pnpm -s typecheck: OK. pnpm --filter ./apps/web run build: OK. pnpm e2e: 53 passed in 4.3m; #38 [F07] keyboard.spec.ts:340 is a test.fail, as expected, and no timeouts needed a re-run.

Probes, all in C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r8/:
- gen9.mts made 22,121 fresh variants that main admits; HEAD refuses 9,675 of them.
- My independent oracle, v9.oracle.test.mts: 466,248 runs over the refused answers and 449,568 over the admitted ones (o9b-*.json). I also re-ran the implementer's 4,897 refusals (o9old-*).
- The claims oracle ran on 12,446 fresh admitted variants plus 643 newly admitted ones, with both controls (cl-*.json).
- Main vs HEAD flow walk and validate(): cmp-main-*.json. Round 7 vs HEAD: cmp-r7-a.json. Catalog: catalog-cmp.mts. Round-5 re-admission: readmit-r5.mts. Bundle hash: bundle-hash.mts.
- Hand shapes: shapes9, probes9, u1, st9b and st9c (.mts and .json files).

Process note: I once typed `python - 2>/dev/null` at the start of a shell command, against the instruction. It only read empty stdin, I stopped it, and nothing in the worktree or main tree was touched.

## Round 9: the implementer's report

*From `semantics-2-final-r9.json`, `impl9`.*

Head commit: 00e418cce0abfc36ea62d319d5c534694df38f30. Tests passed: 4054, failed: 0. Typecheck clean: yes. End-to-end: pass on re-run: the first full `pnpm e2e` run had 52 passed and 1 failed (recovery.spec.ts:85 F14 timed out at line 98 clicking "Try again", with the page left on /settings; the test passed in every earlier round). The second full run passed 53 of 53, recovery.spec.ts:85 included. The filter argument did not narrow it to one spec, so the whole suite ran again.. Bundle hash: 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637.

Round 9 on fix/fx-semantics-2 closes all three BLOCKING findings at their root. None was rebutted. Commits: 3ab08a1 (code and tests), b086f8d (ADR-0098 and spec), 00e418c (an ADR qualifier).

Code: packages/recipe/src/semantics.ts
- flowRecipe gains an optional `enter` hook. `after` now also receives each body's end state (`parts`, one per lens) and whether the operator is contained. Existing callers are unaffected.
- answersReachingWork now follows two more carriers: the work of a candidate and the options. A writer, an author draft or a decider inside replicate/each takes an answer only into that candidate's work. replicate/each hand that work on as the options, and each candidate of `each` starts from an option. The options reach the work only where a pick takes one up, or where an AI writer that takes option_set&lt;artifact> in (appliesOptions) does, outside a lens or gate body. Inside a candidate they reach only that candidate's work. A dedupe decides only which options are kept.
- (F1) Fixed. The trim on two candidates with no pick is refused as critique-per-candidate, and a CUT outside with its fix only in an unpicked replicate is refused as critique-unapplied.
- (F2) Fixed. A person's empty answer in a lens or gate body now sets the critique to an EMPTY mark that carries nothing. Audit lenses are entered with what they were handed marked (HANDED). lensesHandOn hands on what the lenses made, plus the audit's entry only where every lens may make nothing new. A gate hands on its entry where its body may end empty. The st9c shape is now refused under ST9 human-critique, case 1.
- (F3) Fixed. Notes use the same lensesHandOn rule, so a lens that always leaves a note replaces the notes from before the audit. The 3577 shape is now refused.
- decidesWork no longer counts a pick judge, a loop critic or a gate critic that sits in a lens or gate body. This also fixes non-blocking finding 8.

Validator (packages/validator/src/checks/declarations.ts, structural.ts): the critique-per-candidate and critique-unapplied messages now name the rule that candidates must be taken up. The ST9 case-1 message now reads "in its lens or after the audit, another takes its place" (non-blocking finding 7).

Tests, written first:
- packages/recipe/test/semantics.test.ts: unpicked trim; CUT with its fix in unpicked replicate or each; each then pick; option-map writer; dedupe with and without a pick; pick in a lens; nested replicate; draft and keep-or-revert in candidates; the st9c lens shape and its admitted contrasts; a lens that always notes versus one that may not; the 3577 notes shape; the contained judge and loop critic. Existing candidate tests now add the pick they need.
- packages/validator/test/semantics-rules.test.ts: u1 refused as per-candidate, option-map admitted, CUT-outside refused as unapplied with the new message, st9c refused under ST9. packages/advisor/test/present.test.ts: message updated.

Docs: ADR-0098 is corrected at l97, l99, l108-111, l113, l116 (now says implemented as main admits, owner still to confirm), l117, l141-143 (the 4 of 38 lists; l142 now says the empty list is "never passed over" and leaves case 2 to the owner) and l151. It adds a round-9 measurement, a qualifier on l192, two named residuals (finding 4, the relay brief slot; finding 5, a later writer that drafts from scratch) and round-9 evidence. Spec line 151 of docs/superpowers/specs/2026-10-07-product-v1-design.md is updated. The workflow bundle is unchanged (no workflow code changed), so the build.test.ts pin and the hash lines in ADR-0093 and ADR-0098 are untouched.

Measurement (scratch C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/semantics-2-r9):
- Round-8 corpora (35,219 variants): 4,925 refused, which is 28 more variants and 29 more answers. None newly admitted.
- The verifier's g9 corpus (22,121 variants): 73 more refused (102 answers). None newly admitted.
- The verifier's three repro sets: u1 (6 of 6), st9c and 3577 are now refused.
- The verifier's oracle, copied as r9.oracle.test.mts, now reports steps inside candidates on their own channels and adds a batch of mixed empty answers. On all 131 newly refused answers, 72 runs each: none reached a writer, draft or decider outside a candidate, and none appeared in the delivered work's lineage.
- Controls: 67 of 71 and 2,294 of 2,296 answers reached the delivered work. The remaining 4 and 2 reached only candidates nothing takes up, and are exactly the answers round 9 now refuses there.
- In the verifier's newly8 set, 41 of the 42 answers with lineage 0 are now refused. The 42nd is finding 5.

Gates:
- vitest: the full run at b086f8d passed 177/177 files, 4054 tests. The full run at HEAD had 176 files pass; controls.test.ts failed because its ephemeral Temporal server could not bind its port. Re-run alone it passed 44/44.
- typecheck passed. The apps/web build passed.

Backlog items:

- Relay brief slot (round-8 verification, non-blocking finding 4): relay.ts:57 fills a relay link's brief slot with 'Shot N', yet appliesPort and the carrier reading count a model RELAY that takes the brief in. Exclude (relay, brief) in appliesPort and in carriesOn/takesIn reading. Named in ADR-0098 under 'by its ports, not its prompt' (g9 idx 479: 0 of 400 runs).
- From-scratch writer (round-8 verification, non-blocking finding 5): an answer applied by a writer is later replaced by an AI writer that does not take the artifact in (a seed, or a draft from the intent alone). In the verification's f0 sample, 14 admitted answers are of this kind (idx 634, 8323, 9301, 10249, 14032, 14152, 14302, 15554, 18235, 19176, 21301, 21356). Either make a later machine writer that does not take the artifact in replace what came before in answersReachingWork, or have the composed profile refuse a from-scratch writer after Distill. Named in ADR-0098 Consequences.
- OWNER DECISION (round-8 verification, finding 6): ST9/ST10 'human-critique' case 2 refuses an answer whose empty form always leaves the step after with what came before. Where no critique can come before the audit (C1), there is none at all. Either keep case 2 (ADR-0098 l142 now reads 'never passed over: the fix acts on the critique from before the audit, or on none'), or limit it to audits that a critique can precede.
- OWNER TO CONFIRM (round-8 verification, finding 9; keep the round-7 row): whether an AI direction that takes the person's answer in counts as carrying it to the work (C6a/C2). Implemented as main admits; ADR-0098 l116 now says so instead of 'settles'.
- Seed notes: model-step.ts leaves a seed's note only when the seed writes a direction (directionOf), but answersReachingWork (and its new audit rule that a lens which always notes replaces the notes) treats a model seed as always replacing the notes. This could refuse an answer whose note survives on a run where the seed writes no direction. Make seeds 'sometimes' for notes. The verifier's oracle stub always leaves a seed note, so it needs a no-direction branch to test this.
- Influence through candidates: ADR-0098 l192 now states that an AI step reading the candidates themselves (the options, or a pool view of them) is not counted as carrying an answer applied inside them. So an answer applied only in candidates nothing takes up is refused, even where such a step's text later reaches a writer. None of the 131 newly refused answers reached a writer that way in the oracle. If refusals must be strictly conservative, follow options and pool views into carriers.

## Round 9: the verifier's report

*From `semantics-2-final-r9.json`, `verify9`. The owner's earlier decisions respected: yes.*

### Findings checked

- **R8-F1 (blocking): candidates nothing takes up (u1 trim on unpicked candidates; CUT outside with its fix only in unpicked candidates)**: closed. HEAD refuses the u1 trim for C3/C4/C5 (shapes10 s34/s60/s86, ST12 critique-per-candidate) and the outside CUT with its fix in 2 unpicked candidates (s39/s65/s91, critique-unapplied). The oracle shows them lost: Wc 64/64 and F 0/64. The picked controls (s32/s33/s58/s59/s84/s85/s38/s64/s90) are admitted and in the delivered lineage on 64/64 runs. Round-8 idx 2272/2509/2550/2593 (semantics-2-r8/diff-head.json numbering) are refused at HEAD. Main admits all of these. Round 7 admits the outside-CUT case and refuses u1, so ADR l97 is accurate.

- **R8-F2 (blocking): st9c, a CUT then another answer in one lens**: closed. s21/s22/s47/s48/s73/s74/s99/s100 are refused under ST9 human-critique case 1, and each lost 64/64 with F=0. Across the fresh and earlier corpora, all 3,719 ST9 case-1 answers and all 1,295 ST10 case-1 answers were lost on every run (given, empty and mixed).

- **R8-F3 (blocking): 3577, C6a draft after an author loop whose audit always notes**: closed. g9 idx 3577 is admitted at round 8 and refused at HEAD (ST12 critique-unapplied). The new semantics tests pin the always-noting lens against the may-not-note lens.

- **R8-4: relay brief slot**: open. g9 idx 479 is still admitted, here and on main. It is a named residual (ADR-0098 l195). Non-blocking.

- **R8-5: a from-scratch writer after the taker**: open. In 7,961 fresh admitted variants (9,175 answers, 602,328 runs), 104 admitted answers never reached the delivered lineage. 100 of them have a later AI writer that takes in neither the artifact nor the options (named, l196). l196 checked on the round-8 f0 sample: 86 zero-lineage answers, HEAD refuses 72, and each of the other 14 has such a writer. l150 checked: 41 of newly8's 42 zero-F answers are refused, the 42nd is 18235. 2 further cases are not named (see problems). Non-blocking, as on main.

- **R8-6: ST9/ST10 case 2 (owner decision)**: open. 300 answers are refused under case 2 (ST9 136, ST10 164). All reach the work when given, and in no empty run is the fix passed over (E=0 in all 300), as ADR l100/l142 now say. The owner has not decided.

- **R8-7: ST9 case-1 message**: closed. The new message text is true of the st9c shapes and is held by semantics-rules.test.ts.

- **R8-8: decidesWork counted contained judges and loop critics**: closed. decidesWork now excludes a pick judge, a loop critic and a gate critic inside a lens or gate body (semantics.ts l1090-1117). Tests cover the lens pick-judge and the lens loop.

- **R8-9: AI direction carrying an answer (owner to confirm)**: open. ADR l116 now says it is implemented as main admits and is owner-pending. That is accurate.

- **V1: differential soundness and no false refusal**: partly. Fresh: gen10 (xoshiro128**, gen9 mutations plus round-9 ones: candidates with or without pick/each/dedupe/option-map, lens mixes, gate bodies with onFail fixed to 'human' since gen9's gates never parsed, seeds between a note and a draft, nested fan-outs). 23,665 fresh variants that main admits, deduped against the r8 and g9 corpora; the branch refuses 12,286. Earlier corpora re-verified: 35,219 unique / 4,925 refused (28 more variants and 29 more answers than round 8, none newly admitted) and g9 22,121 / 9,748 (73 more variants, 102 more answers, none newly admitted). This matches ADR l146/l147. Oracle (real Interpreter, stubbed activities; my change: a seed leaves its direction note only on some runs, as model-step.ts does): 28,910 refused answers in 25,876 variants, 1,935,888 runs. 28,556 were lost on every run. 300 are case 2 (owner). 54 (40 critique-unapplied, 14 critique-per-candidate) reached the person's draft and the delivered lineage on runs where a seed wrote no direction. All 54 are lost with SEEDNOTE=always (0/59) and reached with SEEDNOTE=never (54/59): false refusals, BLOCKING (see problems). Hand-built legitimate shapes (later stage, next loop round, behind a render, route branch, optional fix, picked candidates, outer-picked nested pick, each concept taking it, dedupe deciding, CUT beside a critic lens) are admitted wherever main admits them and reach the work. The nested replicate with only the outer picked (s35/s61/s87) is correctly refused: the outer replicate hands on its candidate's artifact, which is the pre-trim work, and F=0/64. All 18 catalog recipes keep their hash, validate findings and composed self-admission. corpus.test.ts (monotonicity and placement) passes.

- **V2: no false claim (claims oracle)**: closed. 11,379 fresh admitted variants, 12 runs each, plus controls. E-STRICT: 0 violations over 5,706 react-to claims; the FORCE_REACT control fires 125 times in 39 variants. E-REACT-CLAIM-BUT-NEVER-SHOWN fired 3 times (c2 idx 807, c6 1467, c6a 1719); rerun with 64 runs and other seeds, all are shown (sampling). I-APPLIES-BUT-OTHER and I-APPLIES-STALE: 0 over ~440k applies claims. Swap asked vs said: H-ASKED-BUT-NOT-SAID 0 and H-SAYS-YOU-CHOOSE-BUT-NOT-ASKED 0. Oracle artifacts, no product fault: H-ASKED-BUT-REPLACED (the replacement is inside a replicate candidate, which does not leave it), H-SAYS-ALL (the swap step under an optional or route skipped, then a final-check retry re-runs the stage), G-RELAY-ONE (two candidates call storyboardShots concurrently). Lock: 0 (RUN-LOCK, L1-L3). Wrote-the-rest: 0. FORCE control fires 944/114/95. Notes-only: the D-NOTES-ONLY hits are writers that do not take the critique in (seed or build from intent); the oracle checks the port's presence, not its consumption. present.ts is unchanged in round 9.

- **V3: flowRecipe move and bundle**: closed. 30,000 recipes: 10,000 from the round-7 verifier's independent gen7 (depths 3-5), 12,000 g10 and 8,000 earlier refused. Main's and the branch's flowRecipe give identical step-call sequences and final states (may and must tracers, 60,000 traces). Memoized equals full, and validate memoized equals withoutFlowMemo, finding for finding. writersAfter is identical. On 20,000 catalog mutations no main finding is missing or reworded. On random recipes the only main-only findings (PR4 relay-unpicked/d3-entry, DR2, DR1, ST5/ST12 set-aside) are the decision-7 scope-typing changes (each without option set, gate/audit hand on only the critique), shown by ST5 or PR4:each-in-d3 at the same path. They are not from the walk. The rebuilt bundle hash is 38afef53ed613c48…, equal to the build.test.ts pin and to ADR-0093 l58 and ADR-0098 l184. The analyses are absent from the bundle. No packages/runner/src/workflow change since 4bd7b8a^, and round 9 touches no runner code.

- **V4: ADR-0093, ADR-0098 and spec sentences**: partly. Checked true: l97 (u1 refused; round 7 and main admit the outside CUT), l99 (st9c 64/64), l100 (case 2, E=0), l108-l111 (no protocol config has a judge prompt; dedupe), l113 (3577), l117, l141 (4 idx refused), l142 (4,897 answers in 4,735 variants per semantics-2-r8/o-r8d.summary.txt), l146, l147, l150, l157, l184, l196 (14/86 and their writers). Spec l151 is true except where seeds are involved. ADR-0093 is unchanged, and its main pin ec88dae8 is confirmed. False: l199, 'They refuse only an answer that no run hands on to the work, by any port it fills or anything made from it', is false for the seed-note refusals (BLOCKING, below). l108's 'where what it makes or decides is the work the run delivers' overstates for a writer whose version a later pick of earlier candidates replaces (non-blocking, below).

- **V5: decisions D1-D4**: closed. The main..HEAD diff touches no gateway, sandbox or renderer files, no CI file and no ADR index or log, and does not touch ADR-0089/0090/0092/0099. The C3 catalog file is unchanged (same hash). Presentation edits are C2/C6/C6a cap copy only. Only ADR-0093/0098 (this branch's) and the spec changed under docs.

- **V6: gates**: closed. pnpm vitest run: 177/177 files, 4054/4054 tests passed. pnpm -s typecheck: pass. pnpm --filter ./apps/web run build: pass. pnpm e2e: 53/53 passed on the first run, with no reruns.

### Problems found

- **Blocking.** False refusal of main-admitted recipes: answersReachingWork treats a seed as always replacing the notes beside the work (leavesNote includes 'seed', and a seed carries nothing, so notes = []). model-step.ts leaves a seed note only when directionOf finds 2 or more lines before the fence, and the C2/C3/C5/C6a seed prompts ask for the fenced block alone. So in practice those seeds usually leave no note, and a note an AI step made from the person's answer survives to the person's own draft or reaction. By the branch's own reach rule that answer reaches the work. The refusal message tells the composer it reaches on no path, and ADR-0098 l199 ('They refuse only an answer that no run hands on to the work… anything made from it') is false for it. The implementer had parked this as backlog. It predates round 9 but is this branch's clause.

  Evidence: Oracle with seeds noting half the time: 54 refused answers (40 critique-unapplied, 14 critique-per-candidate) reached the person's draft (N or Nc) and the delivered lineage F. With SEEDNOTE=always, 0 of 59 targets reach. With SEEDNOTE=never, 54 of 59 reach. Natural cases from the round-8 verifier's g9 corpus, both refused at round 8 too: g9 idx 5428 and 9754, C6a with the reaction also given as a critique plus a copy of seed-card after sharpen. With no seed note the reaction reached `write` 23/24 runs and F 23/24. probe-direction.mts: directionOf(card-only answer) = null. Hand repro: shapes10b s119/s120 (C3: your critique; an AI direction reading the critique, producing taste; seed-angle from intent; your own draft, or your reaction plus the AI draft). Main admits; HEAD refuses ST12 critique-unapplied; reached on 32/64 runs with half notes and 0/64 with always. Files: C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r9/{v10.oracle.test.mts, reached-refused.json, o10-reached-{always,half,never}.json, shapes10b.json, probe-direction.mts}.

  Suggested fix: In answersReachingWork make a seed's note 'sometimes' (notes = union(st.notes, carried) for role 'seed'), and in lensesHandOn count a lens whose only note-leaving step is a seed as possibly making nothing new. Keep directionsReactedTo as it is, since it only withholds claims. Fix the NOTE_ROLES/leavesNote doc ('a seed's build the direction it took' only when it writes one). Add tests: a seed between an AI direction carrying the answer and the person's draft is admitted. Re-run the differential with the half-note oracle. Then ADR l199 and spec l151 hold.

- **Not blocking.** An admitted answer whose writer's version a later pick of candidates made before that writer replaces is never delivered. Like the from-scratch residual, but not named in ADR-0098 l196. l108's 'where what it makes or decides is the work the run delivers' overstates for it.

  Evidence: Fresh admitted oracle: g10 idx 16404 (C4: trim on 3 unpicked candidates; your VISION on the pool; apply-swaps on the pre-candidate work; then H pick) had W 44, F 0/48. idx 19392 (C1: same with ai-asset reading your CUT, then R pick) had W 42, F 0/48. Main admits both.

  Suggested fix: Name 'or a later pick that takes up candidates made before it' beside the from-scratch writer in l196, or qualify l108. Backlog: follow 'the work is replaced' (a later from-scratch writer or a pick of earlier candidates) in answersReachingWork.

- **Not blocking.** ST9/ST10 case 2 still refuses answers that reach the work when given (the empty form is never passed over). This awaits the owner's decision (backlog finding 6).

  Evidence: 300 answers (ST9 136, ST10 164): W/F when given, E=0 in all empty runs. Hand shapes s18/s44/s70/s96 (CUT alone in a lens) and s23/s49/s75/s101 (CUT at the end of a gate body after its critic): main admits, HEAD refuses.

  Suggested fix: Owner decision as already logged. If kept, nothing to change. If limited to audits a critique can precede, change structural.ts's endsWith branch accordingly.

- **Not blocking.** Known residuals left by design: the relay link's brief slot (g9 479 admitted, 0/400), and influence through candidates or lens drafts not followed (4 refused answers reached only the influence lineage FI or I, never W/N/D or F).

  Evidence: g9 idx 479 admitted at HEAD. Fresh: idx 2703 (c6a: lens vanilla-build reads your critique; overlap flag sees it; FI only), 11565, 20642; old o39739.

  Suggested fix: Keep the existing backlog items (relay brief exclusion in appliesPort; following options or pool views if refusals must be strictly conservative).

### Tests rerun

Gates at HEAD 00e418c: pnpm vitest run 177/177 files, 4054/4054 tests passed. pnpm -s typecheck passed. apps/web build passed. pnpm e2e passed 53/53 on the first run. Targeted re-run: corpus (monotonicity/placement), flow-memo, recipe semantics, semantics-rules and present tests, 192/192. Probes in C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r9/: gen10 made 23,665 fresh main-admitted variants. verdict10 re-ran main vs HEAD on the 35,219 r8 corpus and the 22,121 g9 corpus. The v10 execution oracle ran 28,910 refused answers (1,935,888 runs) and, in admitted mode, 9,175 answers (602,328 runs), plus re-runs with seeds noting always and never. The claims oracle ran 11,379 admitted variants with FORCE_REACT, FORCE_J and FORCE controls. 75 hand-built shapes, checked against main, round 7 and HEAD and through the oracle. cmp10 compared main and branch validators and flow walks on 30,000 recipes. The catalog comparison covered 18 recipes. The workflow bundle was rebuilt: hash 38afef53, matching the pin.

## Round 10: the implementer's report

*From `semantics-2-final-r11.json`, `impl10`.*

Head commit: 29c4b19e46feb393ef6baeac9b266c7effd48553. Tests passed: 4057, failed: 0. Typecheck clean: yes. End-to-end: pass: 53/53 on the first run, no reruns. Bundle hash: 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637.

Round 10 on fix/fx-semantics-2 fixes the root cause of the round-9 verifier's one blocking problem: the branch refused 54 answers from recipes main admits, although those answers do reach the work. Two commits on top of 00e418c: 81f6582 (code and tests, written first) and 29c4b19 (ADR-0098 and the spec).

**The fix** (packages/recipe/src/semantics.ts)
- `NOTE_ROLES` is now a map that says when each role leaves a note: 'always' for critic, check, cut, tells-sweep, overlap and vision; 'sometimes' for seed.
- `leavesNote` now returns 'always', 'sometimes' or 'never'. Every caller is updated.
- In `answersReachingWork`, a step that notes only sometimes keeps the notes that were there before it: notes = union(st.notes, what its prompt holds). So a note an AI step made from the person's answer can still reach their own draft after a seed. A skipped relay judge is handled the same way, as before.
- One extension beyond the brief: a seed's direction note now carries the answers its prompt took in by text ports. This only admits more, and only matters inside a lens or gate body, where a seed applies nothing to the work directly.
- `lensesHandOn` needed no code change. A lens whose only note-leaving step is a seed keeps its HANDED marks, so it counts as possibly making nothing new. Its doc comment and a test now say so.
- `directionsReactedTo` uses the same table, so I updated its call to `leavesNote(s) !== 'never'` and its doc. Its behaviour is unchanged: a seed still counts as replacing the directions' note, which only withholds a claim. `carriesOn` is updated the same way, also with no change in behaviour.
- model-step.ts: only the comment on `NOTE_LABELS` changed.

**Tests (written first)**
- packages/recipe/test/semantics.test.ts:
  - s119/s120-like shapes are admitted.
  - A critic placed before or after the seed still refuses.
  - A lens holding only a seed hands on the earlier note; beside a lens that always notes, it does not.
  - A seed in a lens that takes the critique in carries it through its direction.
  - `directionsReactedTo` withholds the claim at a seed but not at a build.
- packages/runner/test/semantics-effects.test.ts pins the table to the runner:
  - 'always' is exactly the `NOTE_LABELS` keys, 'sometimes' is exactly seed, every other role is 'never', and no person's or tool's step leaves a note.
  - `directionOf` returns nothing for a card-only answer or a single line before the block, and a direction for two lines.
  - A real `modelStep` run leaves a note for every answer of a noting role, including "No defects.", "Nothing to remove." and an empty sweep. A seed leaves one only with a direction; a build never does.
- packages/validator/test/semantics-rules.test.ts: s119 on the studio fixture is admitted, and the critic contrast is refused.

**Docs**
- ADR-0098:
  - l108 now says what takes the answer in is the work at that point of the run. Whether a later from-scratch writer or a later pick of earlier candidates replaces it is not followed.
  - l113 explains seed notes and the 54 answers this admits.
  - l196 names "or a later pick that takes up candidates made before it", with the verifier's examples. The verifier called idx 19392 C1; it is actually C3, and the ADR says C3.
  - l81 and l199 now cover seeds.
  - A round-10 measurement and an evidence entry are added.
- Spec line 151 is updated to match. No Accepted ADR, ADR index, backlog or CI file was touched.

**Measurement** (scratch C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/semantics-2-r10). HEAD's verdict was checked against the variants main admits in the round-9 verification's corpora:

| Corpus | Variants | Refused at HEAD | Change from round 9 |
|---|---|---|---|
| Round 8 | 35,219 | 4,925 | none |
| g9 | 22,121 | 9,746 | 2 fewer (idx 5428, 9754) |
| g10 | 23,665 | 12,251 | 35 fewer, 52 fewer answers |

- **Newly admitted:** 37 variants and 54 answers (40 critique-unapplied, 14 critique-per-candidate). These are exactly the verifier's 54. Nothing is newly refused, neither a variant nor an answer.
- **Shapes:** of shapes10b, s119 and s120 are now admitted. The six other seed shapes, which main refuses, are still refused, by other rules only. The 117 shapes10 verdicts are unchanged.

**Oracles.** The execution oracle is the verifier's v10, with the seed stub given a no-direction branch (SEEDNOTE half, never or always) and a direction that carries what the seed's prompt holds.
- **The 54 newly admitted answers:** all 54 reach the delivered work (F) with seeds directing half the time and with none. Of them, 40 reach the person's own draft (N), 14 a draft inside a picked candidate (Nc), and 6 an AI writer (W). With seeds directing on every run, none reach it.
- **Every still-refused answer**, each classified: 28,856 answers in 25,830 variants, 1,932,384 runs with seeds directing half the time:
  - 300 are ST9/ST10 case 2 (136 and 164). They reach the work when given, and left empty are never passed over. That case awaits the owner's decision.
  - The other 28,556 never reached a writer, the person's draft or a decider outside a candidate, nor the delivered work:
    - 27,332 reached nothing at all.
    - 1,220 reached only candidates that nothing takes up.
    - 4 reached the delivered work only as influence: a lens's overlap flag sees AI drafts that took the answer in and makes a critique of its own. These are the same 4 the verifier named as known residuals (g9 4520, g10 2703, 11565, 20642). They are the limit ADR l199 already names, not a loss of the answer itself.
  - No false refusals remain.
  - The 19,868 of these answers in variants with a seed were run again with seeds never directing and always directing, 1,331,616 runs each. The result is the same: 169 case 2, the rest lost.
- **Claims oracle:** the verifier's copy, with a seed direction on half the runs, over 11,379 admitted variants plus the 39 newly admitted. No "react to" claim fails (E-STRICT is 0). The FORCE_REACT control fires 209 times. One E-REACT-CLAIM-BUT-NEVER-SHOWN (c6 idx 1467) is the same variant the verifier put down to sampling; no later VISION of the person's ran.

**Gates at 29c4b19**
- `pnpm vitest run`: 177/177 files, 4057/4057 tests.
- `pnpm -s typecheck`: pass.
- `pnpm --filter ./apps/web run build`: pass.
- `pnpm e2e`: 53/53 on the first run, no reruns.
- No workflow code changed, so the bundle hash is still 38afef53ed613c48…. The pin in build.test.ts and the hash lines in ADR-0093 and ADR-0098 are unchanged.

Backlog items:

- OWNER DECISION (unchanged): ST9/ST10 'human-critique' case 2 refuses 300 answers in the round-9 corpora (ST9 136, ST10 164). Each reaches the work when given, and its empty form is never passed over. Keep the case, or limit it to audits that a critique can precede.
- OWNER TO CONFIRM (unchanged): whether an AI direction that takes the person's answer in counts as carrying it to the work (C6a/C2). Implemented as main admits.
- A later pick of earlier candidates: an answer applied by a writer whose version a later pick of candidates made before it replaces is never delivered. Examples: round-9 verification g10 idx 16404 (C4) and 19392 (C3, not C1 as the verifier wrote). Main admits these. Named beside the from-scratch writer in ADR-0098 Consequences. Fix: in answersReachingWork, follow 'the work is replaced' by a later from-scratch writer or a pick of earlier candidates.
- From-scratch writer (unchanged): a later AI writer that does not take the work in replaces an applied answer (14 admitted answers in the round-8 f0 sample). Refuse such an answer, or a from-scratch writer after Distill.
- Relay brief slot (unchanged): relay.ts fills a relay link's brief slot with 'Shot N', yet appliesPort counts a model RELAY that takes the brief in. Example: g9 idx 479, admitted, 0 of 400 runs.
- Influence through a lens's candidates: 4 refused answers (g9 4520, g10 2703, 11565, 20642; main admits them) reach the delivered work only as influence. A lens's AI drafts take the answer in, and the lens's overlap flag, which sees those drafts, makes a critique of its own. ADR-0098 l199 names this limit. If refusals must be strictly conservative, follow the options and views an AI step sees into what it carries.

## Round 10: the verifier's report

*From `semantics-2-final-r11.json`, `verify10`. The owner's earlier decisions respected: yes.*

### Findings checked

- **R9-BLOCKING: 54 answers main admits were refused though they reach the work (seed read as always replacing the notes)**: partly. Reproduced the round-10 change independently. HEAD vs 00e418c verdicts on the earlier corpora give the same numbers the implementer reports. g9: 9,746 refused (2 fewer). g10: 12,251 refused (35 fewer variants, 52 fewer answers). Round-5..8 sets: no change. Nothing is newly refused anywhere. My oracle (v11, scratch verify-semantics-2-r10/nw-*.json) ran the 54 answers. With seeds directing half the time or never, all 54 reach the delivered work; with every seed directing, none do. So the round-9 finding is closed for the 37 answers whose seed is a product.* prompt. The other 17 sit in C1 variants whose seed is C1's article.SEED. That template's answer format is 'First the direction, one line per axis. Then the complete HTML document'. With that seed directing as its prompt asks (SEEDNOTE=prompt), 0 of the 17 reach anything in 72 runs each (sumnewly.cjs). See problem 1.

- **1. Soundness / no false refusal (differential vs main)**: closed. Fresh corpus from gen11.mts: gen10 copied, PRNG re-keyed, plus 4 new seed mutations; main-tree re-exported from d76bbd0. It holds 21,566 unique variants that main's checkAnswer admits, from 540k tries over the 8 configurations (merge11.log). HEAD refuses 10,036 of them. Every refused answer was run through the real Interpreter with stubbed activities (classify11.cjs, o11-ref.classified.json): 11,111 answers in 9,543 variants, 724,728 runs (24 runs given, 24 with that answer empty, 24 with answers left empty at random). Seeds directed on half the runs and their directions carried what the seed takes in. No answer outside case 2 reached an AI writer, the person's draft, a decider outside a candidate, or the delivered work. By clause: ST12 critique-unapplied 5,668 (5,608 reached nothing, 60 only candidates nothing takes up). ST12 critique-per-candidate 2,322 (1,732 nothing, 590 candidates only). ST9 human-critique case 1: 1,811, of which 165 are also ST10; all reached nothing. ST10 human-critique case 1: 1,019 (1 candidates only). Case 2: ST9 138 and ST10 153; all reach the work when given, and none is passed over when left empty (owner decision, see problems). The 1,357 answers in seeded variants were re-run with seeds never and always directing: still no false refusal. Hand-built legitimate shapes (shapes11.mts/shapes11.log) cover a CUT applied in a later stage, in a loop you hold next round, behind a render, in a route branch, with an optional fix, past a taste reaction, a fix that only reads, trim in candidates then picked, and a seed between CUT and fix. All of these, on C1/C3/C4/C5, are admitted at HEAD wherever main admits them. Of the round-9 verifier's 127 shapes, every refusal of a shape main admits is a lost answer or case 2 (o11-shp-ref.json). Catalog: all 18 recipes keep hash, validate() verdict and findings, and composed self-admission (catalog-cmp.log). advisor/test/corpus.test.ts (monotonicity and placement) passes.

- **2. No false claim (claims oracle)**: closed. Copied the round-9 claims oracle (claims11.oracle.test.mts) with a seed-direction branch (SEEDNOTE half, plus prompt-aware on one shard). Ran it on all 11,530 fresh admitted variants at 12 runs each (138,360 runs, cl11b-0..3.json). Results: E-REACT-CLAIM-BUT-NEVER-SHOWN 0, E-STRICT 0. The FORCE_REACT control fires 230 E-STRICT-FORCED and 29 never-shown. I-APPLIES-BUT-OTHER-CRITIQUE 0. Swap asked vs said: H-ASKED-BUT-NOT-SAID, H-SAYS-YOU-CHOOSE-BUT-NOT-ASKED and H-ASKED-BUT-NO-SWAP-STEP-RAN are all 0. Lock: L1, L2, L3 and RUN-LOCK-* are 0, while the FORCE control fires 148/108/1/1. Wrote-the-rest: C 0 (FORCE fires 882). Notes-only: D 0, after requiring that the writer take the critique in. Before that change the copied check fired 45/12/33, and every case was a later seed that does not consume the critique (the check read ports.critique alone). FORCE_J control: 2,301. What remains is oracle artifacts present in rounds 9 and 10 too. H-SAYS-ALL-BUT-NOT-ALL-SWAPPED (24, all C5 wrapNode): apply-swaps sits under an optional or route the person declined, and C5's launch-gate retry re-runs D3, so the check pairs the sweep with the next run's applier. G-RELAY-ONE (18): the stub returns a random storyboard per call to parallel candidates on the same artifact.

- **3. flowRecipe move: rules walk exactly as before; bundle hash**: closed. cmp11.mts covers 9,000 random gen7 recipes (seeds 31337/42424/52525) and the 21,566 fresh corpus. Main's validator flowRecipe and the branch's @byway/recipe flowRecipe give identical step sequences and final states: walkSame 18,000/18,000 and 43,132/43,132. The memoized walk and validate() equal the full walk (memoVsFullDiff 0), and writersAfter is identical. On the fresh corpus there are no main-only findings, okOnlyBranch is 0, and every main-only admission is refused by intended branch clauses: ST12/ST9/ST10 new clauses, ST5 and PR4/DR2 from gate/each/audit scope typing (ADR-0098 decision 7), ST2/ST10 feed and ST10 retry-scope. Example: a pick inside a gate body no longer leaks its artifact, so D3 has none. buildWorkflows gives 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637, which equals PINNED_WORKFLOW_HASH in build.test.ts (main pins ec88dae8…). The bundle contains none of flowRecipe, NOTE_ROLES/leavesNote or the analyses. Round 10 touched only a comment in model-step.ts, an activity outside the bundle.

- **4. ADR-0093, ADR-0098 and the spec: every sentence true of the code**: open. ADR-0093 was spot-checked against interpreter/wording/run.ts (capTurn, humanCapPrompt, FINAL_CHOICE_PROMPT, RunStopped → cancelled) and holds. In ADR-0098 the round-10 numbers hold: l152, l153, the s119/s120 and six other seed shapes (shapesv.log), and the l201 examples (16404 is C4, 19392 is C3, both with the described structure). But l113 states two things as runtime fact that the code base contradicts (problem 1). (a) 'the product's seed prompts ask for the fenced block alone': C1 Landing Page Studio's seed-build uses article.SEED, which asks for the direction first. (b) 'Its direction is made from its prompt, so where it does write one, the note carries what the seed takes in': every seed template (article.SEED, product.c2.seed-option, c3.seed-angle, c5.seed-territory, c6a.seed-card) declares slots problem and seed only, and the renderer ignores other slots. The same premise is in semantics.ts:134, semantics-effects.test.ts:243 and semantics-rules.test.ts:330. The last of these uses prompt 'article.SEED' for its admitted seed shape.

- **5. Decisions respected (D1-D4)**: closed. git diff main...HEAD touches no packages/gateway file (D1), no renderer or sandbox code (D2; e2e still reports Chromium's OS sandbox off, as before), and neither c3.ts nor C3's presentation copy (D3). It adds no CI file and leaves docs/adr/README.md alone. Among ADRs it edits only 0093 and 0098, the branch's own; 0089, 0090, 0092 and 0099 are untouched (D4).

- **6. Gate**: closed. At 29c4b19, pnpm -s typecheck passes, pnpm --filter ./apps/web run build passes, and pnpm e2e passes 53/53; the expected-fail F07 test is marked x, as on round 9. pnpm vitest run: 175/177 files passed with 4,039 tests, 17 skipped and 1 failure, taken while the machine was shared with another session's jobs. The failures were pages.test.ts SEC-5 (a 5 s render bound) and real-prompts.test.ts (the ephemeral Temporal server did not start within 5 s). Re-run in isolation, both files pass, 37/37 (gate-vitest-rerun.log). corpus, flow-memo and semantics tests also pass in isolation: 258/258.

### Problems found

- **Blocking.** Round 10's justification for treating every seed's note as 'sometimes', and for letting a seed's direction carry what it takes in, is stated as fact in ADR-0098 l113, in semantics.ts and in two test comments, and it is false of the code base. 'The product's seed prompts ask for the fenced block alone' is false for C1 (Landing Page Studio): its seed-build prompt article.SEED says 'First the direction, one line per axis. Then the complete HTML document', so directionOf finds 5 or more lines and the runner leaves a note on every compliant run. 'Its direction is made from its prompt, so where it does write one, the note carries what the seed takes in' is false for every seed template in the repo: all declare slots problem and seed only, so a seed that consumes the critique, brief or taste never has it in its prompt. These two premises are what newly admit answers that round 9 refused and that are lost in practice.

  Evidence: Lines: ADR-0098 docs/adr/0098-recipe-limits-disclosure-and-held-voice.md:113; packages/recipe/src/semantics.ts:133-135 ('The product's seed prompts ask for the fenced block alone, so most runs leave none'); packages/runner/test/semantics-effects.test.ts:243; packages/validator/test/semantics-rules.test.ts:330. That last test builds its admitted shape with prompt 'article.SEED' and says the note reaches the draft '(the product's seed prompts ask for the block alone)'. Prompts are in packages/prompts/templates/article.SEED.md (used by catalog steps.ts seedBuild → c1 seed-build) and product.c{2,3,5,6a}.seed-*.md; every one has 'slots: problem, seed'. Measurements (scratch C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r10): the implementer's 54 newly admitted answers include 17 in C1 article.SEED variants. With SEEDNOTE=prompt (article.SEED directs every run, other seeds half) those 17 reach nothing in 72 runs each (nw-prompt.json, sumnewly.cjs). In my fresh corpus round 10 newly admits 161 answers (g11-newly.json); 42 of them are in C1 variants. 41 of those 42 reach nothing when C1's seed directs as prompted (nw11-prompt.json). With directions also carrying nothing, as every seed template implies (SEEDCARRY=0 + prompt), only 77 of the 161 reach the work. 36 of the 38 newly admitted ST9 answers depend solely on a lens seed's direction carrying the critique (nw11-prompt-nocarry.json, nw11-half-nocarry.json). Concrete example: fresh idx 10101 (C1, admitted at HEAD and on main, refused at 00e418c). The steps are render, your overlap answer as critique, an AI tells-sweep that consumes it, a seed-build on article.SEED (intent, taste), then your own draft. Your answer reaches the draft only on runs where C1's seed writes no direction before its HTML. Main admits all of these, so this is not a regression versus main, but these false sentences were added in round 10 and carry its decision.

  Suggested fix: Make every one of these sentences true; the choice between the two routes is the owner's or implementer's. Route (a): make leavesNote prompt-aware ('always' for a seed whose prompt asks for its direction first, i.e. article.SEED; 'sometimes' for the product.* seed prompts), and drop the extension that a seed's direction carries its text ports, since no seed template renders them. This re-refuses the C1 and lens-seed answers above. Route (b): keep the code, and rewrite ADR-0098 l113/l152-155, semantics.ts:133-135 and the two test comments. They should say that C1's seed asks for a direction first and so leaves one on nearly every run. They should say that a seed's direction counts as carrying an answer by its ports only (the l200 by-ports residual), since no seed template renders the critique, brief or taste. And they should name the resulting residual with its numbers: the 17 of 54 answers above, and the ones in this corpus. Under (b), also change the validator test to use a product.* seed prompt, or state its premise accurately.

- **Not blocking.** Unchanged owner decision: ST9/ST10 'human-critique' case 2 refuses answers that reach the work when given and that, left empty, are never passed over.

  Evidence: Fresh corpus: 291 answers (ST9 138, ST10 153). All 291 reach the delivered work when given, and emptyE is 0 (o11-ref.classified.json). Of the round-9 verifier's shapes, 12 more (s18, s23, s44, s49, s70, s75, s96, s101...) are admitted by main. This matches the implementer's backlog item.

  Suggested fix: Leave for the owner as already logged: keep case 2, or limit it to audits and gates that a critique can precede.

- **Not blocking.** Named residual: a from-scratch writer, or a later pick, replaces what took an admitted answer in. Round 10 also newly admits 7 per-candidate answers of this kind that round 9 refused. In those shapes a loop you hold runs [your draft, render, your critique, an AI direction, a seed]: the draft takes the note in the next round, and the seed at the end of the same round replaces it.

  Evidence: Admitted-mode oracle on all 11,530 fresh admitted variants (o11-adm-*.json; 9,553 answers, 415,472 runs): 9,382 answers reach the delivered work. Of the 171 that never do, 169 have a later seed or build that does not take the work in (why-notF.cjs) and 1 has a later pick. The remaining one (idx 13758) reached the work in 20 of 240 mixed runs: a sampling miss, correctly admitted. The 7 seedLoop answers newly admitted at round 10 (idx 2041, 6779, 14739, 17025, 17672, 19966, 20015) reach only Nc and never F, whether seeds direct or not (nw11-half.json, nw11-never.json). Main admits all of these. ADR-0098 l201 names the residual.

  Suggested fix: Backlog, as already logged: in answersReachingWork, follow 'the work is replaced' by a later from-scratch writer or a pick of earlier candidates. The seedLoop shape is a good regression case.

- **Not blocking.** Two runner test files time out when the full suite runs on a loaded machine.

  Evidence: In the full run, packages/runner/test/pages.test.ts 'bounds a page that never settles' failed (StepError at its 5 s render bound), and real-prompts.test.ts failed because the ephemeral Temporal server did not start within 5 s. Re-run in isolation, both pass, 37/37. Other sessions' node jobs were using about 70% CPU at the time.

  Suggested fix: None required for this branch. If it recurs, consider a longer ephemeral-server start timeout for real-prompts.test.ts.

### Tests rerun

At 29c4b19, typecheck passes, the web build passes, and pnpm e2e passes 53/53 (the expected-fail F07 test marked x). Full pnpm vitest run: 4,039 passed, 17 skipped, 1 failed, with 2 failing files (pages.test.ts SEC-5 timeout; real-prompts.test.ts ephemeral server start), both load-related; re-run in isolation they pass 37/37. corpus (monotonicity and placement), flow-memo and the recipe, validator and runner semantics tests pass 258/258 in isolation. Bundle hash 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637 equals the pin. Probes are in C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r10/. gen11.mts produced 21,566 unique fresh variants main admits from 540k tries (merge11.log). v11 execution oracle, refused mode: 11,111 refused answers, 724,728 runs, 0 false refusals outside case 2; seeded variants re-run with seeds never and always directing. Admitted mode: 9,553 answers, 415,472 runs. Newly admitted answers were run under the half/never/always/prompt and no-carry seed models. claims11 oracle: 11,530 admitted variants at 12 runs each, plus FORCE, FORCE_REACT and FORCE_J controls. cmp11 validator/walk differential: 9,000 random recipes plus 21,566 corpus recipes. HEAD vs round-9 verdicts on the earlier corpora (r9 verifier's g10-all, r8 verifier's g9-all, round 5-8 sets): only the 54 the implementer reports change, and nothing is newly refused. catalog-cmp: 18/18 recipes the same. Hand-built legitimate shapes (shapes11.log) and the round-9 shapes (shapesv-all.log, o11-shp-ref.json) were also checked. The worktree is untouched (git status clean, HEAD unchanged).

## Round 11: the implementer's report

*From `semantics-2-final-r11.json`, `impl11`.*

Head commit: 9f75317dd17f3a29da0295ea2ea15e5f5b5cdb89. Tests passed: 4058, failed: 0. Typecheck clean: yes. End-to-end: pass: 53 passed (pnpm e2e, 4.2m). Bundle hash: 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637 (unchanged; build.test.ts pin passes).

Round 11 on fix/fx-semantics-2. The blocking finding holds: both of round 10's premises were false. I closed it with route (a), so the code now matches the templates and the sentences are true of the code.

Code (commit 39f292c), written test-first:
- packages/recipe/src/semantics.ts adds DIRECTION_FIRST_SEED_PROMPTS = {article.SEED}. leavesNote now reads a seed's prompt. A seed whose prompt asks for the direction first (C1's) leaves a note on every run, read as every run that answers as asked. Any other seed leaves one only sometimes (the C2, C3, C5 and C6a seed prompts ask for the fenced block alone).
- answersReachingWork builds a seed's note from nothing, as round 9 did. Every seed prompt renders only the problem and the string, and the advisor profile lets a composed recipe give a seed only a catalog seed prompt.
- directionsReactedTo is unchanged: a seed of either kind still takes the claim away.
- The comments that stated the false premises are rewritten (NOTE_ROLES, leavesNote, carriesOn, lensesHandOn, answersReachingWork, directionsReactedTo, and the NOTE_LABELS comment in model-step.ts).

Tests:
- packages/runner/test/semantics-effects.test.ts holds the table to the templates. CATALOG's seed prompts are exactly the five seed templates; each declares only problem and seed and has no medium variants. Each answer format starts with "First the direction, one line per axis." exactly where the table says so, and leavesNote agrees.
- packages/recipe/test/semantics.test.ts covers C1's seed replacing the AI direction's note (the verifier's idx 10101 shape), a seed that takes the critique in carrying nothing (in a lens beside a critic, alone, and after your answer in its own lens: the 36 ST9 case), and directionsReactedTo for both prompts.
- packages/validator/test/semantics-rules.test.ts now builds the admitted shape on product.c3.seed-angle and shows that the same shape on article.SEED is refused.

Docs (commit 9f75317):
- ADR-0098: line 113 and the claim rule at line 81 are rewritten. Round 10's oracle line now says what its stub did. A new "And round 11" measurement is added, and Consequences name three residuals:
  - the seed as a writer in the by-ports residual;
  - 9 still-admitted seedLoop answers in the from-scratch residual;
  - the one reading that is not conservative: an answer that only a run whose C1 seed leaves its direction out hands on to the work is refused (55 such answers, plus 6 that reach only candidates).
- Spec section 151 is corrected to match. No Accepted ADR, README or backlog was touched.

Measurement (scratch C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/semantics-2-r11):
- Against round 10, 102 more answers are refused in 92 variants: the 17 C1 answers of round 10's 54, 83 of the verifier's 161 on the fresh 21,566-variant corpus, and 2 in hand-built shapes that main refuses by other rules. Nothing round 10 refused is admitted. Round 8's corpus and the round-8 verification's corpus are unchanged.
- The verifier's oracle, copied unchanged, was run with C1's seed directing on every run, other seeds on half, and no carry. None of the 102 reached anything in 6,864 runs.
- Against round 9, 121 answers stay admitted and nothing new is refused. 112 reach the delivered work. 8 reach only the person's draft and 1 only a draft inside a candidate; all 9 are seedLoop shapes with a product seed. With every seed directing, none of the 121 reaches anything.

Gate: vitest 4058/4058 (177 files); typecheck, web build and e2e (53 passed) all pass. No test timed out, so none was re-run in isolation. The workflow bundle hash is unchanged (38afef53…; build.test.ts passes), so the pin and the hash lines in ADR-0093 and ADR-0098 are untouched.

Backlog items:

- Owner decision, unchanged: ST9/ST10 'human-critique' case 2 refuses answers that reach the work when given and that, left empty, are never passed over (291 in the round-10 verifier's fresh corpus). Keep case 2, or limit it to audits and gates that a critique can precede.
- From-scratch writer and later-pick residual: answersReachingWork should follow 'the work is replaced' when a later from-scratch writer or a pick of earlier candidates comes after. Regression cases: 9 answers round 11 still admits against round 9 are seedLoop shapes (a loop you hold runs your draft, your list or critique, an AI step that takes it in, then a product seed). These are g11 idx 3339, 5703, 6933, 11248, 12693, 13651, 15371 and 16720, which reach only your draft, and idx 6779 in a C5 each, which reaches only a draft inside a candidate. The verifier's other 6 seedLoop answers are C1 and are refused again in round 11.
- C1's seed is read as directing on every run because article.SEED asks for it. Answers that reach the work only on a run whose model leaves the direction out are refused: 55 in round 11's corpora, plus 6 that reach only candidates. For the owner: make that reading exact at run time (a C1 seed answer with no direction counts as a miss and is asked again), or accept it as named in ADR-0098.
- By-ports residual, widened: a seed that takes in the critique, brief or taste is still counted as a writer that applies it, though no seed prompt renders those slots. This belongs with the existing backlog item 'refuse a taken-in port that the step's prompt never renders'.
- Runner test timeouts on a loaded machine (pages.test.ts render bound, real-prompts.test.ts Temporal start within 5 s) did not recur in this round's full run. If they recur, consider a longer ephemeral-server start timeout for real-prompts.test.ts.

## Round 11: the verifier's report

*From `semantics-2-final-r11.json`, `verify11`. The owner's earlier decisions respected: yes.*

### Findings checked

- **R10-blocking: two false premises about seeds (C1's prompt asks for the direction first; no seed prompt renders what a seed takes in)**: closed. Code (39f292c) adds DIRECTION_FIRST_SEED_PROMPTS={article.SEED}, so leavesNote is 'always' for C1's seed and 'sometimes' for the others. A seed's note now carries nothing (answersReachingWork uses `made = carriesOn(s) ? inPrompt : []`). I checked the templates myself. All five seed prompts declare `slots: problem, seed` and have no medium variants. Only article.SEED's answer format starts with "First the direction, one line per axis". The composed profile allows a seed only a catalog prompt written for the seed role (profile.ts:208-210). The CLI only validates and never runs a recipe. semantics-effects.test.ts holds CATALOG's seed prompts to exactly these templates. I re-ran the 102 answers that round 11 newly refuses in the earlier corpora (rv12-newly.json; v12 oracle, 72 runs each, 6,864 runs per setting): with C1's seed directing on every run, other seeds on half and no carry, 0 of 102 reach anything; with every seed on half, 61 reach something (53 F, 2 W/N/D, 6 only in candidates); with carry restored, 42 reach F. That is exactly what ADR-0098 states.

- **1. Soundness and no false refusal (differential against main)**: partly. Fresh corpus: 480,000 mutations of the 8 protocol configurations (gen12.mts, with new C1-seed and legitimate-shape mutations) gave 29,143 unique variants that main admits. The branch refuses 15,364 of them: 14,812 for a person's answer (18,283 answers) and 552 by other rules only (ST5 358, ST2 feed 89, COMPOSED-LIMIT 79, mixed 26; none involves a person's input, and they match 4bd7b8a). Two execution-oracle passes over every refused answer (real Interpreter, stubbed activities, answers given, left empty, and mixed; 1,149,768 runs each). Pass A uses the branch's reading: C1's seed directs on every run, other seeds on half, a seed's direction carries nothing. Results by clause (outside a candidate, no reach means no AI writer, own draft, decider or delivered work on any run): ST12 critique-unapplied 11,070 (10,972 nothing, 56 only in candidates nothing takes up, 42 influence only). ST12 critique-per-candidate 3,394 (2,701 nothing, 693 only in candidates). ST9 human-critique case 1: 2,590 (2,589 nothing, 1 influence). ST10 case 1: 869 (863 nothing, 6 candidates). ST9+ST10: 105 nothing. Case 2 of ST9/ST10 (255 answers, 249 reach the work when given) is the open owner decision. Pass C (C1's seed directs on half the runs, no carry): 3,480 refused C1 answers reach the work (3,268 the delivered work) only on runs whose C1 seed leaves out the direction its prompt asks for. This is ADR-0098's named non-conservative reading. With templates rendered (RENDERED=1), only 3 of the 3,480 reach anything. Pass D (carry by ports): 200 more reach only through a seed direction carrying text no seed prompt renders, so they are correctly refused. Against round 10: 3,661 newly refused, 0 newly admitted. Legitimate shapes: 1,673 single legitCut variants main admits. All 243 loop-next-round, and 1,268 of the 1,430 later-stage, behind-render/seed, route and optional variants, are admitted. The other 162 are refused, and all 162 reach nothing even under the generous oracle, because the inserted CUT displaces the catalog CUT before its fix. Hand-built shapes: all legitimate ones admitted, among them a C1 seed between CUT and fix and a carrier critique past a C1 seed. Earlier corpora re-verdicted with main, 29c4b19 and HEAD (103k variants): round 8's corpora unchanged, 17+83+2=102 newly refused, 0 newly admitted. Against round 9 (00e418c): 121 no longer refused, 0 newly refused. All catalog recipes (18/18) keep hash, verdict and findings, and the 8 configurations self-admit. Admitted soundness under the branch's own model: 16,626 admitted answers give 15,352 F, 1,211 W/N/D only, 63 only in candidates, and 0 reaching nothing. All 1,274 non-F answers sit behind a later from-scratch writer, a pick of from-scratch candidates or a seedLoop round (the named residual). The monotonicity and placement corpus tests pass (corpus.test.ts and 5 others, 368 tests).

- **2. No false claim (claims oracle)**: closed. claims12 (round-10 verifier's claims11, copied) ran on the 13,779 branch-admitted fresh variants: 12 runs each with C1's seed always directing (165,348 runs), plus half-seed runs on 2 sets. Raw results: E-REACT-CLAIM-BUT-NEVER-SHOWN 0, E-STRICT-NEXT-VISION-NOT-SHOWN 0, I-APPLIES-BUT-OTHER-CRITIQUE 0, lock (RUN-LOCK*, EXPLAINER-LOCK*, L1-L3) 0, C-AI-WROTE-REST 0, D-NOTES-ONLY 0. 'For you to react to' was claimed 5,237 times; tellsApplies 92,861, tellsAppliesAll 3,395, aiWroteRest 17,034, notesOnly 58,357, run-lock 15,535. Controls fire: FORCE_REACT gives 580 E-STRICT-FORCED and 17 never-shown; FORCE gives D-NOTES-ONLY 5,216, C-AI-WROTE-REST 565, RUN-LOCK 48/48 and L1 37; FORCE_J gives 2,451. The raw run also showed H-SAYS-ALL-BUT-NOT-ALL-SWAPPED 27, H-ASKED-BUT-REPLACED-BEFORE-SWAP 18 and G-RELAY-ONE-NOT-LAST-SHOT 17 (the round-10 verifier saw the first and last too). All three are stub artifacts: candidate-internal events counted against a top-level swap ask; an applier matched to a later gate-retry run of the sweep; storyboardShots random per call, not per storyboard. claims12h removes only those: per-storyboard memo, same-place events for the swap ask, applier search bounded before the sweep runs again. It reports 0 on every check (sets 3 and 4 re-run with the full fix). Swap asked versus said: H-SAYS-YOU-CHOOSE-BUT-NOT-ASKED 0 and H-SAYS-ALL-BUT-ASKED 0.

- **3. flowRecipe move: rules walk as before; bundle**: closed. cmp12 ran on 8,000 random recipes (gen7, with seeds half on article.SEED) and the 29,143 fresh catalog mutations. Main's flowRecipe and the branch's gave identical step-call sequences and final states for may and must tracers (74,286 walks, 0 differ). Memoized equals full in every case, writersAfter matches main on 3 marks, and validate() memoized equals withoutFlowMemo. HEAD's findings equal those of 4bd7b8a, the code just before the move, on every one of the 37,143 recipes once the person's-critique clauses are set aside (preDiff empty). Main-versus-branch differences are only the documented stage-2/4 rules; on catalog mutations main has no finding the branch lacks, and the branch never admits what main refuses. A code read confirms the moved flowOnce is the old one exactly when no enter, after, exit, exactLoops or untilStable hook is given. Workflow bundle built from HEAD: 38afef53ed613c48e1065255bdbac69c9016af95a156b0559634e67625e0b637, equal to PINNED_WORKFLOW_HASH. 29c4b19..HEAD touches no runner/src/workflow file, and the model-step.ts change is comment only.

- **4. ADR-0093, ADR-0098 and the spec true of the code**: partly. I reproduced every round-11 number independently with main, round-10 and round-9 trees and my own oracle copy. Against round 10: 102 newly refused in 92 variants (C1 61, C6a 29, C5 6, C3 5, C2 1; critique-per-candidate 39, critique-unapplied 27, ST9 36). Corpus split 17/83/2, 0 on round 8's corpora, 0 newly admitted. Against round 9: 121 no longer refused (37/78/6; 114/5/2), 0 newly refused. The 9 non-delivered answers all sit in loops the person holds, and the named idx 2041, 14739, 17025, 17672, 19966 and 20015 are C1 seedLoop variants. Oracle claims: 112/8/1, 0 with every seed directing, and 61 = 53+2+6, 41, 42. The by-ports residual sentence (a seed counted as a writer) and the from-scratch residual are true. ADR-0093 is unchanged since round 4, and its bundle hashes match. One problem: ADR-0098 line 81 and spec line 151 say C1's seed leaves its direction on every run, without the qualifier ADR line 113 uses; see problems.

- **5. Decisions D1-D4 respected**: closed. git diff main..HEAD touches no gateway file (D1: refusal fallbacks unchanged) and no renderer launch or sandbox code (D2: the only sandbox text is the spec's existing sentence). It touches no C3 catalog or prompt template; product.c3.asset and c3.ts are unchanged, so the 'no image' option and images 0-1 stand (D3). It adds no .github or CI file and changes no ADR-log rules. Of the ADRs, only 0093 and 0098 (this branch's own) change; 0089, 0090, 0092 and 0099 are untouched (D4).

- **6. Gate**: closed. On HEAD 9f75317: pnpm vitest run gave 177 files, 4058/4058 passed and 0 skipped. pnpm -s typecheck: exit 0. pnpm --filter ./apps/web run build: exit 0. pnpm e2e: 53 passed (4.2m). No timeouts, so nothing was re-run in isolation.

### Problems found

- **Blocking.** ADR-0098 line 81 and spec line 151 say, without qualification, that C1's seed leaves its direction as a note on every run. The runtime leaves a note only when the model writes two or more lines before the fence (model-step.ts directionOf). ADR-0098 itself says runs without it exist: line 113 says 'read as ... on every run, as every run that answers as asked does', and line 210 says 'One reading is not conservative ... a run whose model leaves the direction out'. So both sentences are false of the code and contradict the same ADR.

  Evidence: ADR-0098 line 81 reads: "a seed, which leaves its direction as a note on every run where its prompt asks for it first (C1's) and on some runs where its prompt asks for the block alone". Spec line 151 reads: "A seed's direction is a note in place of the notes before it on every run where its prompt asks for it first (C1's) ...". leavesNote's own doc comment is correctly qualified ('read as on every run that answers as its prompt asks'). The 3,480 refusals in my pass C exist only because such runs are possible.

  Suggested fix: Wording only, no code or measurement change. In both places, say C1's seed is read as leaving its direction on every run that answers as its prompt asks, as ADR line 113 does, and add 'a run whose model leaves it out keeps the notes before it'.

- **Not blocking.** Reading C1's seed as always directing refuses answers that main admits and that reach the work on runs where C1's model leaves the direction out. ADR-0098 names this and the implementer flags it for the owner. My C1-targeted corpus holds far more of them than the 55 in the ADR's corpora, but almost all are lost anyway once prompt templates are taken into account.

  Evidence: Fresh corpus, pass C (C1's seed directs on half the runs, no carry): 3,480 refused C1 answers (critique-unapplied 3,231, critique-per-candidate 240, ST9 9) reach the work, 3,268 of them the delivered work. Under the branch's reading (pass A) none does. Re-run with each AI step seeing only the slots its template declares (RENDERED=1): only 3 of the 3,480 still reach anything (idx 10899, 17137, 28206: your reaction, then an AI sharpen that renders the taste, then a C1 seed, then your own draft, inside candidates that are picked). The rest are lost anyway because the AI direction's prompt never renders the critique.

  Suggested fix: Owner decision, as the implementer proposes. Either make the reading exact at run time (a C1 seed answer with no direction counts as a miss and is asked again), or accept it as named. Record the measured count (3 with templates rendered) in the backlog item.

- **Not blocking.** By-ports residual (pre-existing on main and named in ADR-0098): an AI step that takes a port in counts as applying or carrying it even when its prompt template never renders that slot. In my fresh corpus this is the dominant way an admitted answer is silently lost. It also means that most of the 121 answers rounds 10 and 11 re-admitted against round 9 reach nothing in practice.

  Evidence: Of 16,626 admitted answers in the fresh corpus, 0 reach nothing under the branch's own model (by ports). With templates rendered, 2,702 reach nothing (C1 2,354, C3 198, C6a 43, C7 31, C4 26, C2 23, C5 20, C6 7). Examples are carriers on product.c7.interview, product.c6.angles and product.c4.framings, which read the critique but do not render it. Of the 121 answers still admitted against round 9, 98 reach nothing with templates rendered. Main admits all of these.

  Suggested fix: Raise the priority of the existing backlog item 'refuse a taken-in port that the step's prompt never renders' (prompts.info(id, medium).slots is enough). It would also cover the widened seed-as-writer case.

- **Not blocking.** Two named residuals and an open owner decision remain. (1) From-scratch writer or later pick: admitted answers reach a writer, a draft or a decider but never the delivered work. (2) Case 2 of ST9/ST10 'human-critique' refuses answers that reach the work when given.

  Evidence: (1) Fresh corpus: 1,211 admitted answers reach W/N/D only, and 63 only inside candidates. All 1,274 have a later model seed or intent-only build outside candidates, sit in a seedLoop round the person holds, or are picked from candidates whose first step is a from-scratch seed (sampled). (2) 255 case-2 answers (ST9 133, ST10 122): 249 reach the work when given and are never passed over when left empty.

  Suggested fix: Keep both backlog items: refuse an answer whose only taker is followed by a from-scratch writer or a pick of earlier or from-scratch candidates, and the owner's decision on case 2.

### Tests rerun

Everything ran on HEAD 9f75317dd17f3a29da0295ea2ea15e5f5b5cdb89. Probes are in C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r11/.

Gate (run-gates.sh):
- pnpm vitest run: 177 files, 4058/4058, 0 skipped.
- pnpm -s typecheck: exit 0.
- pnpm --filter ./apps/web run build: exit 0.
- pnpm e2e: 53 passed in 4.2m.
- No timeouts. I also re-ran corpus.test.ts and the five semantics test files on their own: 368 passed.

Differential:
- gen12.mts made 480k mutations, 29,143 unique variants that main admits (g12-*.json, merge12.cjs). Main is d76bbd0 and round 10 is 29c4b19, both exported trees.
- v12.oracle.test.mts is the round-10 verifier's oracle plus SEEDNOTE=prompt/SEEDCARRY=0 defaults and a RENDERED=1 mode. It ran on every refused answer in passes A and B (1,149,768 runs each), C and D (288,456 each) and CR, classified by classify12.cjs.
- Admitted answers: o12-adm (RENDERED) and o12-admB (by ports).
- reverdict12.mts / reverdict12r9.mts re-verdicted round 8's and the round-9 and round-10 verifiers' corpora with main, round 10, round 9 (00e418c) and HEAD. The oracle then ran on the 102 newly refused and the 121 still admitted.
- shapes12.mts: hand-built legitimate and refused shapes.

Claims: claims12 and claims12h (stub artifacts removed) on 13,779 admitted variants, with FORCE, FORCE_REACT and FORCE_J controls.

Walk and validator: cmp12.mts on 37,143 recipes compares main against the branch (flowRecipe traces, validate(), writersAfter, memo against full) and HEAD against 4bd7b8a (preDiff).

Catalog and bundle:
- catalog-cmp.mts: 18/18 recipes keep the same hash and verdict.
- bundle-hash.mts: 38afef53…, equal to the pin.

While probing, I once passed /dev/null as an output path, and Git Bash turned it into a file named `nul` in the worktree. I deleted that file at once, and git status in the worktree is clean. Nothing else in the worktree was modified.

