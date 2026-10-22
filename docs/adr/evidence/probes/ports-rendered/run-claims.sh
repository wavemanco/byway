#!/usr/bin/env bash
# The claims oracle (round-11 verifier's claims12h, copied, plus a RENDERED check that an applier said to apply a step's
# findings is shown the critique by its prompt's template) over the fresh corpus:
#  cl-adm: the variants the branch admits, with the branch's explainers;
#  cl-main: the variants the branch refuses, with main's explainers (PRES=main), the control for the new check;
#  cl-force: FORCE/FORCE_REACT/FORCE_J controls on the first 2,000 admitted variants.
V=C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered
cd /c/Users/arvik/code/byway/.worktrees/fx-ports-rendered || exit 1
job() { local name=$1 variants=$2 off=$3 lim=$4; shift 4
  env "$@" NODE_OPTIONS=--max-old-space-size=6144 ONLY=claims-pr.oracle.test.mts VARIANTS=$variants RUNS=12 OFFSET=$off LIMIT=$lim OUT=$V/$name.json pnpm exec vitest run --config $V/oracle.config.mjs > $V/$name.log 2>&1
  echo "$name exit $?" >> $V/run-claims.status; }
: > $V/run-claims.status
for k in 0 1 2 3 4 5 6 7; do ( job cl-adm-$k $V/gp-admitted.json $((k * 2600)) 2600 SEEDNOTE=prompt RENDERED=1 ) & done
for k in 0 1 2 3; do ( job cl-main-$k $V/gp-refused-mainpres.json $((k * 2000)) 2000 SEEDNOTE=prompt RENDERED=1 PRES=main ) & done
wait
( job cl-force $V/gp-admitted.json 0 2000 SEEDNOTE=prompt RENDERED=1 FORCE=1 ) &
( job cl-force-react $V/gp-admitted.json 0 2000 SEEDNOTE=prompt RENDERED=1 FORCE_REACT=1 ) &
( job cl-force-j $V/gp-admitted.json 0 2000 SEEDNOTE=prompt RENDERED=1 FORCE_J=1 ) &
wait
echo done >> $V/run-claims.status
