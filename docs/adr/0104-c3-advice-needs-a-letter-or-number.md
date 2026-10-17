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
