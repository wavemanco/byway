# ADR-0082: Web client state ownership: drafts, polling and the Recommendation screen

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal 'complete implementation of all fixes that can be implemented independent of the four decisions'; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 17:00 |
| **Track** | Product |

## Context

The external review of 2026-10-08 reported three web-client defects, and the verification confirmed all three (cluster D):

- **F06 (P1).** Every "Your turn" panel kept the person's answer in its own React state, seeded from the checkpoint. Opening an earlier step, pressing Esc, a reload, Back, the run ending or a stale snapshot unmounted the panel, and the next mount silently restarted from the model's starting text. One Ctrl+Enter could then send the model's text as the person's words (VOICE). Start attachments and the Recommendation screen's "Examples you admire" had the same lifetime.
- **F14 (P2).** The Recommendation screen copied the recommendation into state once and invented a selection (`'c4'`) when there was none. "Try again" was `router.refresh()`: the failure panel read a live prop and went away, the stale copy stayed, and Memo Polish was shown as "Your choice" and sent by Start. The page's server render is also not a pure read: while no recommendation is stored it asks the model for one (F03), so a refresh can make a call nobody asked for.
- **F15 (P3).** The Run screen's polls overlapped and were applied, and set the connection state, in arrival order. A late older snapshot reopened an answered question for a poll interval; a late failure on an ended run left a permanent "byway is not answering" banner.

The shared cause: state whose lifetime differs from a React mount, or from one network response, had no explicit owner.

## Decision

Each screen's top-level client component owns its state, under three rules.

- **R1, person-authored input** is keyed by its server identity, held above every conditional render, kept for the tab session through one guarded helper (`components/sessionSlot.ts`, a versioned envelope in sessionStorage), and settled only by server state, never by a component unmounting.
  - Checkpoint drafts belong to the Run screen (`components/run/draftStore.ts`, rules in `view/drafts.ts`), one sessionStorage key per checkpoint, written 400 ms after typing pauses and at once on pagehide and unmount.
  - Kept across a reload: write, react, directive, pick and select. Compare and Choose highlights are kept in memory only: they are set by moving or flipping, and restored after a reload they would let a stray Enter keep a version the person only looked at (UX-1). Confirm has no draft.
  - A stored draft restores only into the same checkpoint id and kind, with only the options that checkpoint offers (at most k for a pick).
  - Panels are semi-controlled: each seeds once from the store and writes every change through. A mounted panel never re-reads the store, so nothing changes under the person, and a keystroke does not re-render the screen.
  - One definition of an untouched panel (`startingDraft`, aware of on-screen copy) decides whether a draft is the person's work, compared as the resolution it would send.
  - A successful answer marks its question "sent", for every kind including confirm. The turn stays locked, showing the person's own answer and "Sent", until a snapshot shows the question closed: its text fields are read-only, its choices do not change, and the store ignores any change to a sent answer, so what is shown stays what was sent. A failed send leaves the draft untouched.
  - Drafts are settled only by snapshots the screen's refresher applied, never by the server-rendered one. On Back that one is the browser's cached copy of the page, from when it was last loaded or reached: it can predate a question, or show an answered question still open.
  - Settling: a sent draft is dropped when its question closes; a draft whose stored resolution equals it is dropped (the answer landed but the response was lost); text left on a question that closed unanswered (withdrawn, answered elsewhere, or a run that ended with it still listed open) is shown read-only as "Your unsent words", with Copy and Discard and never a send control. It is kept for the tab session until discarded. A snapshot that does not list a draft's question keeps the draft while the run goes on; only a run that has ended without listing it drops it.
  - Pending debounced writes are cancelled when a draft is sent, dropped or discarded, so a discarded draft cannot come back after a reload.
  - Recommendation examples are kept per intake (pasted text as text, an image as the artifact already stored) and Start attachments under their own key. Both are cleared when the run starts. The Start text keeps its original plain-string key, so nothing needs migrating.
  - The Recommendation screen's run-budget field is not kept. It is a single visible number that the Start button repeats, so nothing is sent without the person seeing it, and it is re-typed in a second.
- **R2, server state.** A screen is seeded by its server render on navigation. After that, its server state changes only through the latest-issued poll or an explicit command's result, applied in one transition. A command returns everything it changes that the screen shows. `router.refresh()` is used only where the page's server render is a pure read. The Recommendation page's is not while no recommendation is stored, so that screen never calls it. No client-invented defaults.
  - Polling (`view/refresh.ts`, `components/useRefresher.ts`): one sequencer per key, created and disposed by an effect keyed only on that key, so status-driven delay changes and StrictMode's setup-cleanup-setup cannot dispose it under a live screen. Polls are single-flight and re-arm only after they settle; actions (an answer, Pause, Resume, Cancel) supersede and abort older requests; only the latest-issued request applies data or sets the connection state; the server-rendered snapshot is re-read through the same path. A request that has not answered after 30 s, its body included, is abandoned, applies nothing and counts as lost, so one stalled request cannot stop polling; a successful status whose body cannot be read is a failure, never an empty snapshot. While the connection is lost the screen retries every 3 s whatever the run's status, so the banner clears on an ended run too. Nav's waiting count uses the same hook.
  - Recommendation (`view/recommendation.ts`): one owned state (recommendation, problem, selection, composed recipe, workspace remaining amount) driven by pure transitions. `POST /api/intakes/:id/recommend` takes `{ answers }` (re-route) or `{ ensure: true }` (Try again: the stored recommendation, or the first one made and stored); an empty body is still refused. Both answer `{ recommendation, remainingUsd }`, and `POST /compose` answers `{ composed, remainingUsd }`, the remaining amount read after the command. The failure panel shows only when there is nothing else to show, so a recipe the person builds during a failure is shown, and Try again is then offered beside it. The page keys the screen by intake and library recipe, which do not change while it is shown.
- **R3, answerability** is derived from the whole snapshot: a question can be answered while it is open and its run has not ended. The Your turn panel, the settle rules and the unsent block all use it.

No server snapshot revision is added for now. For a local, single-user app, request sequencing gives the ordering a revision would: each applied snapshot was read after the previous applied one arrived. The runner's `view()` can still tear within one response: `cancelRun`, `failRun` and `settleLostRun` write the terminal status before withdrawing open questions, so a snapshot can read "cancelled" with a question still "open", after which polling stops. R3 is the guard for that tear. Revisit triggers: push or server-sent events, state shared across tabs, or a tear that R3 does not cover.

This extends spec §5 (Run, Recommendation) and the Recommendation screen of [ADR-0042](0042-product-north-star-recommend-or-compose.md) and [ADR-0071](0071-great-critic-falls-back-to-ok-without-references.md) (Examples you admire). It supersedes nothing.

## Alternatives considered

- **A server snapshot revision plus a client draft store.** This would guarantee ordering in storage, but needs a migration and a contracts change, and the draft store is needed anyway. It guards only against tears that R3 already neutralises, so it is recorded as a revisit trigger, not built.
- **Symptom patches.** For example, keep YourTurn mounted but hidden, and refresh only when a recommendation is stored. This is small, but drafts would still be lost on reload, Back and run end, a hidden panel could take the global Ctrl+Enter, and the client would depend on the server render's side effects.
- **Server-persisted drafts (an autosave endpoint).** Drafts would survive a crash or a closed tab, but this needs write fencing against answers, and it is disproportionate for a local app. Unsent text is still lost when the tab is closed or crashes, and this record says so.

## Consequences

**Positive**

- Inspection, Esc, a reload, Back (with or without a reload before it), the run ending and a stale snapshot all restore the person's own draft. The model's starting text can no longer stand in for their words, and a sent answer cannot be changed while byway confirms it.
- A late snapshot or a late failure cannot move the Run screen backwards or leave a false banner. Server fencing (409s on stale answers) is unchanged.
- Recovery on the Recommendation screen shows the stored recommendation with its reasons, the raised workspace figure and a working chooser. Start sends the recipe that is shown, and no action on that screen asks the model behind the person's back.

**Negative**

- Eight panel components take a draft and write it through; the Your turn panel renders one effect tick after hydration, so the server HTML no longer contains it.
- Drafts last for the tab session only. Closing the tab, or a crash, loses unsent text.
- Back first shows the browser's cached copy of the Run page until the refresher's first answer (about a tenth of a second against the local demo build). In that moment a question answered since can still look open with its starting text; sending it then is refused by the server (409), as before this record.
- The Playwright suite gains a last-running `recovery` project that leaves one synthetic $1 ledger line in the suite's temp data directory; it is skipped when the main suite fails.

## Evidence

- Verification of the external review: [docs/reviews/2026-10-08-external-review-verification.md](../reviews/2026-10-08-external-review-verification.md), cluster D (F06, F14, F15).
- The external review: `C:/Users/arvik/code/byway_review/byway-review.md` (read-only), findings F06, F14 and F15.
- End-to-end: `apps/web/e2e/state.spec.ts` and `recovery.spec.ts`. Run against the unchanged client, each case failed for its reported reason: the answered question came back, the editor showed the model's text after inspection, list items and attachments were lost, no Sent lock and no unsent block, "Memo Polish" after recovery, and the composed recipe hidden behind the failure panel.
- Unit: `apps/web/test/refresh.test.ts`, `drafts.test.ts`, `draft-store.test.ts`, `session-slot.test.ts`, `recommendation.test.ts`, `api-client.test.ts`, the restored-draft and read-only-while-sent cases in `panels.test.ts`, and the command cases in `api.test.ts` (`{ ensure: true }` was a 400 before).
- Re-check before merge (2026-10-08). An adversarial verifier found that the first version of this change, and of this record, claimed more than the code did. Back without a reload deleted the draft: the cached page, rendered before the question opened, settled it as "not in this run". The e2e case for Back had reloaded first. The "Sent" lock could be edited, and the edit was then listed as unsent. A body cut off by the 30 s timeout was applied as an empty snapshot and crashed the screen. All three were fixed test-first in the same branch. The new e2e case "reached from Start with no reload…" covers History then Back and Settings then Back. The "refused answer…" case now covers typing after Sent, and Back while byway is unreachable.
