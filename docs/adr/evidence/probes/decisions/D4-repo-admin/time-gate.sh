#!/usr/bin/env bash
# Times each step of `pnpm verify` in this agent's worktree, then the unit suite with two workers
# (a stand-in for a 2-vCPU GitHub-hosted runner). Logs go next to this script.
WT="C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-5"
OUT="C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/decisions/D4-repo-admin"
cd "$WT" || exit 1
step() {
  local name="$1"; shift
  local s=$(date +%s)
  "$@" > "$OUT/$name.log" 2>&1
  local rc=$?
  echo "$name exit=$rc secs=$(( $(date +%s) - s ))" | tee -a "$OUT/timings.txt"
}
: > "$OUT/timings.txt"
echo "start $(date -Iseconds)" >> "$OUT/timings.txt"
step typecheck pnpm -s typecheck
step vitest pnpm test
step e2e pnpm e2e
step vitest-2workers pnpm vitest run --maxWorkers=2
echo "end $(date -Iseconds)" >> "$OUT/timings.txt"
