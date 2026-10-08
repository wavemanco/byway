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
  - **Overflow is re-measured, within a limit.** A try that comes out too tall is measured again, and the next try keeps fewer words still (at least 2% fewer). A card gets at most 6 renders.
- **A cut is visible on the card.** A cut card ends with "[… N more words not shown]". When no words fit, every word goes and the card says "[all N words not shown]".
- **A card that cannot fit stops the step; it is never cropped.** If a card is still taller than one image, the step fails with a plain message that names the item ("your work", or "the example that begins “…”"). The first tile is never kept silently.
- **The cut is kept with the card.** The card memo moves to `lineup/card2/<hash of the uncut card page>`. Its value is JSON `{ artifactId, cut? }`, so a retried step shows the same card and reports the same cut. Old `lineup/card/` memos held a bare id and are never parsed.
- **The lineup records each cut by item, never by blind label.** `Lineup.cut` holds `{ item: 'ours' | { ref }, shownWords, totalWords, begins? }`, built from the memo whether it was just made or read back.
- **The step note says what was cut.**
  - `verdictOf` returns one sentence, merged over the step's shuffles, and the model step appends it to the step's note. For example: "The outside critic was not shown every word: it saw the first 3,100 of 9,800 words of your work and the first 2,000 of 2,400 words of the example that begins “Every spring the river…”."
  - Items are named as the person knows them: their work first, then each example by its opening words.
  - Examples are not numbered, because the Start form numbers blank example fields that are dropped before the run.
- **What does not change:** the 12 px font floor, every prompt template, and one card image per label.

## Alternatives considered

- **Several card images per item (pagination).** Still bounded by an evidence budget. It breaks one image per label, and it sends more images per prompt.
- **Template changes so image-only critics also read a text lineup.** This would contradict the C5 gate template's "every ad is shown the same way", and it costs template versions. The rare case does not warrant it: long text examples in ad or page lineups, where C5 already tells the critic not to judge wording.
- **A 16 px font floor.** Withdrawn during the design review. It cut card capacity by about 44% and changed C5 gate inputs on an unmeasured hypothesis about downscaling. The root cause was silent clipping, which this record fixes.
- **The design's literal search (a proportional cut, then about 10% per re-render).** Rejected after measuring it in Chromium. The 12 px estimate is cautious for ordinary prose. A 20,000-character essay that renders at 2,348 px, inside one tile, would have been cut to 82% of its words. The 10% steps also left up to a tenth of the room unused. Calibrating on the first render keeps the same render bound and the same fail-closed rules: that essay is shown whole in 2 renders, and a 30,000-character essay shows 4,073 of 5,629 words instead of 3,108.
- **An admission-time warning for long examples in image-only recipes.** Deferred to the backlog. It would be a second, unmeasured estimate at a point with no renderer, and the step note discloses any actual cut.

## Consequences

**Positive**

- In a mixed lineup, critics that read text get every word of every item, our own included.
- For image-only critics, a cut is visible on the card, recorded, kept for retries and disclosed in the person's terms.
- No card is cut to its first tile without saying so.

**Negative**

- Image-only critics still see only the words that fit one image. The evidence is partial, though measured and disclosed.
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
- Tests: `packages/runner/test/cards.test.ts` (no clip; the fit search on a stand-in renderer; Chromium cards of 20,000 to 30,000 characters; a media lineup's cut record) and `packages/runner/test/critic.test.ts` (whole words for text critics; words follow the item; the cut and the note are the same on a memo hit; the note is merged over shuffles and never names a label; a card that will not fit stops the step).
