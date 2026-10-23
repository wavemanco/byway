#!/usr/bin/env bash
cd "$(dirname "$0")"
F=C:/Users/arvik/code/byway/.worktrees/fx-b2f-prices/scripts/price-report.ts
T=scripts/test/price-report.test.ts
m() { printf '%s' "$2" > o.txt; printf '%s' "$3" > n.txt; echo "== $1"; node mut.mjs "$F" o.txt n.txt "$T" 2>/dev/null | grep -E "CAUGHT|SURVIVED|NOT APPLIED|×|restored"; }
m "M14 an unread page does not call for the re-read" "const flagged = sections.some((s) => s.flagged || s.unread);" "const flagged = sections.some((s) => s.flagged);"
m "M15 an unread page left out of the warning" "(s.flagged || s.unread || (i === 0 && due) ? s.lines : [])" "(s.flagged || (i === 0 && due) ? s.lines : [])"
m "M16 the whole report's failure not marked unread" "sections.push({ flagged: false, unread: true, lines: [\`The price report" "sections.push({ flagged: false, lines: [\`The price report"
