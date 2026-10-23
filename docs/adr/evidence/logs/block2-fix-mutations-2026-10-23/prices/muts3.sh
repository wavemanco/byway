#!/usr/bin/env bash
# PRICES-3 mutations: each pair of files is one exact replacement in price-report.ts; mut.mjs restores the file.
cd "$(dirname "$0")"
F=C:/Users/arvik/code/byway/.worktrees/fx-b2f-prices/scripts/price-report.ts
T=scripts/test/price-report.test.ts
m() { printf '%s' "$2" > o.txt; printf '%s' "$3" > n.txt; echo "== $1"; node mut.mjs "$F" o.txt n.txt "$T" 2>/dev/null | grep -E "CAUGHT|SURVIVED|NOT APPLIED|×|restored"; }
m "M6 Google's tier words anywhere in the text" "heading === undefined ? (stretch ?? '').includes(words)" "heading === undefined ? text.includes(words)"
m "M7 OpenAI's tier words anywhere in the markup" ": saidAbove(attributes, heading, name, words);" ": attributes.includes(words);"
m "M8 the switch read past the model's name" "markup.slice(start, at.index).includes(words)" "markup.slice(start).includes(words)"
m "M9 no check for a new tier on a row without one" "if (!row.longContext && page.byLength &&" "if (false && page.byLength &&"
m "M10 Anthropic's sentence cut back to its old fragment" "sentences: ['Claude 4.6 and later models (except Claude Haiku 5.5) and Claude Mythos Preview include the full 1M token context window at standard pricing']," "sentences: ['include the full 1M token context window at standard pricing'],"
