# ADR-0083: Hashed text is well-formed Unicode

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 16:30 |
| **Track** | System |

## Context

Byway hashes recipes, ledger entries and wire bodies with RFC 8785 canonical JSON and SHA-256 ([ADR-0059](0059-engine-requirements-for-composition-and-credibility.md)). Both need well-formed text. RFC 8785 §3.2.2.2 says a lone surrogate must be an error, in string values and in property names alike. SHA-256 hashes UTF-8 bytes, and a lone surrogate has no UTF-8 encoding.

The external review's finding F19 showed that `canonicalize` checked string values but not property names. Names went through a bare `JSON.stringify(key)`, which escapes a lone surrogate instead of rejecting it. The verification found the same gap in `sha256Hex`, which silently hashed a lone surrogate as U+FFFD, so two different texts shared one hash. It also found that nobody makes sure text is hashable at the three places where untrusted text enters a hashed record:

- **Recipe input.** `parseRecipe` returned recipes that `recipeHash` could not hash. A model's answer or a CLI file holding a JSON `\u` escape for half a surrogate pair threw a `CanonicalizationError` out of the composer, `byway hash` and `runner.start`.
- **Ledger read-back.** `Ledger.verify` threw on a stored line holding a lone surrogate or `1e400`, and on a `null` line, instead of naming the broken entry.
- **Provider labels.** `ModelGateway.record` wrote the served model and upstream host as the provider reported them. A malformed model id made the billed call impossible to ledger, so the spend caps did not count it (ENG-3).

A lone surrogate can arrive only through a JSON `\u` escape: from a model's answer, a crafted file, a damaged ledger line, or a malformed or compromised provider.

## Decision

1. **The library conforms.** `canonicalize` sends string values and property names through one checked serializer. It checks a name before walking its value and quotes a bad name escaped in the error, so every `CanonicalizationError` message is well-formed text. `sha256Hex` refuses text that is not well-formed. Well-formed output and hashes do not change.
2. **Recipe parsing guarantees a hashable recipe.** After the schema parse, `parseRecipe` calls `recipeHash` itself and turns a `CanonicalizationError` into a single `ZodError` issue at the recipe root: "the recipe cannot be hashed: <canonical path> …". Because the hasher decides, the rule cannot drift from it. Every caller then handles the case through the `ZodError` path it already has: the composer reports a SCHEMA violation and asks for a repair, the CLI exits 2, and `runner.start` refuses before a run exists. `RecipeSchema` checks shape only, and its doc comment says so. Any other error, such as a stack overflow on deep input, is rethrown; depth limits are F02's.
3. **Ledger read-back reports damage and does not throw on it.** `Ledger.verify` reports a line that is not a JSON object as `line:<n>`. It reports an entry with no canonical form as broken explicitly, never by comparing hashes, because a line whose hash field was removed would otherwise compare `undefined` with `undefined` and pass.
4. **A billed call is always ledgered.** `ModelGateway.record` is the one funnel for every paid kind. It writes provider-reported labels with U+FFFD in place of a lone surrogate (`toWellFormed`). A label that is not a string, which adapters copy unchecked, is written as its JSON text, and an absent label stays absent. The exact reply stays stored under `responseSha256`. Results returned to callers keep the label as the provider reported it.
5. **Wire evidence.** A request or response body that has no canonical form is stored as plain JSON. This already happened for lone-surrogate values and now also happens for property names. Its `requestSha256`/`responseSha256` then address that stored text, not a canonical form, and that text depends on key order. This is harmless, because bodies are built in a fixed order and stored under their own hash.

## Alternatives considered

- **The review's one-line repair alone.** It would have turned three clean outcomes into uncaught throws: a lone-surrogate knob name in the composer (previously a repairable COMPOSED-KNOB), `byway hash` on such a file, and `Ledger.verify` on a tampered key. It would also have left the provider-label loss and `sha256Hex` as they were.
- **Catching `CanonicalizationError` at each hashing caller.** Five catch sites, and every future caller would have to remember its own. In `record()` a catch cannot recover anyway, because the entry still has to be written.
- **A separate pre-parse Unicode walk in `parseRecipe`.** It would re-implement the canonicalizer's string rule in a second place, where it can drift. It would also need explicit escaping of paths below a bad name, and it would add a second traversal that F02's depth bound must also cover.
- **Leaving provider labels to a later change.** That would keep a reproduced, deterministic loss of billed spend whose fix is three lines.

## Consequences

**Positive**

- Byway conforms to RFC 8785 for property names, and two different texts can no longer share a hash.
- "Parsed means hashable" holds by construction, and the composer, the CLI and the runner need no new code. Their earlier crashes on lone-surrogate values and titles are fixed as a consequence of the same rule.
- `verify()` names damaged lines instead of throwing, and a malformed provider label can no longer lose billed spend.
- No recipe hash, ledger entry or stored artifact changes, and nothing needs migrating. The workflow bundle is unchanged: its hash is the same before and after, so no waiting run is retired.

**Negative**

- `byway.recipe/1` accepts less than before, though only inputs that could never be hashed (values) or registered (knob names, ST7) are affected. The schema is not bumped.
- Behaviour changes. `byway validate` on such a file exits 2 instead of 1. `byway hash` exits 2 instead of 0 or an uncaught throw. A lone-surrogate knob name in a composer answer is reported as SCHEMA at `(recipe)` instead of COMPOSED-KNOB.
- A malformed provider label is ledgered with U+FFFD, or as JSON text when it is not a string. The exact original is still in the stored reply.

**Not covered here**

- A provider-reported usage or cost that is not finite (a JSON `1e400` token count) still makes the ledger append throw after billing. That is an accounting-value rule and is handed to the F03 cluster.
- `Ledger.verify` still throws on a damaged `.head` file (not JSON, or a head `seq` below 1). It also throws a `RangeError` on a line nested deeply enough to overflow the stack. Both are different assumptions (a trusted head record, and depth, which is F02's). The verify contract above holds for content at ordinary depth.
- Zod's own "Unrecognized key" message can still echo an unknown key holding a lone surrogate into a composer violation. Every consumer serializes violations as escaped JSON, so this is cosmetic and predates this change.

## Evidence

- External review, finding F19: `C:/Users/arvik/code/byway_review/byway-review.md` (§ "F19 — Reject invalid Unicode in canonical object keys").
- The verification of that review: [docs/reviews/2026-10-08-external-review-verification.md](../reviews/2026-10-08-external-review-verification.md) (table row F19, cluster I, recommendation O3). This covers the two verifier passes (the composer and CLI regressions), the first design round (the `Ledger.verify` regression), and the critique round (the provider-label boundary, the missing-hash hole in `verify`, `sha256Hex`, the `null` line and the drift argument).
- Tests: `packages/canonical/test/canonical.test.ts`, `packages/recipe/test/recipe.test.ts`, `packages/gateway/test/ledger.test.ts`, `packages/gateway/test/gateway.test.ts`, `packages/advisor/test/compose-unicode.test.ts`, `packages/cli/test/cli.test.ts`.
- It affirms ADR-0059 and supersedes nothing.

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-21, two of the residuals.** Consequences' "It also throws a `RangeError` on a line nested deeply enough to overflow the stack" no longer holds: a ledger line nested more than 64 levels deep (`MAX_LINE_DEPTH`; the entries byway writes nest 2) gets no hash, so `verify()`, and Settings' ledger check through `auditLedger`, name its entry as damaged (`packages/gateway/src/ledger.ts`, 0ed0b52). The throw on a damaged `.head` file is unchanged. And the twin of the zod note: a recipe violation's path below a property name with a lone surrogate, in the reserved-key walk (`packages/recipe/src/schema.ts`) and in the shape bound (`shape.ts`), now writes each lone surrogate as `\uXXXX` text through one helper, `pathName`, and keeps a well-formed pair as it is (2e35ed2). Recipe hashes are unchanged, since the paths appear only in findings. Zod's own "Unrecognized key" message is unchanged. Both in batch C of the first block.
- **2026-10-22, a deep value under `id` (C-LEDGER-ID).** The note above held for a deep value under any key but `id`. `verify()` returned a broken line's `id` as it was: a line whose id was an array nested 10,000 deep came back as that array, and `auditLedger`'s `brokenLine` overflowed the stack turning it into text, so Settings' ledger check returned its generic error and the start-up report printed "Maximum call stack size exceeded". A numeric, object or empty id came back as "entry 7", "[object Object]" or "". `verify()` now names a broken line by its id only when the id is non-empty text, and otherwise as `line:<n>`, which `brokenLine` reads from the spend book's faults; the entry at the head is named by the same rule (`lineName`, `packages/gateway/src/ledger.ts`). A head that runs ahead of the file names the entry it records, missing from the file, by its id, or by its number when the id is empty, so the ledger check says an entry was lost or cut off; naming it `line:<n>` pointed at a line the file does not have (RB1-F1-3, the re-check of the fix round, 2026-10-22). Tests run through `verify()` (`ledger.test.ts`) and `auditLedger` (`spend-book.test.ts`). Money was never affected: the spend book already recorded such a line as a fault (`its "id" is missing or not text`). Found by the check of the first block and fixed in its fix round, under the owner's answer of 2026-10-22 01:54 ([ADR-0111](0111-cancel-cuts-off-the-calls-byway-can-stop.md)'s Later notes quote it).
- **2026-10-22, a correction to the note "two of the residuals".** That note says "The throw on a damaged `.head` file is unchanged." It was untrue when it was written. Since 2db4435 (F03), `verify()` names a head record it cannot read as `head` and does not throw: not JSON, not an object, a `seq` that is not a whole number of at least 1, or an `id` or `hash` that is not text (`readHead` and `headOf`, which `verifyNow` reads, in `packages/gateway/src/ledger.ts`). Only an I/O error other than a missing file (ENOENT) while reading the head file still throws. [ADR-0100](0100-corrections-found-by-the-final-re-check.md) item 4 and [ADR-0091](0091-provider-edge-billing-fixes.md) decision 5 say so already; take them as current on the head file. Item 4's last sentence, on a deeply nested line, no longer holds, as the note "two of the residuals" says and ADR-0100's note of 2026-10-22 on that sentence records. Claude checked both against the code at 1c9c5e3 (backlog row "Two false sentences about Ledger.verify in ADR-0083's and ADR-0100's notes").
