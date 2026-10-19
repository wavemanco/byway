#!/usr/bin/env bash
# Re-verdict the round-11 verification's 13,779 variants (admitted by main) with main and this worktree.
V=/c/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered
cd /c/Users/arvik/code/byway/.worktrees/fx-ports-rendered || exit 1
: > $V/run-rv.status
for k in 0 1 2 3 4 5; do
  ( NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsx --import file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/trees-register.mjs $V/reverdict-pr.mts C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r11/g12-admitted.json $V/rv11-$k.json $((k * 2300)) 2300 > $V/rv11-$k.log 2>&1; echo "rv11-$k $?" >> $V/run-rv.status ) &
done
wait
echo done >> $V/run-rv.status
