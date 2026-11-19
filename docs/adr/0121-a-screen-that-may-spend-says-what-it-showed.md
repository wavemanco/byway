# ADR-0121: A screen that may spend says what it showed, and a run is explained as it runs

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User. On 2026-11-17 the owner chose for backlog row B-199 "Own item right after B-188 (Recommended)", and on 2026-11-18, after its five checks, "All of it, one round (Recommended)" (after the first and the second), "Compare with what the tab showed (Recommended)" (the third), "Fix the run's explanation, row the rest (Recommended)" (the fourth) and "Fix all to match, then merge (Recommended)" (the fifth). Each option is quoted whole in B-199's row and in [the conversation record](evidence/conversation-continued.md). How each is built is Claude's. |
| **Date (local, UTC−8)** | 2026-11-18 13:01 (the conversation record's 14:01, which it writes at UTC−7) |
| **Track** | Product |
| **Related** | [ADR-0092](0092-recipe-semantics-derived-from-execution.md), [ADR-0099](0099-paid-operations-keyed-to-their-caller.md), [ADR-0117](0117-byway-answers-only-the-person-who-started-it.md) |

## Context

A Recommendation screen drawn in demo mode says nothing is charged. Demo mode can be turned off in another tab while it is open, and its Start, Build my own and re-routing then bought real calls; the demo banner was drawn once per tab; and a recipe the person built was checked again at Start against what was stored, not against what the tab showed (backlog row B-199, and its five checks).

## Decision

1. Every request of the Recommendation screen that may buy a call (Try again, re-routing, Build my own, Start) carries the mode the screen showed, and byway answers 409 `mode-changed` when the mode has changed, before any call. A Start sent again under its run's id gets that run back, with the recipe and profile it started with.
2. The demo banner reads the mode again on each screen and while the tab is in view (GET /api/mode); on the screen of a run started with real models it says "Demo mode is on for new runs; this run uses real models". Settings' demo switch says runs under way keep their models.
3. A recipe the person built is shown as byway would admit it now, with no model call, and its view carries a digest of what it shows (its explanation and estimate); its Start sends the digest back and is compared with it.
4. Neither a page draw nor a refused Start writes the intake; a Start keeps its admission on the intake only once its run has started. A recipe built from one byway no longer has is shown refused when drawn.
5. A composed run is explained under its own profile, by the advisor of byway's services as started, so no later Start changes what its screens say; when that cannot be done (its source gone, its profile or a model no longer priced), it is explained as stored.

## Alternatives considered

- **"Fold it into round 5"** (when B-199 was filed, 2026-11-17): the fix inside B-188's fifth round. Not chosen: B-199 is on the money path and got its own check.
- **"A row for later"** (then): before the first live run. Not chosen: a screen saying nothing is charged could start a run that spends.
- **"The regression and the paid buttons"** and **"The regression only"** (after the first check): Not chosen: each left a screen saying "no AI calls" or "nothing is charged" while byway spent (the banner, Build my own, re-routing).
- **"The resend only"** and **"Record all, then merge"** (after the second): Not chosen: the banner would have said "no AI calls" over a run using real models, and a demo-built recipe's first Start would still have been refused once.
- **"Show without storing only"** and **"Back out the re-admission"** (after the third): Not chosen: the first leaves the first Start after a reload refused once, and the second shows a stale explanation again.
- **"Correct the record, row both, merge"** (after the fourth): Not chosen: a running run's screen could say no images are made while it buys them. **"Fix both now"**: Not chosen: a library recipe's profile change is not demo mode's, and is B-200.
- **"The same, then one more lens"** and **"Records only, then merge"** (after the fifth): Not chosen: the change was one write moved and a fallback, and records alone would have left the code doing what item 4 says it does not.

## Consequences

- A library recipe's Start still runs on the profile Settings names when it is pressed, at its cost then (backlog row B-200).
- Building a recipe again on the same problem leaves a run started from the earlier one with no recipe on its screens, from before this record (backlog row B-201).
- A Start that sends no digest (a script) is compared with what is stored, and on a 409 it writes the new admission so its next try can pass.
- If it breaks: a 409 "Demo mode was turned off since this page was shown" on a screen nobody changed means the screen's mode and byway's differ (`refuseChangedMode`, apps/web/src/server/api.ts); "now explains it differently" on a freshly drawn screen means its digest and the Start's admission differ (`shownDigest`); a run whose screen explains a step it does not do means `recipeForRun` did not get the run's advisor (`runAdvisor`, apps/web/src/server/deps.ts).

## What this changes in earlier records

- [ADR-0092](0092-recipe-semantics-derived-from-execution.md): item 5's "the intake keeps the result either way" now holds only for a Start that starts (item 4 above), and a recipe whose source is gone is no longer recorded on the intake as `ADMIT-NEAREST`: it is shown refused when drawn, and refused at Start as before. Its 409 `composed-changed` is decided against what the sending tab showed (item 3).

## Evidence

- apps/web/test/api.test.ts and start-admission.test.ts (each refusal, the resend, the two tabs, a run explained under its own profile, a refused Start writing nothing), apps/web/test/deps.test.ts (the run's advisor wired in), apps/web/test/recommendation.test.ts (the reload), apps/web/e2e/configurations.spec.ts (the banner) and composed-start.spec.ts.
- Backlog row B-199, with its checks and the owner's answers; [the conversation record](evidence/conversation-continued.md).
