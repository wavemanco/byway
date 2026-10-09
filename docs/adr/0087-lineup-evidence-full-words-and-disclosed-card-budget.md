# ADR-0087: Lineup evidence: text critics read every item's full words; image-only critics get a measured, visible, disclosed budget

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 16:45 |
| **Track** | Product |

## Context

This record extends [ADR-0072](0072-great-critic-ranks-blind.md) (a GREAT critic ranks the whole lineup blind) and amends the BLIND-1 decision of [ADR-0080](0080-phase-4-recheck-corrections.md) (a mixed-form lineup is drawn as one card image per item). It does not edit either.

The external review's finding F13 (model half), confirmed by both verifiers, showed that the BLIND-1 cards lost words silently:

- The card chose its font size from an estimate with a 12 px floor and never checked the fit.
- The card was capped at 2,576 px with `overflow: hidden`, and only the first screenshot tile was kept.
- In the cards form, a text critic's lineup slot held only "(shown in the image under this label)" for every item. Words clipped off a card therefore reached the critic nowhere, and nothing recorded the cut.

The verifiers measured clipping from about 18,500 characters of ordinary paragraph prose, far earlier for text made of short lines, and at about 14,000 characters for our own illustrated item. The paste limit for an example is 50,000 characters. A GREAT critic's rank decides whether a loop or gate exits, so it could be computed on partial evidence, our own work included.

## Decision

- **Critics that read text get every item's whole words (prose, options, code-diff).** These critics' templates read the lineup as text (C2, C3, C4, C6, C6a, C7). In a cards lineup, each item's words go under its label in full, exactly as the text form gives them. The cards draw only the item's pictures, plus, for an item with words, one fixed line: "Its words are written out under this label." An item without words keeps the note "(shown in the image under this label)".
- **Words follow the item, never whether it is ours.** A label carries words exactly when its item has words. The existing rule stays: when no reference has words, ours is drawn by its frames only.
- **A text critic's card is rendered once and never cut.** One that comes out taller than one image stops the step.
- **Critics that see only images keep the words on the card, under a measured budget (media's C5 gate, web-page).** Their templates say the words are on the card, so the words stay there.
  - **Nothing hides overflow.** The card has no height cap and no hidden overflow, and every render is measured from its tile count and PNG heights.
  - **The first try comes from the estimate, then the browser corrects it.** The first try keeps the words the 12 px estimate fits. Its render calibrates the estimate against the browser, in both directions: more words when the estimate was too cautious, fewer when the card overflowed.
  - **A whole text is tried at the floor before any word is cut.** The estimate may pick a size above 12 px for the whole text. If that render comes out too tall, the next try sets every word at 12 px, and words are cut only if that fails too. This matters for glyphs wider than the estimate's average character, such as capitals.
  - **Overflow is re-measured, within a limit.** A try that comes out too tall is measured again, and the next try keeps fewer words still (at least 2% fewer). A card gets at most 6 renders.
  - **Text that cannot be cut between words is cut by characters.** A CJK paragraph, minified JSON or a long token has no spaces, so it counts as one "word", and a word cut could only drop it whole.
    - The rule: when a run of non-space characters is longer than one line at 12 px (by the estimate), the text is cut by characters.
    - Characters are counted as people see them (grapheme clusters, never split).
    - The card's closing line and the verdict's note then count characters.
- **A cut is visible on the card.** A cut card ends with "[… N more words not shown]" (or "characters"). When no words fit, every word goes and the card says "[all N words not shown]".
- **A card that cannot fit stops the step; it is never cropped.** If a card is still taller than one image, the step fails with a plain message that names the item ("your work", or "the example that begins “…”"). The first tile is never kept silently.
- **The cut is kept with the card.** The card memo moves to `lineup/card2/<hash of the uncut card page>`. Its value is JSON `{ artifactId, cut? }`, so a retried step shows the same card and reports the same cut. Old `lineup/card/` memos held a bare id and are never parsed.
- **The lineup records each cut by item, never by blind label.** `Lineup.cut` holds `{ item: 'ours' | { ref }, unit: 'words' | 'characters', shown, total, begins? }`, built from the memo whether it was just made or read back. (The design named the counts `shownWords` and `totalWords`; they became `shown` and `total` with a `unit` when character cuts were added.)
- **The step's note is to say what was cut.**
  - `verdictOf` returns one sentence as the verdict's `note`, merged over the step's shuffles. For example: "The outside critic was not shown all the text: it saw the first 3,100 of 9,800 words of your work and the first 2,000 of 2,400 words of the example that begins “Every spring the river…”." When nothing of an item was shown, it says so: "none of the text of your work (1 word)".
  - Items are named as the person knows them: their work first, then each example by its opening words.
  - Examples are not numbered, because the Start form numbers blank example fields that are dropped before the run.
  - **The model step must append it to the step's note; on this change's branch it does not yet.** This is one line in `model-step.ts`, right after the `verdictOf` call: `if (verdict.note) notes.push(verdict.note);`. Another work package owned `model-step.ts` when this change was written, so the line lands when the branches are integrated.
  - A test pins the step's note: `critic.test.ts`, "says in the step's note whose words the critic was not shown". It is marked `it.fails` until the line lands. Then it passes, vitest reports that as a failure, and the marker comes off.
  - With the line in place the test passes. That was checked against a copy of `model-step.ts` carrying the line, with the original left unchanged.
- **What does not change:** the 12 px font floor, every prompt template, and one card image per label.

## Alternatives considered

- **Several card images per item (pagination).** Still bounded by an evidence budget. It breaks one image per label, and it sends more images per prompt.
- **Template changes so image-only critics also read a text lineup.** This would contradict the C5 gate template's "every ad is shown the same way", and it costs template versions. The rare case does not warrant it: long text examples in ad or page lineups, where C5 already tells the critic not to judge wording.
- **A 16 px font floor.** Withdrawn during the design review. It cut card capacity by about 44% and changed C5 gate inputs on an unmeasured hypothesis about downscaling. The root cause was silent clipping, which this record fixes.
- **The design's literal search (a proportional cut, then about 10% per re-render).** Rejected after measuring it in Chromium. The 12 px estimate is cautious for ordinary prose. A 20,000-character essay that renders at 2,348 px, inside one tile, would have been cut to 82% of its words. The 10% steps also left up to a tenth of the room unused. Calibrating on the first render keeps the same render bound and the same fail-closed rules: that essay is shown whole in 2 renders, and a 30,000-character essay shows 4,073 of 5,629 words instead of 3,108.
- **An admission-time warning for long examples in image-only recipes.** Deferred to the backlog. It would be a second, unmeasured estimate at a point with no renderer, and the step's note discloses any actual cut once the model step appends it (above).
- **Counting every text by characters, or by `Intl.Segmenter` words.** Rejected:
  - Words are what a person counts in spaced text.
  - The segmenter's word counts differ from a person's for hyphens and punctuation.
  - Minified JSON is not words in any sense.
  - Characters are used only where words cannot be cut between.

## Consequences

**Positive**

- In a mixed lineup, critics that read text get every word of every item, our own included.
- For image-only critics, a cut is visible on the card, recorded and kept for retries. It is disclosed in the person's terms once the model step appends the verdict's note (above).
- No card is cut to its first tile without saying so.
- Text without spaces (CJK, minified JSON) is shown in part, never dropped whole.

**Negative**

- Image-only critics still see only the text that fits one image at 12 px. The evidence is partial, though measured and disclosed.
- Until `model-step.ts` appends the verdict's note, the person is not told of a cut. The critic sees the closing line on the card, and the lineup records the cut.
- Critics that read text now receive words as well as card images in the cards form. The words are the same volume as the text form's (at most 10 references of up to 50,000 characters, plus ours), bounded by the run's budget caps.
- Modality trade: in "text against image references", ours is visibly the item with text. It already was, typeset on its card.
- A card may take up to 6 renders of about half a second to a second each, kept per run.
- Runs that span the upgrade:
  - Only activity code changed. The workflow bundle hash is unchanged, so no run is retired under [ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md).
  - A retried critic builds a new lineup, which costs at most one extra critic call per retry in flight.
  - In loops, later rounds' text critics see words plus cards where earlier rounds saw cards only, so plateau comparisons across the upgrade mix conditions. Best-version selection is a fresh re-rank and is unaffected.

## Evidence

- [External-review verification, 2026-10-08](../reviews/2026-10-08-external-review-verification.md): F13 and Cluster C, Change 3 (the recommendation, the verifiers' Chromium measurements, the final check's residuals). The original review is outside the repository, at `C:/Users/arvik/code/byway_review/byway-review.md`.
- Chromium measurements of fitted cards, taken with the real renderer after this change. "Full height" is the uncut card's height. Before this change, any card taller than 2,576 px was cropped to that height, with no record.

  | Card | Full height | Shown now (renders) |
  |---|---|---|
  | 20k-character essay | 2,348 px (fits) | all 3,781 words (2) |
  | 30k-character essay | 3,457 px | 4,073 of 5,629 words (3) |
  | 48k-character single line | 3,121 px | 6,454 of 8,000 words (2) |
  | 300 lines of dialogue | 5,103 px | 588 of 1,200 words (1) |
  | Six frames plus a 30k-character essay | 4,001 px | 3,208 of 5,629 words (3) |
  | 8,108 characters in capitals | 2,785 px at the 24 px the estimate chose; 900 px at 12 px | all 1,501 words (2) |
  | 1,001 words of wide glyphs ("WWWWWWW") | 4,297 px at 24 px; 1,122 px at 12 px | all 1,001 words (2) |
  | Three CJK paragraphs, 9,013 characters | 4,714 px at 22 px; 1,492 px at 12 px | all of it (2) |
  | One CJK paragraph, 20,000 characters | 4,684 px | 16,720 of 20,000 characters (3) |
  | Minified JSON, 38,281 characters | 2,668 px | 36,300 of 38,281 characters (2) |
  | One run of 50,000 characters | 3,440 px | 36,005 of 50,000 characters (3) |

  The last six rows come from the adversarial verification of this change's first version. That version cut words that fit whole at 12 px: 1,470 of 1,501 capitals, 980 of 1,001 wide words, and 3 of the 4 CJK paragraphs, which dropped a whole paragraph. It showed nothing of the last three, whose cards said "[1 word not shown]". Two rules above fix this: trying the whole text at the floor, and the character cut.
- Tests:
  - `packages/runner/test/cards.test.ts`:
    - no clip;
    - the fit search on stand-in renderers, including one whose glyphs are wider than the estimate and a run without spaces;
    - Chromium cards of 20,000 to 30,000 characters, capitals, and a CJK paragraph;
    - a media lineup's cut record, checked on the card that was kept.
  - `packages/runner/test/critic.test.ts`:
    - whole words for text critics;
    - words follow the item;
    - the cut and the note are the same on a memo hit;
    - the note is merged over shuffles, never names a label, and reads plainly for characters and for nothing shown;
    - a card that will not fit stops the step;
    - a GREAT media critic step is shown the cut card;
    - the step's note (pending, above).
