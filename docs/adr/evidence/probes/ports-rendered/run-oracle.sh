#!/usr/bin/env bash
# The execution oracle (round-11 verifier's v12, copied) over the fresh corpus:
#  refR: every answer the branch refuses, templates rendered (an AI step sees a text port only where its template has the slot);
#  refP: the same answers, read by ports (main's reading);
#  admR: every person's list or critique in the variants the branch admits, templates rendered;
#  proR: the same in the variants refused by COMPOSED-PROMPT alone.
V=C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered
cd /c/Users/arvik/code/byway/.worktrees/fx-ports-rendered || exit 1
job() { local name=$1 variants=$2 mode=$3 runs=$4 off=$5 lim=$6; shift 6
  env "$@" NODE_OPTIONS=--max-old-space-size=4096 ONLY=vpr.oracle.test.mts VARIANTS=$variants V9MODE=$mode RUNS=$runs OFFSET=$off LIMIT=$lim OUT=$V/$name.json pnpm exec vitest run --config $V/oracle.config.mjs > $V/$name.log 2>&1
  echo "$name exit $?" >> $V/run-oracle.status; }
: > $V/run-oracle.status
for k in 0 1 2 3 4 5 6 7; do ( job o-refR-$k $V/gp-refused.json refused 24 $((k * 1000)) 1000 SEEDNOTE=prompt SEEDCARRY=0 RENDERED=1 ) & done
for k in 0 1 2 3 4 5 6 7; do ( job o-refP-$k $V/gp-refused.json refused 24 $((k * 1000)) 1000 SEEDNOTE=prompt SEEDCARRY=0 RENDERED=0 ) & done
wait
for k in 0 1 2 3 4 5 6 7; do ( job o-admR-$k $V/gp-admitted.json admitted 16 $((k * 2600)) 2600 SEEDNOTE=prompt SEEDCARRY=0 RENDERED=1 ) & done
for k in 0 1; do ( job o-proR-$k $V/gp-promptonly.json admitted 16 $((k * 1200)) 1200 SEEDNOTE=prompt SEEDCARRY=0 RENDERED=1 ) & done
wait
echo done >> $V/run-oracle.status
