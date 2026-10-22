#!/usr/bin/env bash
# Runs each mutation against the rewritten tests (and, where named, the old ones from a3bba97), one at a time, then
# restores the source. Logs go to mutations/<id>.<new|old>.log; a summary line per run to mutations/summary.txt.
set -u
WT=/c/Users/arvik/code/byway/.worktrees/fx-ci-timing
B=/c/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ci-timing/build
OUT=$B/mutations
mkdir -p "$OUT" "$B/backup"
cd "$WT" || exit 1
NEW=packages/runner/test/pages.test.ts
OLD=packages/runner/test/old-pages-a3bba97.test.ts

run() { # id which filter
  local id=$1 which=$2 filter=$3 file log
  [ "$which" = new ] && file=$NEW || file=$OLD
  log=$OUT/$id.$which.log
  if [ "$which" = old ]; then git show a3bba97:$NEW > "$OLD"; fi
  node "$B/mutate.mjs" apply "$id" > "$log" 2>&1 || { echo "$id $which: could not apply" >> "$OUT/summary.txt"; return; }
  timeout 600 pnpm exec vitest run "$file" -t "$filter" --reporter=verbose >> "$log" 2>&1
  local code=$?
  node "$B/mutate.mjs" restore "$id" >> "$log" 2>&1
  [ "$which" = old ] && rm -f "$OLD"
  local tests
  tests=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -a -E '^ +Tests ' | tr -s ' ')
  echo "$id $which exit=$code $tests" >> "$OUT/summary.txt"
  git diff --quiet -- packages/runner/src || echo "$id $which: SOURCE NOT RESTORED" >> "$OUT/summary.txt"
}

: > "$OUT/summary.txt"
run M1-no-deadline new 'never settles|share a deadline'
run M2-context-close-unbounded new 'never settles'
run M3-browser-close-unbounded new 'never settles'
run M4-browser-not-forgotten new 'never settles'
run M5-render-retried new 'never settles'
run M6-cancel-ignored new 'step is cancelled$'
run M7-no-stream-cap new 'capped number'
run M7b-cut-by-fetch-limit-not-cap new 'capped number'
run M7b-cut-by-fetch-limit-not-cap old 'capped number'
run M8a-sample-remeasures new 'right-to-left page'
run M8b-final-remeasures new 'right-to-left page'
run M8b-final-remeasures old 'right-to-left page'
run M8c-words-glued new 'right-to-left page'
run M9-shared-deadline-ignored new 'share a deadline'
run M9b-timer-ignores-shared-deadline new 'share a deadline'
run M9b-timer-ignores-shared-deadline old 'share a deadline'
echo done >> "$OUT/summary.txt"
