# ADR-0081: VOICE writes the person's copy exactly, without a model

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 17:00 |
| **Track** | Product |

## Context

VOICE is the product's core promise: a person writes every reader-facing line (spec §3.2; protocol 01 VOICE step 7, "inserts the human copy exactly"; port rule 6, "no later block writes over voice"). The external review's F07, confirmed at P1 by the verification, showed that the runner did not keep it:

- A page's write-back went to `helper.voice.apply`, and the result was checked only for an unchanged tag skeleton and for each non-empty line appearing somewhere on the page. Deleted text left on the page, a repeated line replaced by other words, swapped lines and new copy between tags all passed. The fallback placement emptied inline links and emphasis. An out-of-range character reference threw a `RangeError`.
- The "unchanged" test squashed whitespace, so moves across lines, merges and a prose paragraph split were dropped silently, and the last block could not be emptied.
- Every other medium fell back to the model whenever its reader could not map an answer, and the options and on-screen readers dropped or shadowed lines the person typed.
- `keepsVoice` held later machine writes only to substring membership (`lostVoiceLines`), and skipped the check for an empty voice. Canonical C5 reaches this: a model that appended to or reordered the voice-over passed.
- The page tokenizer ended a tag at the first `>`, even inside a quoted attribute value.

The common root: the person's copy could be written by something other than an exact, total application of their edit, as long as the result passed a check weaker than the edit.

This record supersedes the whole "VOICE write-back" bullet of [ADR-0073](0073-runner-semantics-where-the-spec-was-open.md), including its keepsVoice sentence. ADR-0073 is not edited.

## Decision

**Each medium's copy deck is the contract, and no model writes the person's words.** The runner offers the deck, reads the answer with a total reader (every line lands in exactly one place, or the answer is refused with that line named), writes it back deterministically, and checks the written artifact exactly. VOICE makes no model call in any medium, so demo and paid runs behave the same and VOICE costs nothing. The `helper.voice.apply` templates and the `voice.apply` id stay, because the prompt ids are in the workflow bundle; they are no longer called.

**Decks.**
- Prose: the Markdown document. Code diffs: the "Why:" paragraph (empty is refused). Media: the voice-over script at the early VOICE; at the late VOICE, `Headline:`, `Tagline:` and one `Shot N:` per shot. Options: `### A` then `Title:`, `Pitch:` and `Rationale:` for each option.
- Labelled decks are read by one total reader: each label once, in the order shown, matched by position (so a storyboard whose shots repeat a number still reads); continuation lines belong to the label above; anything else is refused and named. A voice-over line at the late VOICE is refused.
- Non-web write-backs pass a round trip: the deck read back from the written artifact, laid out by one line-based `layoutOf`, equals the answer laid out the same way. `layoutOf` is never the reader. It normalises only layout (line endings, trailing spaces, every run of blank lines that ends at a label or at either end, however long, a value on the line after its label, label case and spacing) and keeps everything inside a value, blank lines between its lines included. The same `layoutOf` is the "unchanged" test, so a doubled space inside a caption is written. A failed round trip is refused quoting the first line that would differ.
- Web pages: one line ("unit") per block of visible text, in reading order. A block of links side by side gives one line per link. Head content is not offered except `<title>`.

**The page tokenizer** reads a page as browsers tokenize it where that decides what is copy, without building the tree: WHATWG tag ends (quotes delimit attribute values only; input ending inside a tag is opaque); comment forms; raw text for script, style, noscript, template, iframe, xmp, noembed, noframes and textarea (textarea's default value is not offered; `/>` on these is ignored in HTML content); a script's `<!--` escapes, so `</script>` inside an escaped `<script` string does not end it; plaintext opaque to the end; `<title>` as RCDATA, offered; inside `<svg>` or `<math>`, a CDATA section is opaque. The self-closing flag is WHATWG's: a `/` read right before `>` outside any value (so `href=/shop/` does not set it). The reader honours it where browsers do (void elements, `<svg>` and `<math>`, and everything inside them) and ignores it on other HTML elements, so `<a href=x/>` and `<span/>` open an element. It builds no tree: no implied end tags, no foster parenting, no reconstruction of formatting elements, and an element without a closing tag is never removed. On the C1 demo page its tokens are identical to the old tokenizer's. Character references are decoded by parse-entities with browser rules (total; U+FFFD for references out of range). Whitespace means HTML whitespace; a no-break space is text. Changed text is written with `&`, `<` and `>` escaped; unchanged text keeps its bytes.

**Not offered on a page** (each stays byte for byte): attribute copy (alt, aria-label, title, placeholder, meta description), script-generated copy, CSS content, textarea default text, svg CDATA text, xmp and plaintext content, noscript content, and `<pre>` content.

**One bracket notation on every page line.** Link words inside a line are shown in `[brackets]`; a literal bracket, or a backslash before one, is shown escaped with a backslash on every line. A line with links keeps one pair per link, in order; `[]` removes that link. A line that is exactly one link's words takes plain words or one pair around the whole line. A line with no link refuses an unescaped bracket and says how to escape it. Link words are the person's decision: the VOICE prompt names where every link goes ("line 2 "Terms of service" goes to /terms"; at most 40, addresses cut to 60 characters), so there is no relabel guard. This suffix is added by `openCheckpoint` from the work itself, once per checkpoint, re-asks included; it lives there until the next workflow change.

**Edit semantics.** The answer is a positional edit: one line per unit; an empty line deletes that unit's text, the last one included; blank lines past the end are nothing. A question opened by an older engine is aligned by words only (brackets and backslashes dropped). When a changed line no longer lines up with the current deck, it is refused on the first offer and read against the current deck on a re-ask. "First offer" means exactly: the answered checkpoint's starting text equals the text the step first offered; a missing checkpoint counts as a first offer.

**Placement and verification.** Placement is deterministic: changed text goes into the line's text slots, aligned to the old words so formatting follows whole words or pieces (a documented, tested rule; formatting coverage is not verified). The whitespace before a line's first word and after its last stays in the slots that held it, so the gap beside an empty icon or an image link stays where it was; words added before the first kept word go beside it. Removal is conservative: an emptied inline element or text block (p, h1–h6, li, blockquote, figcaption) is removed unless it holds an embedded element or carries a hook (id, for, name, role, data-*, or aria-* other than aria-label); no removal may join two runs of text (union-find over all removals together); a deleted line takes the `<br>` run that ends it. A link or button that would be left empty or nameless is refused, naming its hook, so a line whose link carries a hook can be edited but not deleted. One that keeps an image or icon is named by its own aria-label, aria-labelledby or title, or by an image's non-empty alt or an element's own label inside it (an empty alt is decoration). Placement returns its removals as a witness. The verifier shares the reader, the removability rule and the `<br>`-run rule with placement and nothing else, and checks six invariants: (1) each witnessed removal is allowed, and the markup is the page before less exactly those removals, token for token; (2) and (3) unchanged text keeps its bytes and a deleted line keeps only its edge whitespace, run by run; (4) each changed line, and each link part, reads exactly as written, and its edge whitespace stays in its slots; (5) no link or button whose words were in a changed line is left without a name (one that held no words, such as an image link sharing a run with a changed line, had no name for the edit to take); (6) read fresh, the written page's blocks hold exactly the expected text, in order. It is independent of placement's choices, not of the reader, whose browser-faithfulness is tested on its own. Reading and verifying are linear in the page, and so is placement except where it matches a changed block's old and new words: by a table quadratic in that block's words for a line of up to about a thousand words, and past that by the common first and last words plus a Myers edit script whose cost grows with the words changed, capped at 2,000 changed words (past the cap the changed middle is one span and its formatting is not kept). A 24,010-tag page, a 20,000-path svg and a 12,000-word block with a word changed near each end each take well under a second alone; the tests bound them at five seconds so a loaded machine does not fail them.

**keepsVoice is an exact lock.** The locked deck is computed before the model call.
- A storyboard's voice-over is written back from the work before the write whenever a voice exists, and the step finishes with a note: "The voice-over is locked, so it was kept exactly as it was; this step's change to it was undone." An obedient write is byte-identical and gets no note. If the undone change was the step's only change, a following A/B compare is skipped as "nothing to compare".
- Its on-screen copy is locked exactly when the late VOICE's own reader reads the voice as this storyboard's complete on-screen deck (whatever the values and their layout) and the voice is not the voice-over itself. Then any change to it is refused. A VO script has no `Headline:` line, so it stays unlocked; a VO script that happens to be the whole labelled deck is the voice-over, so it stays unlocked too.
- Options, prose, code diffs and pages are held by exact deck equality; pages also by each link part's address, by position. Visibility (the hidden attribute, inline styles, classes) is not checked. An empty voice is checked.
- With no work before the write, the written artifact must hold exactly the voice. For a page this is practically unsatisfiable (the whole deck would have to equal the handed-in deck); such recipes should place the deck with a VOICE step.
- In canonical C5 every keepsVoice writer runs in the script phase, with the VO script as its voice, so the write-back is the live path. The on-screen lock is reached only by composed recipes with a writer after the late VOICE.

**Typed boundaries (ENG-6).** Every problem with a VOICE answer, including a fault inside the pure copy code, is a question asked again (`AnswerRejected`), quoting how the offered lines or fields it names first read (at most five, 80 characters each), because after a re-ask the web editor's starting text is the person's previous answer. Sending the offered copy back always succeeds. A fault reading the deck in `openCheckpoint`, or in a keepsVoice check, is a plain, non-retryable `StepError`, so a paid call is never repeated. Store errors are retried as before. The claim log runs on prose only; on any other medium the step offers and writes the copy deck.

**Bundling.** parse-entities switches to DOM decoding under the "browser" export condition, so the copy modules (copy.ts, page-copy.ts, html-tokens.ts) must never be bundled for a browser or the workflow sandbox. Everything here is activity code; the workflow bundle hash is unchanged.

**Parked, not fixed: VOICE-RETRY.** In C5 a failed launch gate re-enters D2 from the ports D2 started with (`RetryStage`), so the copy the person wrote at the first late VOICE is not in the second pass, and the second late VOICE offers model copy without saying so. Its root is the workflow's stage re-entry, not a weak check; fixing it changes the workflow bundle, and ADR-0078 then ends open runs. The owner's options: carry the person's on-screen answer across the retry in the interpreter, or, as an activity-only interim, have `openCheckpoint` name the earlier answer when the current deck differs. A C5 test records today's behaviour.

## Alternatives considered

- **Structured segment ids and a per-segment editor (the review's repair).** Exact by id and fully explicit, but it changes checkpoint and resolution formats, store rows, the CLI and API answer format and the web UI, touches workflow types (ending every open run), and still needs every exactness rule above.
- **Exact checks, with the model still placing page copy.** Smaller, but link coverage stays the model's unverifiable choice, every web VOICE edit costs a call, and in demo mode an edit to a line with inline markup could never succeed.
- **Deterministic placement with heuristics instead of brackets.** No notation, but a heuristic (or a model) decides which words a link covers, or the person is forced to keep words they wanted to change.

## Consequences

**Positive**

- The person's words are written exactly as stated, in every medium, and a later machine write cannot change the locked deck unnoticed. The lock covers the words and, on a page, each link's address; it does not cover visibility, formatting or attribute copy (see keepsVoice above).
- No model in VOICE: demo and paid runs agree, and VOICE is free.
- Canonical C5's voice-over is now written back, with a note, instead of passing appended or reordered text.

**Negative**

- Page decks carry a small notation: link words in brackets, literal brackets escaped. The C1 demo deck has none.
- Free-form answers that the model used to map are now asked again, with the exact problem.
- Pages whose attributes hold a quoted `>`, or that contain svg CDATA, iframe, xmp, noembed, noframes, plaintext or literal brackets, are read differently; a question opened before the upgrade may be asked again once.
- A paragraph whose link carries a hook cannot be deleted in VOICE (it can be edited).
- A block of more than about a thousand words rewritten in more than 2,000 words loses the formatting in its changed middle (the words are still written exactly).
- An old composed-recipe late answer that left out a field leaves that run's on-screen copy unlocked.
- A new runner dependency: parse-entities 4.0.2 (already in the lockfile).

## Evidence

- [docs/reviews/2026-10-08-external-review-verification.md](../reviews/2026-10-08-external-review-verification.md) (F07, cluster E).
- The external review: C:/Users/arvik/code/byway_review/byway-review.md.
- Tests: packages/runner/test/page-copy.test.ts, html-tokens.test.ts, voice.test.ts, voice-faults.test.ts and formats.test.ts; the runner e2e scenarios for C1, C5 and the operators.
