#!/usr/bin/env bash
cd "$(dirname "$0")"
F=C:/Users/arvik/code/byway/.worktrees/fx-b2f-prices/scripts/price-report.ts
T=scripts/test/price-report.test.ts
m() { printf '%s' "$2" > o.txt; printf '%s' "$3" > n.txt; echo "== $1"; node mut.mjs "$F" o.txt n.txt "$T" 2>/dev/null | grep -E "CAUGHT|SURVIVED|NOT APPLIED|×|restored"; }
m "M17 the log's and summary's lines not made plain" "const lines = sections.flatMap((s) => s.lines).map(plain);" "const lines = sections.flatMap((s) => s.lines);"
m "M18 the warning's lines not made plain" "? s.lines.map(plain) : []" "? s.lines : []"
m "M19 control characters kept" "    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')" "    .replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ')"
m "M20 a leading :: kept" "    .replace(/^(\s*):(?=:)/, '\$1: ')" "    .replace(/^(\s*):(?=:)/, '\$1:')"
m "M21 ##[ kept" "    .replace(/##\[/g, '## [');" "    .replace(/##\[/g, '##[');"
