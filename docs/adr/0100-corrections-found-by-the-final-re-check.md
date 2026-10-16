# ADR-0100: Corrections found by the final re-check of the external-review fixes

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: the owner approved this cleanup pass on 2026-10-16. Claude checked each correction against the code on main (1ba72f5); reversible. |
| **Date (local, UTC−7)** | 2026-10-16 05:45 |
| **Track** | Product |
| **Related** | [ADR-0083](0083-hashed-text-is-well-formed-unicode.md), [ADR-0084](0084-renderer-launch-without-secrets.md), [ADR-0085](0085-generated-pages-inert-unless-a-frame-asks-with-consent.md), [ADR-0087](0087-lineup-evidence-full-words-and-disclosed-card-budget.md), [ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md), [ADR-0089](0089-recipe-ir-optional-reads.md), [ADR-0091](0091-provider-edge-billing-fixes.md), [ADR-0092](0092-recipe-semantics-derived-from-execution.md), [ADR-0094](0094-backup-unit-is-the-data-directory.md), [ADR-0096](0096-partial-restores-reported-at-start.md) |

## Context

A final re-check of the external-review fixes on main (1ba72f5) found every code fix holding. It also found sentences in Accepted ADRs that are no longer true of main, most because a later change altered the code. Accepted ADRs are not edited, so this record corrects them by addition, as [ADR-0080](0080-phase-4-recheck-corrections.md) did. Some of the changes were already recorded by a later ADR; they are listed here too, so each correction can be found from one place.

## Decision

Each item quotes the sentence, says what is true on main and which change made it so, and says what to take as current. Where the later ADR already says it, that ADR is named. Nothing in the code changes.

**ADR-0083 (hashed text is well-formed Unicode)**

1. Decision 4: "Results returned to callers keep the label as the provider reported it." On main, `record()` in `packages/gateway/src/gateway.ts` returns the label the ledger records: a lone surrogate written as U+FFFD (`providerLabel`), then scrubbed of held keys (`scrubLabels`, [ADR-0088](0088-provider-boundary-held-keys-and-media-admission.md)). This came with the merge of fix/fx-gateway-boundary (48800d2), whose F19 test now expects the returned label to equal the ledger's. Take as current: callers and the ledger get the same well-formed, scrubbed label; the provider's exact reply is kept only in the stored response under `responseSha256`.
2. Decision 4: "an absent label stays absent". On main this holds for the upstream host only. A served model that is missing, null or empty is recorded, and returned, as the requested model, flagged `priceBasis: 'assumed'` (c3dafda). Take as current: [ADR-0095](0095-paid-calls-have-a-durable-spend-book.md) decision 7.
3. Not covered here, first bullet: a usage or cost that is not finite "still makes the ledger append throw after billing." On main such a figure is replaced by the call's planning figure, the entry is flagged `priceBasis: 'assumed'`, and the call is recorded and counted (`finiteUsage` in `gateway.ts`; 4c02821). Take as current: ADR-0095 decision 7.
4. Not covered here, second bullet: "`Ledger.verify` still throws on a damaged `.head` file (not JSON, or a head `seq` below 1)." On main `verify()` returns `head` for a head record it cannot read (`readHead` in `packages/gateway/src/ledger.ts`; 2db4435). Take as current: [ADR-0091](0091-provider-edge-billing-fixes.md) decision 5. The bullet's next sentence still holds: a line nested deeply enough to overflow the stack makes `verify()` throw a `RangeError`.

**ADR-0084 (renderer launch without secrets)**

5. Negative and residual: "Runs of other media reach the renderer only at a lineup of cards, after paid steps. … A cheap activity-side option exists and is not taken here". On main the option is taken: a model step whose run has at least three references, one of them an image, asks `pages.ready()` before its provider call (`rendererReady` in `packages/runner/src/activities/model-step.ts`; 890f88f). Such a run whose renderer cannot start stops at its first model step, before that step's call. Take as current: [ADR-0090](0090-execution-contracts-for-revising-humans-and-media-steps.md), "Readiness before spend for card lineups of other media".
6. Decision: Chromium gets "no name `.env.agents` listed (set or kept)"; Positive: "Chromium no longer holds the provider keys or anything else from `.env.agents`". On main this holds only when `scripts/serve.ts` and `packages/runner/src/pages.ts` share one copy of the gateway's env module. `loadEnvFile` records the file's names in a module-level map that `namesFromEnvFile` reads (`packages/gateway/src/env.ts`). serve.ts imports the gateway by a relative path; pages.ts imports `@byway/gateway`, which resolves through the pnpm link. On Windows, started from a current directory whose drive letter is lowercase (`c:\…`), the two resolve to `file:///c:/…` and `file:///C:/…`, two copies, and pages.ts's copy knows no names. Chromium then gets every name from the file that does not look secret. Provider keys and names that look secret are still left out, because those rules go by name. Nothing changed this since ADR-0084's own change; it is not fixed (backlog). Take as current: the sentences hold for a start from an uppercase drive letter; with a lowercase one, only the provider-key and secret-looking-name rules hold.

**ADR-0085 (generated pages inert unless a frame asks with consent)**

7. Decision, "One rule for opening an artifact": "… and Markdown links to byway's own artifacts." On main a Markdown link opens the viewer only when its address is exactly `/artifacts/<id>` or `/api/artifacts/<id>` (`isOwnArtifactUrl` in `apps/web/src/view/pages.ts`, used by `Markdown.tsx`; so since ADR-0085's own change, 1cbb1a8). With a `#fragment` or a `?query` it is left as written and opens the raw address, which serves a page inert.
8. Same decision: "The raw address is used only as an element's `src` (images, clips, page frames) and for downloads." On main the whole-text loader also fetches it (`apps/web/src/components/wholeText.ts`, [ADR-0086](0086-run-screen-excerpts-say-so-and-decision-views-show-whole-text.md); 1abb31d), and the viewer redirects to it for a type it cannot show (`apps/web/app/view/[id]/page.tsx`; 1cbb1a8). Neither runs a page's scripts: the loader reads text, and the redirect is a top-level navigation, which the artifact route serves inert.

**ADR-0087 (lineup evidence and the card budget)**

9. Evidence, the table's "Shown now (renders)" column. Since 88f0a77 the card fit converges and aims a little under the line (ADR-0090, "The card fit converges"), so six rows differ on main. Measured on this branch with the real renderer: 30k-character essay 4,073 of 5,629 words (2); 48k-character single line 6,343 of 8,000 words (2); six frames plus a 30k-character essay 3,193 of 5,629 words (4); one CJK paragraph 16,500 of 20,000 characters (4); minified JSON 36,353 of 38,281 characters (3); one run of 50,000 characters 35,860 of 50,000 characters (2). The other five rows are unchanged. Every rule in ADR-0087's decision still holds: no clip, at least 2% fewer words per too-tall try, at most 6 renders, the whole text tried at the floor first, the character cut, the visible marker, the card memo and `Lineup.cut`. Take these numbers as current.

**ADR-0088 (provider boundary: held keys and media admission)**

10. What the promise does not cover: "What a person types stays in their own browser tab's session draft on Start until they edit it." On main a held-key refusal makes the tab stop keeping the part that held the key, and keep the rest. On Start that is the text, the attachments or both, as the refusal names them (`forgetRefusedStart` in `apps/web/src/components/startDraft.ts`; 8ca1f06). On the Recommendation screen it is the refused example (`storeExamples` in `Examples.tsx`), and on the Run screen that question's draft (`drafts.withhold` in `run/RunScreen.tsx`; 53786e8). Both came in with the merge of fix/fx-web-consent (02701a4). The screen still shows the refused text so it can be edited, and the part is kept again once it is edited. Take as current: spec §5, Screens 1 to 3. byway's server still never stores a refused body.
11. Decision, browser to server: the check runs "on all six POST routes and `PATCH /api/settings`". On main seven POST routes read a JSON body, and all seven pass the check (`parseBody(request, …, deps.heldKeyIn)`): intakes, intakes/[id]/recommend, refs, runs, runs/[id]/control, runs/[id]/checkpoints/[checkpointId], and spend, added with the spend book (a311809). `PATCH /api/settings` does too. `POST /api/intakes/[id]/compose` reads no body. Take as current: every route that reads a JSON body is checked; `parseBody` takes the check as a required parameter, so a route that reads its body through `parseBody` cannot leave it out.

**ADR-0089 (optional reads)**

12. Decision 1: "`FIELD_ROLES` classifies it as a semantic set (ADR-0092)." On main `reads` is `semantic`, ordered (`packages/recipe/src/semantics.ts`), set when main was merged into fix/fx-semantics-2 (c76daaf). Take as current: [ADR-0098](0098-recipe-limits-disclosure-and-held-voice.md), which amends this clause.

**ADR-0091 (provider-edge billing fixes)**

13. Decision 5: "For a line that is not an entry, Settings says its spending may not be counted, that a torn last line is set aside by the next model call, …". On main Settings says what the spend book did with the line (`LINE_FATE` in `apps/web/src/view/history.ts`; c4fef59): a listed line stops paid calls until it is acknowledged, an acknowledged line is not counted by the budgets, and a torn last line is set aside the next time byway writes to the ledger. The pointer to restoring the whole data directory stays. Take as current: ADR-0095 decision 8, which replaced this wording without naming it.

**ADR-0092 (recipe semantics derived from execution)**

14. Decision 7: "of 3,453 single moves of a seq child of C1–C7 and C6a, admission accepts 1,180". That was stage 1's count. On main admission accepts 1,093 of the 3,453; the later stages ([ADR-0097](0097-a-step-takes-in-only-what-its-prompt-shows.md), ADR-0098) refuse the other 87. None of the 1,093 breaks a checkpoint protection, and declaration monotonicity still covers 3,952 changes on 13 refused bases. Counted on this branch with the placement sweep of `packages/advisor/test/corpus.test.ts`, logging its tally. Take 1,093 as current.

**ADR-0094 (backup unit is the data directory)**

15. "It also requires the README to name every file they write and to keep the caveat." On main `scripts/test/backup.test.ts` requires the caveat to be gone (b939315). Take as current: ADR-0095 decision 9, which removed the caveat and corrected the bullet before this one.

**ADR-0096 (partial restores reported at start)**

16. Decision 1 lists "the ledger's hash chain and head (`verifyLedger`)" and "runs whose recorded cost is more than $0.01 above what the ledger holds for them." On main the report checks the chain and head with `Gateway.auditLedger` and compares run costs with the spend book (`packages/runner/src/data-check.ts`; 082bebe). Take as current: ADR-0095 decision 9.
17. "F03's two restore cases sit in `restore.test.ts` as `it.fails` stubs tagged [F03]." On main they are plain tests (082bebe), as ADR-0095 decision 9 says.
18. Decision 3: an admitted request "is fetched hop by hop through Playwright's request API"; Consequences: each response is "bounded only by the render deadline and the CDNs' own file limits". On main each hop is fetched with Node's fetch and read as it streams, and a response over 20 MiB is blocked (`MAX_RENDER_FETCH_BYTES` in `packages/runner/src/render-fetch.ts`; e925386). Decision 3's hop rule is unchanged. Take as current: [ADR-0099](0099-paid-operations-keyed-to-their-caller.md) decision 8's renderer bullet.

**Outside the ADRs.** The same pass corrects, in place, the product spec, the READMEs and code comments that said run start has no server-side idempotency (untrue since ADR-0099 decision 7), that VOICE writes back through a `voice.apply` call (untrue since [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md); the advisor estimate still counts that call, which is a backlog item), that the runner holds a keepsVoice write to the latest VOICE only, that Back shows the browser's back/forward cache, and what the raw artifact address is used for. The spec's Keys paragraph and the README's Renderer section now state item 6's exception.

## Alternatives considered

- **Editing the Accepted ADRs.** Not allowed: a changed decision is not edited in place.
- **Leaving it to the later ADRs that already say what changed** (items 2 to 5 and 12 to 18). A reader of the earlier record would find no correction, and items 1, 6 to 11 and 14 have no later record at all.

## Consequences

**Positive**

- Each sentence the re-check found untrue now has a correction a reader can find from the ADR index.

**Negative**

- The corrected ADRs still carry no pointer to this record. Forward pointers inside ADRs wait on the owner's decision about the ADR-log rules (D4).
- Item 6 describes a defect that is not fixed; the backlog carries the fix.

## Evidence

- The final re-check of the external-review fixes on main 1ba72f5, 2026-10-15 to 2026-10-16 (its notes are outside the repository).
- Checked on this branch, whose code is main's: the fit probes of `fitCard` with the real renderer (item 9); the placement sweep of `corpus.test.ts` with its tally logged, `PLACEMENT TALLY {"moves":3453,"admitted":1093,"tooMany":0}` and `MONOTONICITY TOTAL 3952 BASES 13` (item 14); a probe that loads the gateway and runner the way `scripts/serve.ts` does, with stand-in values only, and captures the environment each renderer entry (`ready`, a card, `shownText`, `checkRenderer`) hands Chromium: two plain names from the file reached Chromium with a lowercase drive letter and none with an uppercase one; provider keys and secret-looking names were absent in both (item 6).
- The code and commits named in each item.
