#!/usr/bin/env bash
# mutate-lit.sh <file> <old-file> <new-file> <label> <tests...>: replaces one literal text, runs the tests, restores.
set -u
W=/c/Users/arvik/code/byway/.worktrees/fx-b2-prices
S=/c/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b2-prices
file=$1; old=$2; new=$3; label=$4; shift 4
cp "$W/$file" "$S/backup.tmp"
node -e "const fs=require('fs');const [f,o,n]=process.argv.slice(1);const s=fs.readFileSync(f,'utf8');const a=fs.readFileSync(o,'utf8').replace(/\n$/,'');const b=fs.readFileSync(n,'utf8').replace(/\n$/,'');if(s.split(a).length!==2){console.error('not exactly once');process.exit(1)}fs.writeFileSync(f,s.replace(a,()=>b));" "$W/$file" "$old" "$new" || { echo "MUTATION $label: DID NOT APPLY"; exit 1; }
cd "$W" && timeout 600 pnpm exec vitest run "$@" > "$S/mut-$label.log" 2>&1
echo "MUTATION $label:"; grep -E '^\s+×|Tests\s' "$S/mut-$label.log" | head -25
cp "$S/backup.tmp" "$W/$file"
cmp -s "$W/$file" "$S/backup.tmp" && echo "restored $file"
