# ADR-0121: A screen that may spend says what it showed, and a run is explained as it runs

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User. On 2026-11-17 the owner chose for backlog row B-199 "Own item right after B-188 (Recommended)", and on 2026-11-18, after its checks, "All of it, one round (Recommended)" twice, "Compare with what the tab showed (Recommended)" and "Fix the run's explanation, row the rest (Recommended)". Each option is quoted whole in B-199's row and in [the conversation record](evidence/conversation-continued.md). How each is built is Claude's. |
| **Date (local, UTC−8)** | 2026-11-18 13:01 (the conversation record's 14:01, which it writes at UTC−7) |
| **Track** | Product |
| **Related** | [ADR-0092](0092-recipe-semantics-derived-from-execution.md), [ADR-0099](0099-paid-operations-keyed-to-their-caller.md), [ADR-0117](0117-byway-answers-only-the-person-who-started-it.md) |

## Context

A Recommendation screen drawn in demo mode says nothing is charged. Demo mode can be turned off in another tab while it is open, and its Start, Build my own and re-routing then bought real calls; the demo banner was drawn once per tab; and a recipe the person built was checked again at Start against what was stored, not against what the tab showed (backlog row B-199, and its five checks).

## Decision

1. Every request of the Recommendation screen that may buy a call (Try again, re-routing, Build my own, Start) carries the mode the screen showed, and byway answers 409 `mode-changed` when the mode has changed, before any call. A Start sent again under its run's id gets that run back, with the recipe and profile it started with.
2. The demo banner reads the mode again on each screen and while the tab is in view (GET /api/mode); on the screen of a run started with real models it says "Demo mode is on for new runs; this run uses real models". Settings' demo switch says runs under way keep their models.
3. A recipe the person built is shown as byway would admit it now, with no model call, and its view carries a digest of what it shows (its explanation and estimate); its Start sends the digest back and is compared with it.
4. Neither a page draw nor a refused Start writes the intake; a Start that starts keeps its admission. A recipe built from one byway no longer has is shown refused when drawn.
5. A composed run is explained under its own profile, by the advisor of byway's services as started, so no later Start changes what its screens say.

## Alternatives considered

Each with why it was not chosen, in B-199's row: "The regression and the paid buttons" and "The regression only" (the first check); "The resend only" and "Record all, then merge" (the second); "Show without storing only" and "Back out the re-admission" (the fourth); "Correct the record, row both, merge" and "Fix both now" (the fifth); "Fold it into round 5" and "A row for later" (when B-199 was filed).

## Consequences

- A library recipe's Start still runs on the profile Settings names when it is pressed, at its cost then (backlog row B-200).
- A Start that sends no digest (a script) is compared with what is stored, and on a 409 it writes the new admission so its next try can pass.
- If it breaks: a 409 "Demo mode was turned off since this page was shown" on a screen nobody changed means the screen's mode and byway's differ (`refuseChangedMode`, apps/web/src/server/api.ts); "now explains it differently" on a freshly drawn screen means its digest and the Start's admission differ (`shownDigest`); a run whose screen explains a step it does not do means `recipeForRun` did not get the run's advisor (`runAdvisor`, apps/web/src/server/deps.ts).

## What this changes in earlier records

- [ADR-0092](0092-recipe-semantics-derived-from-execution.md): item 5's "the intake keeps the result either way" now holds only for a Start that starts (item 4 above), and a recipe whose source is gone is no longer recorded on the intake as `ADMIT-NEAREST`: it is shown refused when drawn, and refused at Start as before. Its 409 `composed-changed` is decided against what the sending tab showed (item 3).

## Evidence

- apps/web/test/api.test.ts and start-admission.test.ts (each refusal, the resend, the two tabs, a run explained under its own profile), apps/web/test/recommendation.test.ts (the reload), apps/web/e2e/configurations.spec.ts (the banner) and composed-start.spec.ts.
- Backlog row B-199, with its checks and the owner's answers; [the conversation record](evidence/conversation-continued.md).
