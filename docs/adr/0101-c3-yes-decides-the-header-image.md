# ADR-0101: C3's header image: your Yes decides, and the AI may add advice

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User (the owner chose B+ on 2026-10-16 from the options in the D3 brief) |
| **Date (local, UTC−7)** | 2026-10-16 09:35 |
| **Track** | Product |
| **Related** | [ADR-0090](0090-execution-contracts-for-revising-humans-and-media-steps.md), [ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md), [ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md), [ADR-0024](0024-evaluation-ladder-paper-one-scope.md), [ADR-0043](0043-research-credibility-without-compromise.md), [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md) |

## Context

C3 (Series Writer) ends its Refine stage with an optional image step (`asset-if-wanted` in `packages/catalog/src/c3.ts`). The run stops and asks: "Run this step? It is meant for when you want a header image (charts computed from real data are not made in this version). Yes runs it; No skips it." The current draft is shown with the question.

[ADR-0090](0090-execution-contracts-for-revising-humans-and-media-steps.md) §2 left one part of the external review's finding F11 to the owner (decision D3): after the person says Yes, may the AI still answer "no image"? Until now it could. `product.c3.asset` v2 declared `images: 0-1` and said "If the piece is better with no image at all, return an empty list." The runner honoured an empty answer: no image, no placing call, and the step finished, not skipped, with "The AI chose not to illustrate this piece, which its instructions allow, so no image was made; the work is unchanged." The recipe's "Custom imagery" explainer said the AI makes a header image "unless it judges the piece better without one".

That veto was a placeholder, not long-standing behaviour. The line had been in the prompt since the first templates (ee86a5d, 2026-10-07), but until 9b8dd1c (2026-10-09) the runtime required at least one brief and asked again ("Write at least one image brief."). The runtime began honouring the empty answer on 2026-10-09, and ADR-0090 labelled it pending D3.

The D3 brief offered five options: A, keep the veto; B, your Yes decides (prompt v3 with `images: 1-1` and no veto line); C, the AI may decline but must ask first; D, you choose in advance whether the AI may decline; E, keep the veto but say so at the question and show the AI's reason. Its skeptic added B+: B, plus one optional line of advice from the AI shown in the step's note, with no veto and no new question. The recommendation was B, ideally B+: "A wrong image is cheap to undo at Trim. A wrong 'no image' can't be undone inside the run." The owner answered "Go with B+".

## Decision

### 1. Your Yes decides

- **The prompt.** `product.c3.asset` v3 declares `images: 1-1`. The line offering an empty list is gone. The prompt opens "The writer asked for a header image for this piece" and asks for a brief for one header image. Its other guards are unchanged: carry the piece's feeling rather than the topic's stock picture, no text in the image, no chart or anything that looks like evidence, no real people.
- **The runtime is unchanged.** The minimum-one path that ADR-0090 built, and tests for C1, now applies to C3. An empty answer is asked again once with "Write at least one image brief." If the second answer is empty too, the step finishes **skipped** with "The AI wrote no usable image brief, even when asked again, so no image was made; the work passes through unchanged." The run goes on. An empty answer never fails the run.
- **What still can fail.** A placing call (`asset.integrate`) that misses twice after the image was bought still fails the run, as for every image step (ADR-0090 "Parked"; backlog). This decision does not change that.

### 2. Advice, never a veto

- **Only where the prompt asks for it.** An image-briefs template may declare `advice: yes` in its front matter. The template parser refuses it on any other template and refuses any other value. The renderer flags it as `RenderedPrompt.advice` (an additive, optional contracts field), as ADR-0090 made the image count the prompt's. Only `product.c3.asset` declares it. Every other image step is unchanged: its template does not ask for advice, and the runner shows none from its answers.
- **The answer format.** C3's prompt allows an optional `"advice"` beside `"images"`: "one short sentence for the writer, at most 200 characters, in plain words. Leave it out when you have none." The prompt says what it is for ("for example that the piece might read better without a header, or that a real photograph would serve it better") and that it never replaces the brief: "Write the brief all the same: the writer decides, and can cut the image afterwards."
- **Read as plain text** (`parseBriefs` and `plainLine` in `packages/runner/src/parse.ts`). The text is made well-formed (a lone surrogate becomes U+FFFD). Control and format characters are each replaced by a space, such as direction overrides and zero-width spaces, except the zero-width joiner and non-joiner, which emoji and some scripts need; replacing rather than deleting means cleaning can never join two halves of a text into one. Whitespace collapses to single spaces. The line is held to `ADVICE_MAX` (200) characters, cut at a word with an ellipsis. Empty advice, advice with nothing readable in it (no letter, number, punctuation mark or symbol; blank letters such as U+3164 do not count), and advice that is not text are all no advice. None of them makes the answer a miss, so advice never costs a retry or fails the step.
- **Held keys.** The gateway refuses any answer whose raw text holds a provider key byway has, before the runner reads it (ADR-0088). The advice is part of that answer, so it is held to the same rule as all other model text shown to the person, and its cleaning cannot rejoin a key split by an invisible character. Like all JSON answers, text the model wrote as JSON \u escapes is decoded after that check; byway never puts a key in a prompt (keys are refused at every entry), so a model has none to echo.
- **Where it is shown.** It appears in the step's note, only when the image was made and placed: "The AI suggests: This piece may read better without a header. You can cut the image at Trim." A stop is added when the advice has none, and a trailing colon, semicolon or comma gives way to it. If both answers carry advice, the later answer's is shown; if only the first does, that one stays. A skipped step shows no advice, because there is no image to act on. A test holds every step whose prompt asks for advice to a Trim step after it in its recipe, so "You can cut the image at Trim." stays true.

### 3. What the person reads

- **"Custom imagery" explainer** (`packages/catalog/src/presentation.ts`): "If you answer Yes, the AI makes a header image for the piece. It may also add one line of advice, which you can act on at Trim. Charts computed from your data are not made in this version."
- **The step's question** comes from the recipe's trigger and is unchanged. It is now accurate as written: Yes runs the step, and the step makes the image.
- **The chooser's C3 help** does not mention images and is unchanged.
- **Spec §3.3**: the `asset.briefs:<medium>` row says `1-1` on C3's prompt and describes the advice field.

### 4. Relation to ADR-0090

This settles ADR-0090's pending D3 by addition. ADR-0090 is not edited. Take these parts of it as replaced by this ADR:

- §2's bullet "C3 keeps its 'no image' answer (owner decision pending)";
- the `0-1 on product.c3.asset` declaration in §2's first bullet;
- the explainer it quotes.

ADR-0090's rule that a prompt with minimum 0 is taken at its word still holds. `NO_IMAGE_CHOSEN_NOTE` stays for such a prompt (today only `helper.asset.briefs@prose`, which no catalog step reaches).

## Alternatives considered

- **A. Keep the AI's veto.** No code change. The AI could spare a piece a generic header. But it overrules a choice the person made with the draft in view. A wrong decline cannot be undone inside the run: the person must start a new run, or add an image later in their publishing tool. The protocol has no such veto: 03 C3 runs ASSET when its trigger fires, and 01 ASSET prunes weak images afterwards through CUT. A also leaves whether a piece has an image up to the model. C3 is Paper 2's named generalization target ([ADR-0024](0024-evaluation-ladder-paper-one-scope.md)), so that would be one more uncontrolled variable for a future study ([ADR-0043](0043-research-credibility-without-compromise.md)).
- **B without advice.** The same fix, minus the AI's view. B+ keeps A's one real advantage, the AI's taste, as advice the person can act on. The cost is one optional field and no new question. The owner chose B+.
- **C. The AI may decline, but asks first.** It asks the person the same thing twice. Only the run engine can open a question, so the workflow code changes, and under ADR-0078 every waiting run would end. That is new machinery for a rare, unmeasured case worth cents.
- **D. Choose in advance whether the AI may decline.** More questions. Asked at Start, the person has not seen the draft yet. It changes c3's recipe hash and needs two templates.
- **E. Keep the veto, but say so at the question and show the AI's reason.** A becomes more visible, but its cost stays: no way back after a wrong decline. It also changes c3's hash, because the question's wording comes from the trigger.
- **Accept advice from every image step's answer.** Rejected. "You can cut the image at Trim." is true only where a Trim step follows, and the other image steps were to stay unchanged. So whether a step asks for advice is declared by its prompt, as ADR-0090 made the image count.

## Consequences

- **Money.** An image the person then cuts at Trim was still paid for. That is about 5 cents (Balanced) to about 28 cents (Best) more than a decline would have cost. These are the advisor's typical-token estimates, not measurements. When the AI's first answer is empty, one more brief call is paid: about 1.2 cents on Balanced, about 2.4 cents on Best. Every paid call is still held to the workspace spend cap ([ADR-0095](0095-paid-calls-have-a-durable-spend-book.md)). How often a model answers empty or gives advice has not been measured. The demo mock does neither.
- **The advice line** is the AI's words, shown as its suggestion. It can be wrong, and the person decides. They can cut the image at Trim, or delete its line by hand in "Your words" at no cost.
- **Hashes.**
  - c3's recipe hash is unchanged: `sha256:a957db1b60964b591c14326a6abedaf9895f5118b434ba271d303d86022e8335` before and after. `recipes/c3.json` names the prompt only by id, and the explainer is not part of the recipe. No other recipe hash moves.
  - `product.c3.asset` goes from v2 (`sha256:21d9eeb4…`) to v3 (`sha256:6bd036ac…`). Ledger provenance records the new hash with every call.
  - The workflow bundle is unchanged: the pinned hash test passes. No waiting run is ended (ADR-0078).
- **The output-contract table** (`OUTPUT_CONTRACTS` in `packages/prompts/src/outputs.ts`) is not updated for `"advice"`. That table is inlined in the workflow bundle, so editing it would change the bundle hash and end every waiting run (ADR-0078). For now the field is stated in C3's template, the prompts README and spec §3.3. It goes into the table with the next deliberate change to the workflow bundle (backlog).
- **Research.** No study is locked on C3. Whether a C3 piece has an image now follows the person's recorded Yes, not the model's choice. C1-H (Study 1) is unaffected: `article.ASSET` is unchanged (1-3 images, no advice).
- **The step's question did not change**, so a person who wants no image still answers No.

## Evidence

- Code: `packages/prompts/templates/product.c3.asset.md` (v3); `packages/prompts/src/template.ts` and `renderer.ts` (`advice`); `packages/contracts/src/prompts.ts` (`RenderedPrompt.advice`); `packages/runner/src/parse.ts` (`parseBriefs`, `plainLine`, `ADVICE_MAX`); `packages/runner/src/activities/slot-plan.ts` (`SlotBriefs.advice`); `packages/runner/src/activities/asset.ts` (`adviceNote`); `packages/catalog/src/presentation.ts` (the explainer).
- Tests:
  - `packages/prompts/test/media-contracts.test.ts`: C3 declares 1-1; only C3 asks for advice; a template names `"advice"` exactly when it declares it; v3's wording.
  - `packages/runner/test/formats.test.ts`: advice is read as one plain, bounded line and is never a miss.
  - `packages/runner/test/asset-slots.test.ts`: C3 empty, then a brief; empty twice is skipped with `NO_BRIEF_NOTE`; advice shown with the image; no advice on a skip or where the prompt does not ask; a Trim step follows every step that asks; the explainer.
  - `packages/runner/test/e2e/text-media.ts`: C3 end to end, empty twice, and advice in the note.
- The D3 brief and its skeptic's corrections (the veto's history, B+, the costs); the external-review verification, `docs/reviews/2026-10-08-external-review-verification.md`, lines 38, 91 and 3163-3247; protocol 03 C3 ("Optional: ASSET. Real photos often beat generated ones, and charts must come from data.") and 01 ASSET step 8 (prune through CUT).
