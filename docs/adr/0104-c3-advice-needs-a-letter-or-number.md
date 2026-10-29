# ADR-0104: C3's advice says something only with a letter or a number

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User-approved (the owner chose "fix all" on 2026-10-17 from the combined check's findings, this change among them) |
| **Date (local, UTC−7)** | 2026-10-17 11:06 |
| **Track** | Product |
| **Related** | [ADR-0101](0101-c3-yes-decides-the-header-image.md), [ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md), [ADR-0103](0103-adr-log-rule-and-ci.md) |

## Context

[ADR-0101](0101-c3-yes-decides-the-header-image.md) lets C3's image step carry one optional line of advice from the AI, shown in the step's note: "The AI suggests: … You can cut the image at Trim." Its Decision reads the advice as plain text and says that "advice with nothing readable in it (no letter, number, punctuation mark or symbol; blank letters such as U+3164 do not count)" is no advice. The line is held to 200 characters, "cut at a word with an ellipsis".

The combined adversarial check before D1 and D4 were first pushed (2026-10-17) found that this rule shows advice that says nothing:

- **Punctuation or symbols alone count as readable.** C3's answer format writes the field as `"advice":"…"`, so a model with no advice that copies the shape gets "The AI suggests: … You can cut the image at Trim." A lone comma or colon gives way to the full stop and leaves "The AI suggests: . You can cut the image at Trim." A lone surrogate becomes U+FFFD, a symbol, and is shown as "�.".
- **Readability is checked before the cut.** 300 blank fillers (U+3164) followed by one letter pass, and the line shown is 199 fillers and an ellipsis.
- **"Cut at a word" holds only where the line has a space late enough.** Text with no spaces, such as Japanese or Chinese, is cut at a character. The code always did this; the sentence was imprecise.

The same check found that the stop rule knew only ASCII stops: advice ending in "。" got a second stop, and a fullwidth or ideographic comma did not give way. ADR-0101 already says "A stop is added when the advice has none, and a trailing colon, semicolon or comma gives way to it", so that fix brings the code in line with ADR-0101 and changes no decision. It is recorded here because it shipped with this one.

ADR-0101's Context and Decision are final on main ([ADR-0103](0103-adr-log-rule-and-ci.md) rule 1), so the changed rule is recorded here.

## Decision

1. **Advice says something only if it holds a letter or a number** (Unicode letters and numbers, in any script). Blank letters (U+3164, U+115F, U+1160, U+FFA0) do not count. Punctuation or symbols alone, U+FFFD and emoji alone are no advice: the step's note shows the image and nothing from the AI. This replaces ADR-0101's "no letter, number, punctuation mark or symbol".
2. **The rule is applied to the line as it would be shown,** after the cut, so what the cut keeps must say something.
3. **The cut** is at a word where the line has a space in the second half of what is kept, otherwise at a character; either way it ends with an ellipsis and never splits a character. This states what the code does; ADR-0101's "cut at a word" was the common case.
4. **The stop, in every script** (code brought in line with ADR-0101). A sentence end in any script (Unicode's Sentence_Terminal, such as . ! ? 。 ！ ？ ؟), the ellipsis or the Greek question mark counts as a stop, also before closing quotes and brackets (” » 」 ) and the like). A trailing comma, colon or semicolon in its Latin, fullwidth, ideographic or Arabic form gives way to the stop.

## Alternatives considered

- **Keep punctuation readable and only refuse advice that the comma rule empties.** It still shows "The AI suggests: … You can cut the image at Trim." when a model copies the answer format, the likeliest case.
- **Change the answer format's example in C3's prompt** so models do not copy "…". A prompt version change for a case this rule already covers; it can still be done later.
- **Strip every Unicode terminal mark that is not a sentence end.** Rejected: that class includes marks that end a sentence in their own script, such as the Greek question mark (U+037E, which looks like a semicolon) and the Tibetan shad.

## Consequences

- An answer whose advice is only marks or symbols now shows no advice. The image is unaffected, and advice never costs a retry (ADR-0101).
- No hashes move: c3's recipe and `product.c3.asset` are unchanged, and the workflow bundle's pinned hash test passes, so no waiting run is ended ([ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md)).
- The held-key rule is unchanged: the gateway checks the answer's raw text before any of this ([ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md)).

## Evidence

- Code: `packages/runner/src/parse.ts` (`READABLE`, `plainLine`); `packages/runner/src/activities/asset.ts` (`ENDS_SENTENCE`, `GIVES_WAY`, `adviceNote`).
- Tests: `packages/runner/test/formats.test.ts` (marks and symbols alone are no advice, "N/A" is advice, blank letters filling the part shown, each blank letter, a surrogate pair kept whole at the cut); `packages/runner/test/asset-slots.test.ts` (a trailing semicolon after a space; Japanese, Chinese and Arabic endings; « » and 「 」; the Greek question mark).
- The combined check of 2026-10-17 (the d3-followup, d1-code and integration lenses), whose probes produced the notes quoted above.

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-18, from the bounded recheck of c9dbc69 (2026-10-17).** Where the Decision and the code differ. The code is unchanged, except for the closing quotes in the last item.
  - Decision 1's "emoji alone are no advice" has exceptions: an emoji that holds a letter or a number is advice. A keycap such as 1️⃣ (the digit 1, U+FE0F and U+20E3) and ℹ️ (U+2139, which Unicode files as a letter) are each shown alone as advice; #️⃣ and 👍 alone are not.
  - Decision 3's halfway point is measured in UTF-16 units, not characters: `plainLine` compares the last space's position with half of the kept text's `length`. In text with characters outside the Basic Multilingual Plane (rare CJK ideographs, most emoji), the cut can come at a space in the first half by characters: 90 such letters, a space and a long Latin word are cut to the 90 letters and the ellipsis. Its "never splits a character" holds for code points only: the cut can split a letter from a combining accent after it (e and U+0301), the two halves of a flag, or a joined emoji such as 👩‍🍳 (kept up to the joiner).
  - Decision 4's "every script" leaves out the Tibetan shad (།, U+0F0D), which is not a Sentence_Terminal character: advice that ends with one gets a full stop after it. And Greek is usually typed with the ordinary semicolon (U+003B) as its question mark, not U+037E, which Unicode normalisation turns into U+003B anyway. Only U+037E is kept as a stop; the ordinary semicolon gives way, so "Χρειάζεται εικόνα;" is shown as "Χρειάζεται εικόνα." and reads as a statement.
  - Decision 4's closing quotes: German and Danish close a quote with marks Unicode files as opening quotes (“ ‘ «, its Pi class), so a stop before them was not seen and a second stop was added after the quote. The code now counts them as closing quotes (`ENDS_SENTENCE` in `packages/runner/src/activities/asset.ts`), which is what Decision 4 says. The same commit adds tests for each comma, colon and semicolon form `GIVES_WAY` names, the ellipsis as a stop, the German and Danish quotes (`packages/runner/test/asset-slots.test.ts`), advice of digits only, and the cut at a word against the cut at a character (`packages/runner/test/formats.test.ts`).
- **2026-10-28, the gaps above closed (backlog row B-078).** The code now does what Decisions 3 and 4 say. `plainLine` (`packages/runner/src/parse.ts`) cuts by characters as a person sees them (`Intl.Segmenter` graphemes), still within `max` code points, so a letter keeps its accent, a flag its two halves and a joined emoji such as 👩‍🍳 its joiner, and the halfway point is counted in those characters, not in UTF-16 units. `ENDS_SENTENCE` (`packages/runner/src/activities/asset.ts`) counts the Tibetan shad and its double (U+0F0D, U+0F0E) as stops, and an ordinary semicolon right after a Greek letter, before any closing quotes, is read as the Greek question mark: it stays, and no stop is added. Any other trailing semicolon still gives way. Reading a semicolon after a Greek letter as a question is Claude's. The first note's exception for emoji that hold a letter or a number is unchanged. Tests: `packages/runner/test/formats.test.ts` (the halfway point in characters; an accent, a flag and a joined emoji at the cut) and `packages/runner/test/asset-slots.test.ts` (the shad, its double, and a Greek question typed with ";"). The workflow bundle's hash is unchanged.
