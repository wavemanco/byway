#!/usr/bin/env bash
# The final code's evidence: the five rewritten tests with Chromium throttled 4 times, the whole file under 32 busy
# processes, then the gate. Summary in final-summary.txt.
set -u
WT=/c/Users/arvik/code/byway/.worktrees/fx-ci-timing
B=/c/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ci-timing/build
cd "$WT" || exit 1
S=$B/final-summary.txt
: > "$S"
git diff --quiet -- packages/runner/src || { echo "source changed: stop" >> "$S"; exit 1; }
FIVE='never settles|step is cancelled$|capped number|right-to-left page|share a deadline'

T=packages/runner/test/zz-throttled-pages.test.ts
node "$B/make-throttled.mjs" "$T" > /dev/null
BYWAY_TEST_THROTTLE=4 pnpm exec vitest run "$T" -t "$FIVE" --reporter=verbose > "$B/30-final-five-throttled-4.log" 2>&1
echo "five, Chromium throttled 4x: exit $?" >> "$S"
rm -f "$T"

pids=""
for i in $(seq 1 32); do node "$B/burn.js" 1200 & pids="$pids $!"; done
start=$(date +%s)
pnpm exec vitest run packages/runner/test/pages.test.ts --reporter=verbose > "$B/31-final-pages-load-32.log" 2>&1
code=$?
kill $pids 2>/dev/null
wait 2>/dev/null
echo "whole file, 32 busy processes: exit $code in $(( $(date +%s) - start )) s" >> "$S"

pnpm -s typecheck > "$B/32-gate-typecheck.log" 2>&1; echo "gate typecheck exit $?" >> "$S"
pnpm exec vitest run > "$B/32-gate-vitest.log" 2>&1; echo "gate vitest exit $?" >> "$S"
pnpm --filter ./apps/web run build > "$B/32-gate-build.log" 2>&1; echo "gate build exit $?" >> "$S"
pnpm e2e > "$B/32-gate-e2e.log" 2>&1; echo "gate e2e exit $?" >> "$S"
git status --short >> "$S"
echo done >> "$S"
