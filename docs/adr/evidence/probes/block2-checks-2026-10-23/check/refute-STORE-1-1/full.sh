#!/usr/bin/env bash
# Full unmutated `pnpm e2e` in the refute-STORE-1-1 clone, with timestamped output and a poller on the server log.
set -u
BASE=/c/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b2check-clones
CLONE="$BASE/refute-STORE-1-1"
TMPD="$BASE/refute-STORE-1-1-tmp"
OUT="$BASE/refute-STORE-1-1-e2e-full.log"
POLL="$BASE/refute-STORE-1-1-srvpoll.log"
DONE="$BASE/refute-STORE-1-1-done"
LOGF="$TMPD/byway-e2e-server.log"
cd "$CLONE" || exit 2
[ "$(git rev-parse HEAD)" = 160c02761212dd39b822c9247ebdfce9deacb536 ] || exit 3
git diff --quiet || exit 4
export TEMP="$(cygpath -w "$TMPD")" TMP="$(cygpath -w "$TMPD")"
rm -f "$LOGF" "$DONE"
: > "$POLL"
(
  seen=0
  while [ ! -f "$DONE" ]; do
    if [ -f "$LOGF" ]; then
      n=$(grep -c "" "$LOGF" 2>/dev/null || echo 0)
      if [ "$n" -gt "$seen" ]; then
        sed -n "$((seen+1)),${n}p" "$LOGF" | grep -E "^  (engine|web|renderer|checked)" | while IFS= read -r l; do echo "$(date +%T) $l"; done >> "$POLL"
        seen=$n
      fi
    fi
    sleep 1
  done
) &
echo "$(date +%T) start" > "$OUT"
pnpm e2e 2>&1 | while IFS= read -r l; do echo "$(date +%T) $l"; done >> "$OUT"
echo "$(date +%T) end" >> "$OUT"
touch "$DONE"
wait
