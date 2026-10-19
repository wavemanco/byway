# F07's arbiter corpus

The pages, generators, hand cases and oracles that F07's fix rounds 12 to 14 ran page VOICE against ([ADR-0081](../../../../docs/adr/0081-voice-writes-the-persons-copy-exactly.md)), and every answer's outcome in round 14's run of the realistic pages. Run it again before any Playwright upgrade: the skeptic of the held questions' brief advised keeping it in the repository for that (2026-10-16, [decision-briefs-2026-10-16.md](../../../../docs/adr/evidence/decision-briefs-2026-10-16.md#the-held-questions)). Claude adds: and when a change touches how page VOICE reads or writes a page (`page-copy.ts`, `page-arbiter.ts`, `pages.ts`, `copy.ts`), since nothing else in the repository runs the arbiter on pages like these.

It does not run with `pnpm test` or `pnpm verify`: the realistic pages alone take hours, and every page needs the runner's Chromium. The files are `.mts`, so neither the typecheck nor vitest picks them up.

Until 2026-10-18 this existed only under the Windows Temp folder (`C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/runner-copy/r13/ev/` and `r14/ev/`, and the round-4 to round-6 verifiers' case files in `scratch/verify-F07-r4/` to `verify-F07-r6/`). The files are copied unchanged but for their paths: they import the runner from this folder (`../../src/…`, `../helpers/voice-activity.ts`) and Playwright as the runner resolves it, and they write their outputs outside the repository, to `$F07_OUT` (default: the system's temp folder, `byway-f07/`) or the folder each command names.

## What is here

| | |
|---|---|
| `pages/` | The 46 realistic pages, byte for byte as round 14 read them (`.gitattributes` keeps their line ends) |
| `pages-verifier/` | The round-13 verifier's own four realistic pages |
| `act12.mts`, `act13.mts` | The real page VOICE activity (`openCheckpoint` and `finishHumanStep` through the runner's test helper, the runner's Chromium as the arbiter): one opened question per page, each answer tried against it |
| `real14r.mts` | Round 14's runner for the realistic pages: each offered line edited six ways (a word, appended, inserted, punctuation, rewritten, deleted), every stored write and every refusal, placed again, judged; a crashed oracle or Chromium is started afresh and that visit or answer made again |
| `oracle12.mts`, `judge12.mts` | The round-11 verifier's oracle: what a visitor sees, decided by paint |
| `vo13.mts`, `judge13.mts` | The round-12 verifier's oracle, written apart from both the arbiter and `oracle12`: the page's scripts on the real clock, vertical and turned text |
| `gen13.mts` | The round-11 verifier's generator (modes `atk`, `lv`, `xv`, `mix`, `x`, `glue`, `links`), judged by `oracle12` |
| `gen-v14.mts` | The round-12 verifier's generator (mode `r12`: rotated, vertical, motion-only and nudged rows), judged by `vo13` |
| `cases13.mts`, `cases/verify-F07-r4/` to `r6/` | Every hand case the round-4 to round-6 verifiers wrote, judged by `oracle12` |
| `hand12.mts`, `cases/cases-*.mts` | The hand cases round 12 ran (the round-11 verifier's and earlier rounds'), judged by `oracle12` |
| `hand13.mts`, `vcases/` | The round-12 verifier's hand cases (`cases-a` to `cases-h`), the round-6 verifier's reproductions (`cases-r6orig`) and the round-11 verifier's (`r11-cases-*`), judged by `vo13` |
| `run-realistic.sh` | Runs the realistic pages in round 14's groups, then `compare.mjs` |
| `compare.mjs`, `expected/round14.json` | Each answer's outcome in round 14's realistic runs (round 14's final code, 6285122; from its `out/real14b`), and the comparison of a new run with it |
| `compare-hand.mjs`, `expected/round13-hand.json` | Each hand case's outcome in round 13's runs (40c076c, and 5e3543f for hand13's `cases-c` and `cases-d`, which round 13 ran again there), and the comparison of a new run with it |

## Running it

The realistic pages, compared with round 14, from the repository's root:

```sh
bash packages/runner/test/f07-corpus/run-realistic.sh [out-folder]
```

`WORKERS` sets how many groups run at once (default 4; round 14 found that more than about 6 lose groups to crashed browsers). A group already begun in the out folder is skipped, so a second command on the same folder adds workers; to finish a stopped run, remove the stopped groups' locks and outputs and run it again on the folder. The second oracle's groups (`V…`) have one page each, as round 14 split them, because that oracle is slow. At the end `compare.mjs` prints every answer whose outcome differs from round 14's, or that round 14 did not have, and how many of round 14's answers the run is missing, and exits 1 if there is any of these. An outcome is a stored write with its oracle's verdict, a refusal by the arbiter with its reason, or a refusal by the reader or placement (the start of its message).

The generators and the hand cases, from `packages/runner`, as round 13 ran them (`OUT=…` names where each writes):

```sh
EDGE_TYPED=1 OUT=<out>/gen/atk-edge-12101 npx tsx test/f07-corpus/gen13.mts 12101 300 atk
OUT=<out>/gen/atk-12102 npx tsx test/f07-corpus/gen13.mts 12102 300 atk
EDGE_TYPED=1 OUT=<out>/gen/lv-edge-12103 npx tsx test/f07-corpus/gen13.mts 12103 300 lv
EDGE_TYPED=1 OUT=<out>/gen/xv-edge-12104 npx tsx test/f07-corpus/gen13.mts 12104 300 xv
EDGE_TYPED=1 OUT=<out>/gen/mix-edge-12105 npx tsx test/f07-corpus/gen13.mts 12105 300 mix
EDGE_TYPED=1 OUT=<out>/gen/x-edge-12106 npx tsx test/f07-corpus/gen13.mts 12106 300 x
OUT=<out>/gen/glue-12107 npx tsx test/f07-corpus/gen13.mts 12107 300 glue
OUT=<out>/gen/links-12108 npx tsx test/f07-corpus/gen13.mts 12108 300 links
EDGE_TYPED=1 OUT=<out>/genv/r12-edge-13101 npx tsx test/f07-corpus/gen-v14.mts 13101 300 r12
OUT=<out>/genv/r12-13102 npx tsx test/f07-corpus/gen-v14.mts 13102 300 r12
EDGE_TYPED=1 OUT=<out>/genv/r12-edge-13201 npx tsx test/f07-corpus/gen-v14.mts 13201 300 r12
OUT=<out>/genv/r12-13202 npx tsx test/f07-corpus/gen-v14.mts 13202 300 r12
CASES_OUT=<out>/cases/cases13.json npx tsx test/f07-corpus/cases13.mts
HAND_OUT=<out>/cases npx tsx test/f07-corpus/hand12.mts cases-h1.mts   # and cases-h2 to h5, cases-r10h1, cases-r6, cases-sliver
HAND_OUT=<out>/cases-v npx tsx test/f07-corpus/hand13.mts cases-a.mts  # and every other file in vcases/
```

Each generator job took about half an hour on the owner's machine in round 13. Then, for the hand cases:

```sh
node test/f07-corpus/compare-hand.mjs <out>
```

It prints every case whose outcome differs from round 13's and exits 1 if there is any. An outcome is cases13's outcome, or hand12's and hand13's kind with the oracle's verdict, or "NOT TRIED" with the lines offered when the case's answer does not fit the offer.

## What a pass means

For the realistic pages, `compare.mjs` finds every answer's outcome as in round 14; for the hand cases, `compare-hand.mjs` finds every case's as in round 13. Neither record is all clean: ADR-0081 lists what its oracles judged otherwise and how each class was settled (by a plain look at the written page, an HTML diff and the other checks it names), and its "not checked" list. A changed outcome is a change in what the arbiter does, or in what an oracle sees, to be settled the same way. Both scripts print the second kind (the same write stored, or the same refusal, with the oracle's verdict alone differing) as `VERDICT DIFFERS`, and the first as `DIFFERENT`. The second oracle (`vo13`) runs the page's scripts on the real clock, and its verdict on a few cases varies from run to run (below): expect `VERDICT DIFFERS` lines from it on the portfolio and grill pages, and on hand13's `cases-b` case `nudge-left-link-typed-after`, so a run can exit 1 on those alone.

The generators have no recorded outcome to compare with: their outputs are tallies, and ADR-0081's numbers for them come from round 13's code. Their outputs list every stored write an oracle judged otherwise and every refusal; read them as ADR-0081 describes.

## Runs on this repository's code

On 2026-10-18 and 19, on the owner's Windows machine, on this branch's code (its runner is main's at 8401820):

- The realistic pages, with `run-realistic.sh` (5 workers; the second oracle's groups were then split by page, as the script now has them): all 10,055 of round 14's answers, the arbiter doing as in round 14 on every one. 9,991 outcomes are round 14's. On the other 64, stored both times, `vo13`'s verdict differed: 12 on the portfolio page and 52 on the grill page (`y3-gsap-zoom-sticker.html`), the two pages whose CSS ticker ADR-0081 names as the cause of most of that oracle's flags in round 14. In a second run of the grill page alone, the arbiter again did as in round 14 on all 171 of its answers, and `vo13`'s verdict differed from the first run's on 102 of them (from round 14's on 87): on that page its verdict varies from run to run.
- The hand cases, every file: 745 of the 746 cases as in round 13. The other, hand13's `cases-b` case `nudge-left-link-typed-after`, was refused by the arbiter with round 13's message, and `vo13` judged the refused write, placed again, GLUED where round 13's run had it ok. In two more runs of `cases-b` it judged it ok.
- The generators, a few pages each, to show they run (round 13 ran 300 pages a job): of 18 edits, `gen13.mts 12101 6 atk` with `EDGE_TYPED=1` stored 15, all judged ok, wrote nothing for 2 and refused 1 (it would have left a button empty); `gen-v14.mts 13102 6 r12` stored 15, of which `vo13` judged 14 ok and one, in vertical text, SPLIT, and wrote nothing for 3.

## Not kept

The runs' outputs, logs and screenshots (`out/`, among them `out/adjudge` and the first wave's `out/real`); the scripts that settled the oracles' findings by class (`classify.cjs`, `classes.cjs`, `look-real.mts`, `look-refused.mts`, `shot-json.mts`, `unturn.mts`, `cycleview.mts`, `genview.mts`, `genview-real.mts`, `cmp13b.cjs`, `cmpkind.cjs`, `diffcheck14.cjs`, `diffcheck.cjs`, `judge-self.mts`); `sameread.mts` and `sameread14.mts`; and the round-13 verifier's harness and probes (`real15.mts`, `judge-all.mts`, `run14.mts`, `vo14.mts`, `atk1`, `atk2`, `atk4`, `atk5`, `probe-3d`, `probe-ellipsis`, `probe-ellipsis-zoom`, `probe-zoomclip`). They were local working files.
