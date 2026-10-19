#!/usr/bin/env bash
# Fresh corpus for the ports-rendered differential: 16 x 40,000 mutations, main (00a8a4c tree) against the worktree.
V=/c/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered
cd /c/Users/arvik/code/byway/.worktrees/fx-ports-rendered || exit 1
g() { NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsx --import file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/trees-register.mjs $V/gen-pr.mts "$@"; }
: > $V/run-gen.status
for k in $(seq 1 16); do
  ( g 40000 $((9100003 + k * 130363)) $V/gp-$k.json > $V/gp-$k.log 2>&1; echo "gp-$k $?" >> $V/run-gen.status ) &
done
wait
echo done >> $V/run-gen.status
