#!/usr/bin/env bash
cd "$(dirname "$0")"
F=C:/Users/arvik/code/byway/.worktrees/fx-b2f-prices/scripts/price-report.ts
T=scripts/test/price-report.test.ts
m() { printf '%s' "$2" > o.txt; printf '%s' "$3" > n.txt; echo "== $1"; node mut.mjs "$F" o.txt n.txt "$T" 2>/dev/null | grep -E "CAUGHT|SURVIVED|NOT APPLIED|×|restored"; }
m "M11 a replaced row still checked" "((r.from !== undefined && r.from > today) || inForce(r, now))" "true"
m "M12 a row still to come not checked" "((r.from !== undefined && r.from > today) || inForce(r, now))" "inForce(r, now)"
