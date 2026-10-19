#!/usr/bin/env bash
# Second round of mutation runs, after the r11 mutation was corrected, the cap test's scripts were put in blocks of
# their own and the never-settles test releases its held closes with onTestFinished. Same layout as run-mutations.sh;
# summary in mutations/summary-2.txt.
set -u
WT=/c/Users/arvik/code/byway/.worktrees/fx-ci-timing
B=/c/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ci-timing/build
OUT=$B/mutations
cd "$WT" || exit 1
NEW=packages/runner/test/pages.test.ts
OLD=packages/runner/test/old-pages-a3bba97.test.ts

run() { # id which filter
  local id=$1 which=$2 filter=$3 file log
  [ "$which" = new ] && file=$NEW || file=$OLD
  log=$OUT/$id.$which.r2.log
  if [ "$which" = old ]; then git show a3bba97:$NEW > "$OLD"; fi
  node "$B/mutate.mjs" apply "$id" > "$log" 2>&1 || { echo "$id $which: could not apply" >> "$OUT/summary-2.txt"; return; }
  timeout 600 pnpm exec vitest run "$file" -t "$filter" --reporter=verbose >> "$log" 2>&1
  local code=$?
  node "$B/mutate.mjs" restore "$id" >> "$log" 2>&1
  [ "$which" = old ] && rm -f "$OLD"
  local tests hook
  tests=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -a -E '^ +Tests ' | tr -s ' ')
  hook=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -a -c 'Hook timed out')
  echo "$id $which exit=$code $tests (hook timeouts: $hook)" >> "$OUT/summary-2.txt"
  git diff --quiet -- packages/runner/src || echo "$id $which: SOURCE NOT RESTORED" >> "$OUT/summary-2.txt"
}

: > "$OUT/summary-2.txt"
run M2-context-close-unbounded new 'never settles'
run M3-browser-close-unbounded new 'never settles'
run M7b-cut-by-fetch-limit-not-cap new 'capped number'
run M8a2-sample-looks-again new 'right-to-left page'
run M8a3-sample-remeasures-all new 'right-to-left page'
echo done >> "$OUT/summary-2.txt"
