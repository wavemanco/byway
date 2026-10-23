#!/usr/bin/env bash
# mutate.sh <file> <perl-expr> <label> <test files...>: applies one mutation, runs the tests, restores the file.
set -u
W=/c/Users/arvik/code/byway/.worktrees/fx-b2-prices
S=/c/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b2-prices
file=$1; expr=$2; label=$3; shift 3
cp "$W/$file" "$S/backup.tmp"
perl -0pi -e "$expr" "$W/$file"
if cmp -s "$W/$file" "$S/backup.tmp"; then echo "MUTATION $label: DID NOT APPLY"; cp "$S/backup.tmp" "$W/$file"; exit 1; fi
cd "$W" && timeout 600 pnpm exec vitest run "$@" > "$S/mut-$label.log" 2>&1
echo "MUTATION $label:"; grep -E '^\s+×|Tests\s' "$S/mut-$label.log" | head -25
cp "$S/backup.tmp" "$W/$file"
cmp -s "$W/$file" "$S/backup.tmp" && echo "restored $file"
