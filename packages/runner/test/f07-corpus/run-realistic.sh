#!/usr/bin/env bash
# F07's realistic pages through the real page VOICE activity, in round 14's groups: every page judged by oracle12
# (groups G…), and the pages with vertical or turned text and the round-12 verifier's own four judged again by vo13
# (groups V…, one page each, as round 14 split them: the second oracle is the slow one). Then compare.mjs compares
# each answer's outcome with round 14's.
#
# Usage, from anywhere: bash packages/runner/test/f07-corpus/run-realistic.sh [out-folder]
#   (a relative out-folder is taken from where the command is run)
#   WORKERS  groups run at once (default 4; round 14 found more than about 6 lose groups to crashed browsers)
#   KINDS    the edits tried on each offered line (default all six: word,append,insert,punct,rewrite,delete)
# A group already begun in the out folder is skipped, its log untouched (its lock is beside its outputs), so a second
# command on the same folder adds workers. To finish a stopped run, remove the stopped groups' locks and outputs and run
# again on the folder; remove the folder to run everything again.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-${TMPDIR:-/tmp}/byway-f07-realistic}"
WORKERS="${WORKERS:-4}"
mkdir -p "$OUT"
# Absolute, because what follows runs from packages/runner.
OUT="$(cd "$OUT" && pwd)" || exit 1
cd "$HERE/../.." || exit 1
git rev-parse HEAD > "$OUT/commit.txt" 2>/dev/null
P=test/f07-corpus/pages
jobs() {
  cat <<JOBS
G01 c-custom.html,g-saas.html,i-blog.html,v4-carousel-marquee.html
G02 r1-bakery-reveal.html,r1b-reveal-rm-durations.html
G03 r1c-reveal-rm-visible.html,r1d-reveal-js-class.html
G04 r2-bakery-plain.html,r3-saas-twbrowser.html,n7-tw-cards.html
G05 n1-agency-tw-aos.html,n2-saas-grid-reveal.html,n3-restaurant-flex.html,n4-portfolio-tw.html
G06 w1-tailwind-landing.html,w2-bootstrap-trattoria.html,d-bootstrap.html
G07 w3-portfolio-reveal.html,w4-arabic-cafe.html,w5-event-gsap.html,w6-bakery-hours.html
G08 e-tailwind.html,f-menu-table.html,h-restaurant.html,n5-launch-scripted.html,n6-bistro-menu.html
G09 v1-letter-split.html,v2-aos-slide.html,v3-alpine-tabs.html,v5-gsap-countup.html,v5a-nofa.html,v5b-nogsap.html
G10 n8-studio-gsap.html,x3-gsap-stagger-hero.html
G10v6 v6-gsap-heavy.html
G11 x1-tw-pricing-pulse.html,x2-hebrew-bakery.html,x4-tw-roaster-fade.html
G12 p1-cafe.html,p2-pricing.html,p3-portfolio.html,p4-event.html
G13 y1-tw-studio-turned.html,y2-ja-bakery-vertical.html,y3-gsap-zoom-sticker.html
V12a p1-cafe.html
V12b p2-pricing.html
V12c p3-portfolio.html
V12d p4-event.html
V13a y1-tw-studio-turned.html
V13b y2-ja-bakery-vertical.html
V13c y3-gsap-zoom-sticker.html
JOBS
}
run() {
  local name=$1 files=$2
  [ -e "$OUT/$name.lock" ] && return 0
  if [ "${name:0:1}" = V ]; then export ORACLE=vo13; else unset ORACLE; fi
  # Round 14 ran v6-gsap-heavy, the heaviest page, with four kinds of edit only.
  if [ "$name" = G10v6 ] && [ -z "${KINDS:-}" ]; then export KINDS=word,append,punct,delete; fi
  [ -z "${KINDS:-}" ] && unset KINDS
  REAL_OUT="$OUT" npx tsx test/f07-corpus/real14r.mts "$name" "$P" "$files" >> "$OUT/$name.log" 2>&1
  local rc=$?
  echo "$(date +%H:%M:%S) $name exit $rc" >> "$OUT/done.txt"
}
export -f run
export OUT P KINDS
jobs | xargs -P "$WORKERS" -L 1 bash -c 'run "$0" "$1"'
node test/f07-corpus/compare.mjs "$OUT"
