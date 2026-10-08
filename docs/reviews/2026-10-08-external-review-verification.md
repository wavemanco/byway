# Verification of the external byway review (8 Oct 2026)

**Review checked:** `C:\Users\arvik\code\byway_review\byway-review.md` (20 defect findings F01–F20, five release actions R1–R5, research prerequisites RS), written against commit `b33f128`, which is the repo's current `main`.

**Method.**
- **Verification:** every defect finding was checked against the repo by two opposed agents. One reproduced each claim with its own probes; the other tried to refute it (already handled, out of scope, overstated, wrong mechanism). Release items and RS had one agent doing both.
- **Clustering and design:** findings were grouped by shared root cause into 10 clusters. A designer per cluster settled the verdicts against the code and proposed 2–6 fix options.
- **Attack and revision:** two critics attacked each recommendation, one on root cause and completeness, one on regressions and scope. The designer then revised, and a final check confirmed every blocking point was closed.
- **Extra round:** clusters A and E needed a third round with fresh critics.
- **Totals:** 113 agents, all completed.

**Integrity.**
- The review folder is unchanged: 1,254 files plus 31,220 under `validation/node_modules`, hash-identical before and after.
- The repo is unchanged: HEAD `b33f128`, `git status` clean, untracked files included.
- **One incident:** a critic's probe used `cmd.exe` as a stand-in browser. It misparsed a path and created 68 empty directories in the repo root. The agent removed exactly those, and I re-verified the repo afterwards.

**Bottom line.**
- **No finding is rejected outright.** Every one points at something real.
- **The review is not accurate as written.** Fourteen of the 26 items are only partly right: a wrong mechanism, overstated impact, or a root cause placed at the symptom. Eight severities drop (four P1s to P2: F02–F05; four P2s to P3: F11, F15, F16, F17). Three P1s are confirmed: F01, F06 and F07.
- **Several findings are wider than the review says.** The most important is F01. An execution oracle found 72 of 3,453 single-step moves of the canonical recipes that silently break a human-checkpoint protection today.

## 1. Verdicts

Severity uses the review's scale: P1 means repair before relying on the guarantee in paid use, P2 is material correctness, reliability or security hardening, and P3 is a bounded standards defect.

| ID | Finding | Label | Severity (review → verified) | Verdict | Why (grounded in the repo) |
|---|---|---|---|---|---|
| F01 | Recipe checks trust declared effects | Human authority / admission | P1 → **P1** | **Accept, partly** | The `writes:false` spoof reproduces: a model fix after C4's VOICE passes, and the runner applies it anyway (`voice.ts:22`, `interpreter.ts:324`). Role-only prompt binding reproduces (`profile.ts:128-131`). The issue is **much wider** than the review: declared 'voice' ports, picks or keep-or-revert placed after VOICE, VOICE placed after a loop exit point, keepsVoice checked only against the latest VOICE, and block labels all let a composed recipe pass while execution breaks the protection. Overstated: the runner-entry "bypass". No product path starts an unchecked recipe; the real gap is that `ok` is never re-checked at start. |
| F02 | No ceiling on expanded work | Resource bounds | P1 → **P2** | **Accept, partly** | `n: z.number().int()` has no upper bound, and expansion is eager (`interpreter.ts:427`). The real failure is a run wedged in "running", with nothing spent. Memory exhaustion is overstated, because the isolate deadline fires first. Added by the verifiers: seeds are passed by value, so payload grows quadratically and hits Temporal's 4 MB limit. A retrying gate inside a fan-out also orphans its siblings. |
| F03 | Paid operations have no durable lifecycle | Spend-cap integrity | P1 → **P2** | **Accept, partly** | Reproduced: the cross-process reservation race (web and worker each keep their own in-memory set), the memo race, and the damaged ledger failing open. **The review's fal mechanism is wrong**: poll exhaustion is non-retryable. The real re-buy paths are the SDK's hidden submit retries (`QUEUE_RETRY_CONFIG`), the gateway's 5xx re-submit, and a worker dying mid-clip. Every leak is bounded, hence P2. |
| F04 | Estimates used as guaranteed caps | Cost-cap enforcement | P1 → **P2** | **Accept, partly** | Anthropic's server-side refusal fallback is on by default and is never reserved for. Corrected cost: up to about 2× on Sonnet 5.5, 2.25× on Opus 5.5 and 1.5× on Fable 5.1. The verifiers also found **sticky routing**, which the review missed. The overspend is neither silent nor continuing, because settlement is correct and the next call is refused. Chars/3 is not a bound for dense text. |
| F05 | Full-size HTML runs scripts without consent | Security, consent bypass | P1 → **P2, fixed first** | **Accept** | Every claim holds. `/artifacts/<id>` always sends `sandbox allow-scripts` and is cached for a year. Seven in-app paths open it top-level, including the Result screen's "Open in a new tab", which the review missed. Meta refresh leaks even without JavaScript, and the app CSP has no `frame-src`. Not P1: it needs hostile page content plus a click, and only that document's own text can leave. |
| F06 | Unsent human drafts lost on inspection | Human work, data loss | P1 → **P1** | **Accept** | Reproduced in a production build. Selecting any step unmounts Your turn, and every panel keeps its draft in `useState`. A remount restores the model's text, and Ctrl+Enter can then send it as "Your words". Polling and failed submits already keep the draft, so those are regression checks, not failures. |
| F07 | Page-copy check is loose string membership | Human authority (VOICE) | P1 → **P1** | **Accept** | Every claim reproduces: deleted text survives, duplicates and reordering pass, links are flattened, and an entity can raise a RangeError. The issue is **wider**. The "unchanged" test squashes whitespace, the last block can't be emptied, the tokenizer ends a tag at a `>` inside a quoted attribute, non-web media fall back to a model, and keepsVoice uses a substring check. Canonical C5 is affected today: appended or reordered voice-over text passes. |
| F08 | Composition diff hides real changes | Disclosure accuracy | P2 → **P2** | **Accept** | `case 'pick': return;`, and loops are compared only on metric and max. A human pick changed to random, or the threshold dropped from 9 to 1, both read "The same steps". Many more fields are also silent. |
| F09 | C7 clarification never reaches the build | Human direction dropped | P2 → **P2** | **Accept, partly** | Reproduced. The root cause is not the catalog wiring but the recipe format: it can't express "read this port if the optional branch produced it" (ST5). The human step also **replaces** the interview's questions with bare answers. The review's warning that requiring the port "would introduce another bug" is wrong. |
| F10 | C5 shot check never sees the clip | Evidence observation | P2 → **P2** | **Accept** | The render ignores `clipArtifactId`, so a clean and a defective clip give identical input. **Wider than reviewed**: the check isn't scoped to its shot, regenerations can't change its input (9 video calls instead of 3), and with no video key it reports "No defects." for clips never made. |
| F11 | C3 "no image" answer fails the run | Prompt/runtime contract | P2 → **P3** | **Accept, partly** | The mismatch is real. A run failure needs the model to return an empty list twice, ignoring corrective feedback. `helper@prose` is unreachable. The person has already opted in to the image, so the prompt's veto is the odd part. |
| F12 | Media slots validated one way, attached another | Slot identity, relay anchor | P2 → **P2** | **Accept, partly** | The whitespace and alias cases are real but improbable. The consequential defect, which the review under-weighted: if shot 1's image is missing or fails, shot 2's still silently becomes the start frame of shot 1's paid clip. |
| F13 | Review views silently omit content | Evidence completeness | P2 → **P2** | **Accept** | The 16 KB excerpt is shown as the whole artifact. The step-row diff counts are computed from the excerpt: a 12-file diff reads "4 files". Lineup cards clip at 2,576 px with no record of the cut. |
| F14 | Recommendation not refreshed after retry | Client state | P2 → **P2** | **Accept** | Reproduced. After "Try again" the screen shows "Memo Polish / Your choice", and Start would launch c4. The cause is state copied once at mount, a hard-coded `'c4'` fallback, and a `router.refresh()` whose server render can call the model. |
| F15 | Out-of-order polls regress run state | Client race | P2 → **P3** | **Accept, partly** | The mechanism reproduces, but visible spend can't go down and a regressed status heals within one poll. The real lasting harm is a false "not answering" banner that sticks on ended runs. |
| F16 | Secrets not stripped from returned results | Secret boundary | P2 → **P3** | **Accept, partly** | It reproduces, but the leak **starts at input**. A pasted key is stored and sent to the provider before any echo, and the review missed this. Error paths are already redacted. Shape-based redaction would corrupt legitimate text. |
| F17 | Media fetch trusts URLs and buffers first | Provider trust boundary | P2 → **P3** | **Accept, partly** | The review's `https://127.0.0.1` case fails TLS under real `fetch`. The real vector is a redirect down to `http://` on loopback or LAN, and the cap is checked only after buffering. **New**: a CDN 401 is misread as "no video key" after the clip was billed. The attacker would have to be fal itself, its CDN, or a MITM. |
| F18 | Renderer Chromium runs unsandboxed | Security hardening | P2 → **P2** | **Accept** | Playwright adds `--no-sandbox`, and the renderer inherits the provider keys. **Wider than reviewed**: the renderer also decodes user-uploaded and provider images, an attack path that needs no model involvement. |
| F19 | Canonical JSON skips key validation | Standards conformance | P3 → **P3** | **Accept** | Reproduced. `sha256Hex` has the same flaw. The review's one-line repair would turn three clean failure paths into uncaught throws. |
| F20 | Loop cap substitutes for the person's decision | Gate-exit semantics | P2 → **P2** | **Accept, partly** | Confirmed: a human loop exits at its cap without asking. **Wider**: critic loops whose gate can't see their critic also skip the cap question. The consequence is overstated, because every capped human loop in the catalog is followed by an always-run VOICE. |
| R1 | No CI; toolchain not pinned | Release engineering | — → **P3** | **Accept, partly** | No CI exists, although four accepted documents assume one. Dependencies are already pinned by the lockfile. Teardown diagnostics are intended (ENG-10). `pnpm test` needs Chromium and the Temporal CLI, so the README's "no network" line is wrong. |
| R2 | Licence decisions before distribution | Third-party licensing | — → **none** | **Accept, partly** | The facts hold, but nothing is distributed. lightningcss is dev-only and sharp is unused. The review's inventory misses caniuse-lite (CC-BY-4.0), libraries bundled inside sharp, runtime downloads and the missing root LICENSE. |
| R3 | Decision records drift without pointers | Documentation | — → **P3** | **Accept** | ADR-0041 reads "Accepted" over proposal text. The verifiers found more: 0077 and 0079 change 0071 without back-links, 0080 corrects three ADRs that don't point back, and the README's ADR range is stale. CR14's append-only check isn't implemented. |
| R4 | No backup unit or tested recovery | Operational resilience | — → **P3** | **Accept** | ADR-0066's "one file to back up" is **wrong**: committed data sits in the WAL. A missing or rolled-back ledger resets spend to zero, so caps fail open. A store older than Temporal is unhandled. |
| R5 | Accessibility only checked statically | A11y test coverage | — → **P3** | **Accept** | Confirmed. Controls that disable themselves drop focus. The paid "Start" button's only double-submit guard is the DOM `disabled` attribute, and there is no server-side idempotency behind it. |
| RS | Research prerequisites and seed wording | Docs accuracy / research | — → **P3** | **Accept, partly** | "External seed strings untested" is false against the cited source, String Seed of Thought §5.1.2 and App. D.6, on five surfaces. The activation requirements restate already-accepted ADRs and are inert while the study registry is empty. |

## 2. Fix options and recommendations (per root-cause cluster)

Effort: S small, M medium, L large, XL extra large. "Root" is whether the option fixes the root cause (yes / partly / no).

| Cluster (findings) | Root cause | Options considered (root, effort): main pro / main con | Recommended | Why this one |
|---|---|---|---|---|
| **A** Executable semantics (F01, F02, F08, F20) | Admission and execution use two definitions of what a recipe does. Admission trusts declarations and structural approximations; execution derives effects from actor, role, medium, variant and the enclosing operator. | **A** separate compiled plan IR (yes, XL): one artifact checked and run / a second IR, an interpreter rewrite, research-pin churn. **B** per-finding patches (partly, M): fast / leaves the operator, exit-point, held-voice, label and scope variants open. **C** one semantics module read by every consumer (yes, XL; stage 1 is L): no second IR, no hash changes / touches 8 packages and retires open runs twice. **D** remove self-declared fields from the schema (partly, L): spoofs become inexpressible / changes every hash, including research pins, and still needs C. | **C**, in four stages; the P1 closes in stage 1 | Writes down once the semantics the runner already executes (effects table, whose words, loop exit points, operator effects, held voice, limits by owner, one cap policy). Every reader uses it, and declarations can only make a step stricter. Evidence: 0 of 4,256 single declaration changes admit a refused recipe; 0 of 3,453 single moves break a protection (72 today); no catalog verdict or hash changes. Two ADRs. |
| **B** Paid operations and caps (F03, F04) | No durable, shared record of a paid call between admission and settlement, and admission doesn't match the billing plan actually dispatched. | **A** the review's full lifecycle plus reconciliation UI (yes, XL): covers everything / XL, rewrites memo semantics, more than one user needs. **B** targeted patches plus a reservation table (partly, M): quick wins / exposure stays scattered, fal re-buys and crash orphans uncounted. **C** a durable SQLite spend book as the cap authority, single-model dispatches, leases tied to the caller, JSONL kept as the audit trail (yes, L, nearer XL): one correction at the admission boundary, no workflow change / rewires every paid admission. **D** the JSONL ledger as the only authority, with lease records (yes, L): no new port / a transactional database built on an append-only file under lock contention. | **C**, staged: stage 1 (provider-edge fixes) ships first | Fixes the cross-process race, crash and stop orphans, lost fal jobs, torn ledgers and the fallback overrun at one boundary. Every dispatch bills the model it was admitted for. Stage 1 delivers the most valuable fixes without the new table: fal submits once, the torn tail is quarantined, fallbacks are turned off. **Your decision needed:** turning off Anthropic's server-side refusal fallbacks departs from Anthropic's opt-in recommendation, which it gives so that classifier false positives don't become outages. |
| **C** Viewer consent and evidence completeness (F05, F13) | A representation built for one viewing context is reused in a stricter one, and the boundary can't carry the needed property (consent, completeness, fit). | **A** a central viewer route, rich metadata, paginated cards (partly, XL): one audit point / nested frames for no gain, speculative fields, breaks one-image-per-label. **B** each boundary states its context (partly, L): an inert response unless a same-origin iframe asks with consent, a `/view/<id>` viewer, `frame-src 'self'`, an excerpt field marked partial, whole text in decision views, text critics get full words / image-only critics still have a disclosed budget. **C** a minimal header gate (partly, S): smallest / year-long cached permissive responses remain, and full-size C1 pages regress. **D** no page scripts at all and no text in pictures (yes, L): strongest invariants / the person would judge a different page than the critic saw, and it reverses ADR-0080. | **B**, as three separately shippable changes, F05 first | Puts consent in the response itself, which covers typed URLs, history, Markdown links and future links. It closes meta refresh and off-site frame navigation (Chromium prototype: zero leaks). It makes completeness part of the data contract. The only limit left, words beyond one card for image-only critics, is measured, visible and disclosed rather than silent. |
| **D** Web client state (F06, F14, F15) | The client has no explicit owner for state that outlives a React mount or a single response. | **A** a server snapshot revision plus a client draft store (yes, XL): ordering guaranteed by storage / store migration and contract change, and still needs B. **B** screen-level client owners (yes, L): checkpoint-keyed drafts in session storage, settled only by server state; single-flight, latest-wins polling; recommendation commands that return what they change, no `router.refresh()`, no `'c4'` default / eight panels touched, drafts don't survive closing the tab. **C** symptom patches (partly, S): small / drafts still lost on reload or run end, and a hidden panel could submit. **D** server-persisted drafts (yes, XL): survives a crash / autosave endpoint and write-fencing races, overbuilt. | **B** | Fixes all three at the boundary where the assumption lives, with no contract, store or workflow change. Request sequencing gives the ordering a revision column would. The one tear that can stick is handled by deriving whether a question can be answered from the whole snapshot. The revision column is recorded with triggers for revisiting it. |
| **E** Exact page copy (F07) | The person's copy may be rewritten by a model, a lossy fallback or a non-browser reader, then accepted by a check weaker than the edit. | **A** one exact copy contract (yes, L): a browser-faithful tokenizer, total readers, deterministic apply, an independent verifier at VOICE, an exact lock afterwards, no model in VOICE / about 600 new lines and a small bracket notation for links. **B** the review's segment IDs plus a structured editor (yes, XL): explicit decisions / contract, store and UI changes, and it retires every open run. **C** exact checks with the model still placing copy (partly, M): smaller / link coverage still unverifiable, and demo mode gets stuck. **D/E** deterministic placement with heuristics (partly, L/M): no notation / heuristics decide links, or the person is forced to keep words. | **A**, as two activity-only stages (no workflow-bundle change, so no runs retired) | Every write of the person's copy becomes a deterministic application of exactly what they stated, checked exactly. Closes the live canonical C5 gap: voice-over changes are now written back and noted. One known out-of-scope mechanism is parked: C5's gate retry dropping the late VOICE (VOICE-RETRY). |
| **F** Medium-specific contracts (F09–F12) | The runtime doesn't execute what each step's declaration, prompt and copy promise, and has no honest degraded outcome. | **A** reword the promises to match the runtime (no, S): low risk / removes value the person pays for. **B** the review's repairs as written (partly, XL): matches its checklist / a pass-through brief executor, breaks C7's blind passes, adds new late paid failures. **C** one correction per boundary (yes, L): optional `reads` in the recipe format; a human step revises a port in place; the link view shows the start frame and the clip's last frame, "not checked" without a clip; ASSET image count declared by the prompt, one slot identity, honest short-answer degradation, anchor is shot 1 or the link is skipped / c7's hash changes, interpreter changes retire open runs once. **D** a generic step-contract framework (yes, XL): one source of truth / speculative. | **C** | Each fix sits where its assumption lives and reuses existing mechanisms. It removes the fatal short-answer outcome without adding new late failures, and makes the shot check's input depend on the actual clip. **Your decision:** removing C3's model veto, so your "yes" to an illustration decides. |
| **G** Gateway trust boundary (F16, F17) | The gateway treats any value that reaches it as benign. Its guarantees cover only its own diagnostic copies. | **A** the review's repair (partly, L): closes the echo copies / input path left open, shape redaction corrupts text, no fix for the 401 misread. **B** exact held-key checks at every crossing plus one media admission rule for every URL and redirect hop (yes, M): keys refused at input, never sent, never handed on; media only from fal's domain over verified HTTPS, streamed byte cap, typed from bytes / touches web, gateway and fal; fal's live host set unconfirmed. **C** narrow the docs and patch two lines (partly, S): smallest / exposure documented away. **D** B with a deny-list (partly, M): no live-host risk / bypassable, for example via `localhost.`. | **B** | Only option that removes the assumption at every crossing, without rewriting product text. An unconfirmed fal host costs at most one billed clip per attempt, with a message naming the host. Stored evidence from earlier live runs can confirm the host set at no cost. |
| **H** Renderer sandbox (F18) | The single launch point states no containment policy, so it inherits "no sandbox" and the full environment, keys included. | **A** sandbox plus a separate least-privilege process or account (yes, L): strongest / needs admin rights, adds little over Chromium's own split. **B** contain at the launch point (yes, M): sandbox on by construction, no launch parameters, no secrets in the environment, fail closed with a plain message, readiness check before paid steps / Linux hosts with restricted user namespaces, root or containers stop rendering. **C** flip one flag (partly, S): smallest / keys stay in the environment, callers can undo it. **D** a hardened container (yes, XL): strong isolation / contradicts ADR-0067's Docker-free product. | **B** | Fixes both halves (sandbox and secrets) at the one place every render passes through. Verified on Windows: pixel-identical tiles, about 100 ms launch. **Your decision:** hosts that can't sandbox no longer render; should an explicit opt-out exist? |
| **I** Canonical JSON (F19) | Well-formed text is a precondition of hashing, but it's enforced in one branch only. | **O1** the review's one-liner (partly, S): RFC-conformant / three new uncaught throws. **O2** plus catches at callers (partly, S): no new throws / per-caller patches. **O3** O1, plus `sha256Hex` refuses ill-formed text, plus hashability guaranteed where untrusted text enters (recipe parse, ledger read-back, provider labels) (yes, S): no hash changes / narrows what the recipe format accepts. **O4** boundaries only (no, S). **O5** O3 without provider labels (partly, S). | **O3** | Fixes the library and makes "parsed means hashable" true by asking the hasher itself. It also fixes a reproduced case where a billed call is lost from the ledger. No valid hash changes. |
| **R** Release items and research prerequisites (R1–R5, RS) | Release guarantees are written in prose and never tied to a check that runs on its own. | **A** five separate actions (partly, L): auditable / adds another drifting summary, makes licence decisions too early. **B** one provisioned release gate (yes, L): `pnpm verify` in CI on a pinned toolchain; ADR relations and CR14 checked against git history; a defined backup unit plus a data-directory report at start-up; one shared ActionButton replacing `disabled`; keyboard e2e; seed wording fixed through the Corrections log / needs branch protection and Actions minutes. **C** docs and backlog only (no, S): fast / everything stays honour-system. **D** a full release platform (yes, XL): maximal / speculative, and checking generated pages with axe would expose a study instrument (CR12). | **B** | Turns every promised CI check into one real gate that runs on its own, anchored in things an editor can't regenerate. Licence and research prerequisites become backlog gates on the steps that would create them. **Your action:** enable branch protection and Actions minutes on the private repo. |

## 3. Adversarial passes on the recommendations

| Cluster | Rounds | What the critics forced | Final check |
|---|---|---|---|
| A | 3 (round 3 with fresh critics) | Each round found a hole. Round 2: a declared "voice" source could satisfy the VOICE protection. Round 3: "always runs" was structural, not executed (loop exit points), keepsVoice was checked only against the latest VOICE, and block labels were read as executed. Round 3 also found that the F02 byte bound must count seeds passed by value. | **Pass**. Four non-blocking residuals remain, including run inputs passed by value. That is backlog, at P2. |
| B | 2 | Corrected Anthropic's fallback routing per model. Replaced a byway-owned routing table with fallbacks off. Added an idempotent absorb step for the ledger, and held a settled operation until its invocation ends. | **Pass**. Eight non-blocking residuals: lease-expiry timing, key-resolution wording, OS-crash audit gaps, effort nearer XL. |
| C | 2 | Added `frame-src 'self'` and the Result screen's link. Found false diff counts in step rows. Dropped a font-size floor that cut capacity by 44%. | **Pass**. Four non-blocking wording and test-plan items. |
| D | 2 | Made the refresher safe under StrictMode. Added a "sent" lock and read-only recovery of drafts on closed questions. Stopped the Recommendation screen from re-running its server render, which can call the model. | **Pass**. Six non-blocking items, for example a per-request poll timeout. |
| E | 3 (round 3 with fresh critics) | Closed the C5 on-screen lock firing on a shot-labelled voice-over script. Made the tokenizer handle a quoted `>`, CDATA and raw text. Made the verifier linear. Named link destinations in the prompt. | **Pass**. Six non-blocking edge cases, for example duplicate shot numbers and script-escaped content. |
| F | 2 | Moved the image count from the medium to the prompt. Made short answers degrade instead of failing late. Withdrew middle-frame sampling, which would have added a new paid failure. | **Pass**. Four non-blocking wording items. |
| G | 2 | Rejected a deny-list as bypassable. Mapped CDN statuses as media failures. | **Pass**. Four non-blocking items; the live fal host set is a stated trade-off. |
| H | 2 | Added a readiness check before spending. Removed launch parameters. Tests now use the real failure shape. | **Pass**. Five non-blocking items. One is a process incident, the 68 empty directories, which the agent cleaned up and I verified. |
| I | 2 | Guarantee hashability by asking the hasher, not by a second Unicode walk. Added the provider-label path. | **Pass**. Four non-blocking wording items. |
| R | 2 | Check CR14 against git history, not a regenerable manifest. Shared action primitive. No `packageManager` pin that would force a pnpm download on users. | **Pass**. Six non-blocking items. |

## 4. Decisions only you can make

1. **Anthropic refusal fallbacks off** (B). This protects spend caps and keeps one engine for the product and the study, but a classifier false positive then fails the step instead of being rescued.
2. **Hosts that can't run Chromium's sandbox** (H): they stop rendering. Should an owner opt-out exist?
3. **C3 illustration veto** (F): should your "yes" to an image decide, rather than the model?
4. **Repo administration** (R): branch protection, Actions minutes, and confirming the new ADR-log rules, which touch ADR-0001 and CR14.
5. **ADR numbering**: several designs provisionally claim ADR-0081, so numbers are assigned in merge order.

## 5. Suggested order

1. F05 (cluster C change 1), F06 (cluster D slice 1) and F07 (cluster E stage 1). Ordinary use reaches all three.
2. Cluster B stage 1 (fal submit once, ledger torn tail, fallbacks off), then the spend book.
3. Cluster A stage 1 (closes the F01 P1 at admission), then the remaining stages with F02, F08 and F20.
4. Cluster F, then G, H and I. Cluster R's release gate can start any time; it doesn't depend on the others.


---

# Appendix: detail per cluster

Verbatim from the final adjudicated design of each cluster (after the adversarial rounds). File and line references are to commit `b33f128`. Probe paths refer to the agents' scratch folders under `C:\Users\arvik\AppData\Local\Temp\byway-review-verify\`.


## Cluster A: Executable plan, admission and composition semantics

**Root cause.** The recipe IR has no single authoritative definition of what its constructs do. The interpreter's behaviour is the de facto semantics:
- who writes the work comes from actor, role and medium;
- whose words they are comes from actor, role and produces artifact (only a human role-voice step that produces artifact writes the person's lines back into the work; a human build or fix writes their own draft);
- what a VOICE covers comes from `variant` and medium;
- which protocol block a step is comes from its role (`block` is read at run time only for labels);
- whether a step's output survives depends on its container;
- which critic a gate sees depends on the operators in between;
- where a loop's gate can end its body: right after a model critic or check that reports to it, so later steps and later relay links of that round may not run;
- which version an operator can put in place of the work (a pick, a keep-or-revert, a scored loop's exit, a gate retry);
- which held words a keepsVoice writer is checked against: only the latest VOICE answer;
- where a gate retry may sit: it restarts its stage without cancelling concurrent siblings;
- each loop exit path is its own; replicate, each and audit expand eagerly, and every activity input carries run-level data by value.

Every other consumer re-encodes a partial reading, written independently: validator rules, scope typing and the flow walk; the composed profile; the diff and presentation; the estimator; the interpreter's own human-loop branch. Where those readings need an effect, they trust optional self-declared annotations (`writes`, produces 'voice', block labels, a declared onCap) or structural approximations ('always runs' = not in an optional or route; a loop body always runs to its end; keepsVoice protects every earlier VOICE), and nothing requires a declaration to agree with execution. So a declaration or a structural reading can stand in for a protection.

The canonical catalog is written so that every reading agrees (revise-A-r3-1b/drive.mts: no new finding on any of the 18 CATALOG recipes). A model-composed recipe is the first input that exercises the gaps: F01 (false flags, ports or labels; a VOICE moved into a container, narrowed by `variant`, or placed where a model's verdict skips it; a writer moved past a later VOICE; a pick, restore or scored loop after the person's words), F02 (counts nobody bounds, a retry inside a fan-out, quadratic by-value payloads), F08 (fields and moves the diff never reads), F20 (a declared onCap that one branch, and every feedless critic loop, ignore).

The fix belongs at the boundary where the assumption lives. Define the executed semantics once, as pure data and functions: step and operator effects, whose words, the block of each role, loop exit points, what a human write sets aside, which words are held, where a retry may sit, and the limits. Every protection is granted only by an executed predicate; a declaration may only add arming or refusals; an invariant refuses a declaration that under-states execution, and for VOICE and block labels one that disagrees in either direction. Admission, explanation, estimation and execution all read that definition. Each entry enforces what it can see: the whole definition at compose and web start, executability (limits, batch bytes, pick judge, retry placement) at runner and workflow start, and the held-voice guard in the interpreter.


### F01: Make executable semantics authoritative (declared-effect spoof, role-only prompt binding, operator disagreements, operators that replace the person's work, declarations and structure that stand in for VOICE)

- **Verdict:** ACCEPT_PARTLY · **Severity:** P1 (review: P1) · **Label:** correctness / human-authority admission (declared vs executed semantics)

**Rationale.** Confirmed, and wider than the review says.

(1) The `writes` spoof. A model fix after C4's VOICE is refused when it says writes:true and passes with 0 violations when it says writes:false, omits writes, or omits writes and adds produces:['artifact']. Seven readers trust the flag (voice.ts:22, structural.ts:81/92, profile.ts:57/170, estimate.ts:351, present.ts:135); the runner never reads it (model-step.ts:195-229, interpreter.ts:324).

(2) The voice source is a declaration. With 'voice' dropped from the VOICE step's produces, an honest writer after it is accepted (V1, V1b): PR6 (voice.ts:31), extraWritersAfterVoice (profile.ts:163) and ports.voice (interpreter.ts:409) key on the port, while human.ts:105 still writes the person's words into the work.

(3) Operators that put another version in place of the work ignore the person's write: pick after C2's VOICE (Q1-Q3, delivers a seed card), QA, QRh (keep-or-revert right after VOICE) and QS (a scored loop holding a VOICE) are accepted.

(4) Human checkpoints inside containers count though their output is discarded (V2a lens, V2b gate body; interpreter.ts:658-669, profile.ts:78-83).

(5) Checkpoints are checked for existence, not one to one or by scope (V2c, V3, V3c); the runner acts on `variant` (human.ts:93, interpreter.ts:369, copy.ts:164), admission never reads it.

(6) Prompt binding checks the role only (profile.ts:128-131).

(7) Operator disagreements: audit, one-shot gate and each port scopes; one-shot metrics; gates that cannot see their critic (ctx.loop dropped at :427/438/659/667); a C pick whose judge is a builder takes 'A' after a paid call (:472).

(8) VOICE identity readers disagree: COMP-1's isHumanVoice (profile.ts:55) reads execution plus the label, DR9 reads block VOICE (defaults.ts:154), PR6 reads the port, so X3 (an extra human vision labelled VOICE) and X4 (C6's author draft declaring 'voice') are accepted.

(9) NEW (r3 critic): 'always runs' is structural, not executed. alwaysRunSteps (profile.ts:64-87) counts every step of a loop body, but a loop's gate leaves the body right after the model critic or check that reports to it (interpreter.ts:317; :579 clean, :589 threshold, :594 stopped, :597 plateau, :604-606 cap; LoopExit caught at :512-518), so later steps, including later relay links, may never run. K1-C1/C1b/C2/C5 (a VOICE after a check in a check-clean loop) and K1-C6c (the C6 author write after it) are accepted today and by r3. The validator's flow walk has the same blind spot (flow.ts:33-38 runs a loop body to its end), which is why r3's set-aside rule misses R1 (C3's keep-or-revert moved right after the human cut: on the 'own draft' route the critic can pass before `revise`, so keeping A restores the AI angle card from before the person's draft). R1 was found by this round's placement sweep.

(10) NEW (r3 critic): keepsVoice is executed only against the latest VOICE answer. interpreter.ts:409 replaces ports.voice; the checks at relay.ts:92, model-step.ts:113 and asset.ts:122/134 pass it to lostVoiceLines (writes.ts:20-23, copy.ts:291-301). PR6's keepsVoice exemption and the per-role allowance (profile.ts:180-189) are counted after any VOICE. K2b and K2f (C5's render-in-scene or vo-audio moved after the D3 on-screen VOICE) are accepted today and by r3; the locked VO script is then unchecked.

(11) NEW (r3 critic): block labels decide DR7's Distill order (defaults.ts:118) and other readers (ST6 sit-outs, ST7 knob registry, the presentation), while execution acts on role and reads `block` only for labels (runner activities/steps.ts:35). K2g (C5 with VOICE moved before CUT and TELLS, labels stripped) is accepted today and by r3.

Placement evidence (revise-A-r3-1b/oracle.mts): of 3,453 single moves of one seq child of C1-C7 to another seq position, an execution oracle finds a broken checkpoint protection in 72 that today's rules admit and 16 that r3's rules admit.

Every catalog recipe conforms on every reading; every case needs a composed recipe.

What the review overstates: (a) the runner-entry bypass (only stored ok:true or catalog recipes start; the real gap is that ok is never re-checked); (b) 'reject disguised writers in audits' holds for human writes and VOICE, not contained model writers (vanilla-overlap); (c) two citations are imprecise (compose.ts:95, profile.ts:99).

**Severity rationale.** P1. The flag spoof, the voice-source spoof, a pick or restore after the person's words, a VOICE placed where a model's verdict skips it (K1), and a keepsVoice writer moved past a later VOICE (K2) each turn a promised protection into a false pass. Spec section 4 and ADR-0058 protect VOICE and C6/C6a authorship in composed recipes 'in substance'. No attacker is needed: dropping a flag or port is the repair loop's 'smallest change', and 'Idea Generator, then pick one' is a natural composition. Composition is opt-in, the diff sometimes names the change and the VOICE artifact stays in CAS; none of these restores the guarantee.

The bundled parts are lower: prompt and medium binding is P2 (a loud, paid failure); the operator and gate-feed mismatches are P3 (composed-only, they fail toward a question or a wasted paid round); X3/X4 and K2g are P3 on their own (a mislabelled step) but share the root cause.

**Root cause.** Admission and execution use two definitions of what a recipe does.

Admission reads self-declared annotations (`writes`; produces 'voice' and block VOICE for whose words these are; block labels for which protocol block a step is) and structural approximations of execution: a step-only notion of who changes the work, 'always runs' as 'not in an optional or route', and a flow walk that runs every loop body to its end. It also ignores fields and placements that execution acts on: `variant` (what a VOICE covers), the container a step sits in (whether its output is kept), the operator a critic sits in (whether the gate sees it), the exit points where a loop's gate can end its body, and the operators that put another version in place of the work (a pick, a keep-or-revert, a scored loop's best-snapshot exit, a gate retry).

Execution derives all of these from actor, role, produces artifact, medium, variant and the enclosing operator (model-step.ts parserFor, asset.ts:104, relay.ts:94-96, human.ts:93-121, interpreter.ts:261-345, 369-409, 427-684). Nothing defines what a person's write does to the alternatives made before it, nothing says which VOICE a keepsVoice writer is checked against (execution: only the latest), and nothing requires a declaration to agree with execution, so a declaration or a structural reading can stand in for a protection.

The canonical catalog is written so every reading agrees. A model-composed recipe is the first input whose annotations and placements are untrusted. The runtime voice check is opt-in through the same kind of declaration and covers steps only, so it is no backstop.


### F02: Bound total work before constructing it

- **Verdict:** ACCEPT_PARTLY · **Severity:** P2 (review: P1) · **Label:** resource bounds / admission

**Rationale.** The defect is confirmed: schema.ts:156 is `n: z.number().int()`; ST3 (structural.ts:42) sets only lower bounds; the composed profile range-checks knobs, not structural counts; interpreter.ts:427, :434 and :659 expand eagerly with Promise.all in one activation. The verifiers' demo-mode runs: n=2,500 or nested 50x50 gives PendingActivitiesLimitExceeded; n=1e9 hits the 5 s isolate deadline; n=1,500 runs every seed and is then terminated with GrpcMessageTooLarge at C1's D2 `each`. In every case the run stays 'running', Cancel can be ineffective, and $0 is spent.

Correction of r3's account (regression critic, verified): the n=1,500 GrpcMessageTooLarge comes from RunRef.seeds, not the brief. Every activity input carries every seed handed out so far by value (interpreter.ts:116 `seeds: [...this.seeds]`, :313; read at model-step.ts:112 and writes.ts:17), about 51 bytes each, so a fan-out after a seed fan-out grows quadratically in counts: with the 75-character demo brief, replicate(300, seed) followed by each(critic) makes a 4.76 MB scheduling batch (critic's seeds-payload measurement), and n=1,500 makes about 77 KB per activity. Entry ports carry option lists by value too (replicate passes its entry ports to every branch, :427). So a count bound of 'peak 500' alone is not platform-safe.

A second gap (root-cause critic, verified): a retrying one-shot gate inside replicate, each or an audit lens throws RetryStage out of Promise.all (:679); runStages restarts the stage (:143-149) without cancelling the sibling branches, which keep making paid calls and asking questions, and their failures are dropped (G1, accepted today and by r3). Under that placement no work bound holds.

The review overstates memory exhaustion (the isolate deadline fires first), 'apparently checked' (the diff shows the count) and P1. It understates that ordinary-looking counts (1,500-2,500, 50x50) already wedge runs, and that about 1,000 nested seqs crash admission with an uncaught RangeError (schema.ts:249), because checkAnswer catches only ZodError (compose.ts:101-104).

Measured catalog maxima: replicate n 12, peak 12 (C2), loop max 10, relay 4, lenses 3, depth 6, 42 nodes, 6.3 KB, worst-case 213 step runs (C5). Research b-bon has peak 4N with N=5 provisional (baselines.ts:34-39), which is why ceilings are split by owner.

**Severity rationale.** Material reliability hardening, not a broken safety or data guarantee: nothing is spent before the wedge, no human work is lost, it needs a live composer to emit abnormal counts, and the person must still start a run whose count and estimate are shown. The consequence is a run that never finishes and may need the Temporal CLI to clear. G1's orphaned branches do spend inside the person's budget, which stays P2 because the budget question still bounds it.

**Root cause.** Nothing at any admission layer bounds the counts that shape work (replicate n, loop max, relay maxLinks, lens count, nesting depth and size), and nothing says where a gate's retry may sit. The schema accepts any int, the validator sets only lower bounds, the profile checks only knobs, Runner.start only parses, and the interpreter expands eagerly; a gate retry is a stage-level control transfer that the concurrent operators do not cancel. The only ceilings in force are Temporal's platform limits, which fail outside the product's control flow.

The bytes of one scheduling batch are width x per-activity input, and the per-activity input carries run-level and path-level data by value: every seed handed out so far and the entry ports' option lists (both grow with counts, so the batch grows quadratically), plus the run inputs (brief, fixed voice deck), whose size the person sets. The count-determined part belongs in the engine's bound; the root fix for both parts is carrying that data by reference, a separate item.


### F08: Explain actual composition changes

- **Verdict:** ACCEPT · **Severity:** P2 (review: P2) · **Label:** correctness / disclosure accuracy (composed-recipe diff)

**Rationale.** Confirmed. diff.ts:37-38 is `case 'pick': return;`. diff.ts:185-192 compares loops only on gate.metric and gate.max. diff.ts:210 falls back to 'The same steps as <nearest>'. Both verifiers got 'The same steps as Landing Page Studio.' for C1's human pick changed to R and for C1's hidden threshold changed from 9 to 1, while the interpreter really changes behaviour (interpreter.ts:478-487; :589 with gates.ts:28-35).

The probes widen the scope: an added pick after VOICE (Q1-Q3); VOICE without the 'voice' port; VOICE turned into a claim-log; C5's script VOICE without 'VOICE-early'; a VOICE turned into a vision step; C3's loop critic wrapped in an audit; C5's gate retrying D1; changes to probe, plateau, a one-shot pass, optional triggers, sitsOut, consumes, produces, writes, keepsVoice and isolated all read 'The same steps'. Structural moves are under-described: V2a reads only 'Added: Cliché sweep'; K1-C1 (VOICE moved behind a check that can end the loop) reads only 'Added: Defect check repeated up to 1 round'; K2b reads 'Motion runs in Finish instead of Refine'.

The presentation also misexplains: present.ts:85 calls every non-H pick 'The AI chooses'; present.ts:135 reads the declared `writes`; the voice explainer tells a claim-log VOICE 'write the words readers will take as yours'.

The review's 'same admitted plan' part already holds (api.ts:122-150 diffs and starts the same stored recipe). Citations: diff.ts:45 should be 37-38, diff.ts:183 should be 185-192.

**Severity rationale.** Low P2. The diff is ADR-0058's disclosure for a model-authored recipe before a paid run, and its fallback asserts equivalence, which is false for accepted changes that add a pick, remove a human decision, disable the critic loop's threshold or narrow a VOICE. Not P1: the route strip shows who picks, the validator blocks several hidden changes, the recipe is labelled 'Composed, not tested', and only the opt-in composer path is affected.

**Root cause.** diffFromNearest is a hand-written comparer over a hand-picked subset of fields and node types, and its default is unsafe: 'same' means 'none of the compared fields differ', not 'semantically equal'. No shared definition says which fields, node types and placements affect execution, so every one the diff was not taught is silent. The explainers read declared flags and a coarse pick mapping instead of executed semantics.


### F20: A work cap must not substitute for human acceptance

- **Verdict:** ACCEPT_PARTLY · **Severity:** P2 (review: P2) · **Label:** correctness / protocol conformance (gate-exit semantics)

**Rationale.** The mechanism is confirmed, and its scope is wider than the review says.

Human-metric loops: interpreter.ts:522-525 returns when round >= max, before READY_PROMPT is asked. atCap() (:602-609), which implements ADR-0073's raise-once rule, is reachable only through afterGateStep (:574-599). So onCap:'human' is dead configuration for C2 vision (max 3), C6a vision (max 2) and the C6/C6a author loop (max 10). LS1 is a hard rule and certifies that last loop because it contains a critic lens (validator ports.ts:105-107).

Critic and check loops skip atCap whenever their gate never sees the critic (ctx.loop dropped at :427/438/659/667, or an optional skipped): such a loop leaves at :532 at max, through bestOf on an empty history, without asking (variants3; accepted today).

The estimator (estimate.ts:314-315) is a third reading. No test drives a human loop to its cap.

The review overstates the consequence: in every catalog recipe an always-run human VOICE follows each capped human loop, and the C2/C6a bounds are stated in the copy. The real losses: no raise-once option and no notice that a round is the last; C2's round-3 brief and C6/C6a's round-10 audit notes are never put in front of a decision; in composed recipes a critic loop's cap stands in for the person.

**Severity rationale.** P2: admission certifies LS1, a hard rule ('A human decides ... at the cap'), and execution does not honour it; this happens on canonical paths (C2 reaches it after two 'No' answers); the spec, 02 section 2 and the c6.ts comment all promise the person's decision; critic loops in admitted composed recipes reach the same unasked exit. Low P2: no data is lost, nothing is spent, no human text is overwritten, and an always-run human VOICE follows every capped human loop in the catalog.

**Root cause.** Gate-exit policy has no single definition. The interpreter gives human-metric loops a private exit branch that treats exhaustion like approval and never reads the declared onCap. The shared cap handler (atCap) is reached only when a model critic or check step reports straight to the loop. Which critic actually feeds a gate is itself an undecided operator semantic: the validator's containsCritic walks through every container, while the interpreter drops the loop context at replicate, each, audit and gate. LS1 checks a declared onCap that one interpreter branch, and every feedless critic loop, ignore. The spec, protocol, estimator, catalog comment and validator each state a different exit policy.


### Options


**A. Review's repair: compile a separate immutable executable plan** (fixes root cause: yes; effort XL; risk high)

Add a trusted operation registry and compile every raw recipe into a new plan IR. The validator and profile run on the plan, Runner.start accepts only plans, and the interpreter executes plans. The diff, estimates and bounds are generated from the plan.


*Pros*
- One artifact is checked, explained and executed, so admission and execution cannot drift apart.
- Future constructs must register their semantics before they can run.

*Cons*
- A second IR next to byway.recipe/1. Plan formats, hashes and compiler versions would have to be carried through ADR-0041 research pins and Temporal RunInput.
- An interpreter rewrite: most validator, interpreter and e2e tests would be rewritten, all open runs are retired, and the regression risk spans eight shipped recipes.
- Most of its benefit comes from one shared definition of effects, operators, exits and limits, which option C provides without a second IR.


**B. Minimal per-finding patches** (fixes root cause: partly; effort M; risk low)

Point fixes: profile.ts treats model build/fix/seed as writers whatever `writes` says; the runner checks lostVoiceLines whenever ports.voice exists; COMPOSED-PROMPT keys on role plus medium; ST3 caps replicate.n; diff.ts learns picks and thresholds; the human-loop branch asks at the cap.


*Pros*
- Small and fast. It closes the first reproduced P1 spoof and the cited symptoms.
- No new module or contract surface.

*Cons*
- It leaves open the voice-source, VOICE-label, block-label, containment, variant-scope and gate-feed variants; the pick, restore and scored-loop paths after the person's words; a checkpoint placed after a loop's exit point (K1); a keepsVoice writer moved past a later VOICE (K2); and a retry inside a fan-out (G1). These are executed semantics no step-flag rule sees.
- Effect semantics stay duplicated across PR6, DR9, the advisor's copied flow walker, ST9/ST10, the estimator and the presentation, and declarations can still stand in for a protection wherever one reader was not patched.
- A product ceiling in ST3 would block research b-bon, and a count cap alone is not byte-safe (seeds and option lists by value).
- Diff completeness still depends on someone remembering every field and node type.


**C. One pure semantics module read by every consumer, enforced at each entry by what that entry can see, shipped in four stages** (fixes root cause: yes; effort XL; risk medium)

Add packages/recipe/src/semantics.ts (pure, type-only imports, bundle-safe). It defines as data plus small functions: the effects table; whose words (personWrite, voiceWrite, authorWrite) with voiceScope and its coverage order; the block of each role; loop exit points and runsEveryTime; operator semantics (what may replace the work, what a human write sets aside, gate feeds, retry placement); the held voice; limits by owner including count-determined batch bytes; one cap policy; an exhaustive field classification. The validator's single flow walk learns containment and loop exits. The validator, composed profile, prompt binding, diff, presentation, estimator, Runner.start, web startRun and the interpreter read it. The P1 closes in stage 1 at admission.


*Pros*
- It removes the wrong assumption wherever it appears: who writes, whose words, which block, what scope, which container, where a gate can end a loop body, which critic feeds which gate, which version an operator may put back, which words a keepsVoice writer keeps, and where a retry may sit.
- Declarations never satisfy a protection: COMP-1 counts executed VOICE and author writes that run every time, PR6 arms on executed OR declared voice, keepsVoice is checked against every held VOICE, and ST12 refuses an under-declared writer and any VOICE or block label that disagrees with execution. 4,256 single declaration changes (writes, produces 'voice', keepsVoice, all 8 block labels and none) on 14 refused recipes admit none (revise-A-r3-1b/oracle.mts).
- Placement is checked against an execution oracle: of 3,453 single moves of one seq child of C1-C7, today's rules admit 72 that break a checkpoint protection, r3's rules 16, these rules 0 (oracle.mts, oracle.log).
- No canonical or research recipe or hash changes, no catalog verdict changes, and no catalog run changes (drive.mts: 46 variants as expected, every CATALOG recipe clean).
- Limits are split by owner and the engine bound includes the count-determined bytes of a scheduling batch, so admitted shapes are executable; research b-bon stays open.
- Stage 1 makes @byway/protocol side-effect free, so the validator's rule and exception tables leave the workflow bundle; every later rule edit stops retiring open runs.

*Cons*
- It touches recipe, protocol, validator, advisor, prompts, runner, web and contracts, with two ADRs, one new rule id (ST12), one advisor-local rule (COMPOSED-LIMIT) and one additive Advisor method. XL in total; stage 1 alone is L.
- The workflow bundle hash changes twice: once in stage 1 (protocol tree-shaking) and once in stage 4 (interpreter). Runs open at each of those upgrades end plainly (ADR-0078).
- The limit values and the batch-bytes constants are engineering judgement and measurement; tests must pin them. Byte safety for large run inputs (brief, voice deck) still needs the by-reference item.
- The oracle shares the step-level predicates (effects table, voiceWrite, exit points) with the rules; it is independent in control flow only, and the sweep covers single moves, not multi-edit compositions (those are covered by the variant corpus).
- Stricter in a few legitimate-looking places: a composition that adds a VOICE and puts model writers after it, or moves an over-declared writer such as C5's matte past the D3 VOICE, or leaves a role's block label off, is refused (21 of 3,453 sweep moves are refused only by the new rules while the oracle finds no breach; each is an undeclared writer, a stale option read, or an over-declared writer).
- New user-visible loop behaviour (raise-once and a final choice for C2/C6/C6a) needs copy updates and an e2e.


**D. Remove self-declared effect fields from the IR (schema v2)** (fixes root cause: partly; effort L; risk high)

Drop `writes`, block-as-effect and the 'voice' port declaration from the schema and derive every effect. Then add limits, the diff and the cap fixes separately.


*Pros*
- The flag and port spoofs become impossible to express, not merely refused.

*Cons*
- Changes the hash of every canonical and research-frozen recipe, which breaks research pins, run recipeHash continuity, the recipes/ snapshots and the manifest.
- strictObject parsing would reject stored composed intakes unless the fields are kept as accepted-but-ignored, which is misleading again.
- It does not address operator effects on the work, loop exit points, the held voice, `variant` scope, containers, gate feeds, retry placement, limits, diff completeness or gate exits, so most of C is still needed.


### Recommendation: C

**Why.** Option C fixes the actual root cause, a missing single definition of executed semantics, where the false assumption lives and without a second IR. The runner's behaviour is the truth and the catalog already conforms to it, so the smallest complete fix is to write those semantics down once, have every consumer read them, and enforce at each entry what that entry can see.

Each earlier round left part of the semantics undefined or let a declaration or a structural approximation back in: r0 derived only `writes`; r1 added whose words, VOICE scope, containers and gate feeds for steps; r2 added operator effects and set-aside but counted a declaration-widened voice source; r3 split the voice predicates but still counted 'always runs' structurally, ran the flow walk through loop bodies to their end, checked keepsVoice writers against any VOICE while execution checks the latest, read block labels as executed, and left the retry's placement open.

r3-1b writes down the remaining executed facts and has every reader use them: loop exit points (runsEveryTime and an exit-aware flow walk), the held voice as every executed VOICE write on the path, the block of each role, and the retry as a stage-level transfer that may not sit inside a fan-out. It also corrects the F02 byte account (seeds and option lists by value) and the bundle claim (the rule table is in the workflow bundle).

Evidence: a placement sweep against an execution oracle admits 0 protection-breaking moves out of 3,453 (today 72, r3 16); 4,256 single declaration changes admit 0 refused recipes; the 18 CATALOG recipes gain no finding.

Why not the others: A buys little beyond C at higher cost and risk; B leaves the operator, voice, label, exit, held-voice, scope, container and retry variants open; D churns every hash and still needs C.

**Design.** 1. SEMANTICS MODULE (packages/recipe/src/semantics.ts)

Pure: type-only imports from schema.ts and @byway/protocol, no Node built-ins. Exported from @byway/recipe and from a subpath, @byway/recipe/semantics, which workflow code imports in stage 4.

a) Effects: one table keyed by (actor, role, produces), mirroring execution and fail-closed like parserFor's default. Model build, seed, fix, voice, relay, render and any unlisted model role write the work; a model asset writes only when it produces artifact (asset.ts:104); a tells-compare restores the previous version; model critic, check, cut, tells-sweep, vision, judge, select, dedupe and overlap annotate. HUMAN_WRITE_ROLES = {voice, build, fix} (humanKind 'write', wording.ts:17-21). A tool render renders; other tool and policy steps pass (interpreter.ts:261-279). changesWork(step, contained) = (!contained && writes-work) || step.writes === true. Restores are not in changesWork.

b) Whose words (executed): personWrite = human, a HUMAN_WRITE_ROLES role, produces artifact (human.ts:93-121). voiceWrite = personWrite and role voice: the work's copy or claims are offered (interpreter.ts:369) and the lines written back. authorWrite = personWrite and role not voice: a human build and a human fix execute identically (same branch human.ts:113-121, same prompt wording.ts:43-45, both set `authored` at :408), so the role label must not choose the protection. declaresVoice = block VOICE or produces 'voice'; voiceArm = voiceWrite or declaresVoice (arming only). voiceScope: base 'claims' for claim-log; on media 'script' for VOICE-early, else 'on-screen'; elsewhere 'all'; keyLines from knobs.scope. Coverage order: same base, and a wider VOICE covers a narrower one (every-line covers key-lines, never the reverse).

c) The block of each role (new): BLOCK_OF_ROLE = seed SEED, vision VISION, critic CRITIC, asset ASSET, relay RELAY, cut CUT, tells-sweep TELLS, tells-compare TELLS, voice VOICE; a check carries CRITIC or nothing; every other role carries none. Execution never reads `block` except for labels (runner activities/steps.ts:35), so a block label is a declaration of the role's block. All 18 CATALOG recipes agree (blocks.mts).

d) Loop exits (new). exitPoint(step, loop): a MODEL critic under critic-score or critic-rank, or a MODEL check under check-clean (interpreter.ts:317, :574-583), reached from the loop body through seq, relay, route branches and optionals (which pass ctx.loop on), not through replicate, each, audit, gate or an inner loop (which drop or replace it, :427/438/659/667). Right after an exit point the gate may end the body (:579 clean, :589 threshold, :594 stopped, :597 plateau, :604-606 cap) and LoopExit is caught at :512-518, so the rest of the round, later relay links included, may not run. Human loops end only at the end of a round (:522-530); other loops at the end of a round at the cap (:532).
- The single flow walk (validator flowRecipe, moved to read these definitions; advisor/src/flow.ts deleted) visits containers with contained = true and also sends the state after every exit point to the loop's exit. May-analyses (PR6, writers after a mark) are unchanged by construction, since an exit state is a prefix of the continuing path; must-analyses (set-aside staleness) become sound.
- runsEveryTime(step): reached on every path through its stage: not under an optional, a route, a pick judge, an audit lens or a gate body, and not after an exit point of an enclosing loop within that loop's body.

e) Operator semantics. WORK_FROM: a pick puts in one of the options; a keep-or-revert the previous version; a critic-score or critic-rank loop's best-snapshot exit an earlier scored version; a one-shot gate's retry re-runs the retried stage from its entry. SETS_ASIDE: a finished personWrite sets aside the option set, the previous version and the earlier scored versions of every enclosing loop (not a stage entry: a retry re-runs every write after it). RETRY placement: a retry is a stage-level control transfer (runStages :143-149) that does not cancel concurrent siblings (Promise.all at :427/:434/:659), so a gate with a retry may not sit inside replicate, each or an audit lens. gateFeed(loop or gate): exit points that always run (not under an optional; on every route branch). One-shot gates take critic-score and critic-rank only. A C pick needs a judge with role judge or select; a pick's actor follows its mode. A voiceArm step never runs per candidate.

f) The held voice (new): the texts of every executed VOICE write on the path, in order. keepsVoice means every line of every held text that was in the work before the step stays (lostVoiceLines over their union). ports.voice stays the latest VOICE answer or the fixed voice input, which is what a 'voice' consumer reads (C5 vo-audio after vo-script).

g) Limits, split by owner.
- SHAPE (byway.recipe/1, crash prevention only): depth <= 64, nodes <= 10,000, serialized <= 1 MiB, checked iteratively inside parseRecipe before reservedKeyPaths or zod and thrown as a ZodError with a path.
- ENGINE_LIMITS (every kind): every count a finite positive integer; peak concurrent leaves <= 500 (Temporal's pending-activity limit is 2,000); worst-case step runs <= 2,000; gate retries <= 3 (MAX_GATE_RETRIES moves here); batchBytes <= 2 MiB for every concurrent fan-out, where batchBytes = width x (BASE + SEED_B x seed-step runs that can precede it + ID_B x option ids and views in its entry ports). The constants are measured from the real interpreter (seeds about 51 B each); run inputs (brief, fixed voice, refs) are excluded and owned by the by-reference item.
- COMPOSED_LIMITS (model-authored only): replicate n <= 16, loop max <= 12, relay maxLinks <= 8, lenses <= 4, peak <= 32, step runs <= 400, depth <= 12, nodes <= 100, size <= 32 KiB. Their worst batch is about 0.7 MB with the demo brief.
- workBound walks the recipe like the estimator: replicate sets the option count, each multiplies by it, audit sums its lenses, a C pick costs k judge calls, a loop multiplies by loopRounds(gate).withRaise, a relay by maxLinks, a gate retry adds times x the work of stages[retry.stage .. the gate's stage]. It is a bound only under the retry-placement rule. loopRounds(gate) = { planned: max, withRaise: onCap human ? 2*max : max }.

h) One cap policy, capTurn(gate, raised). With onCap human and no raise yet: critic and check loops ask BEST_SO_FAR; human loops ask HUMAN_CAP_PROMPT ('That was the last planned round. Use this version? No allows up to N more rounds, once.'); No raises the cap once. At the raised cap: critic and check loops take the best snapshot; human loops ask a 'choose' checkpoint ('Use this version' or 'Stop the run'). A loop whose onCap is not human takes the policy result. End-status policy: the status names what ended the run; a failed check is 'failed' even when the person confirms it (GATE_FAILED 'No'), and a person stopping with nothing failed ('Stop the run', Cancel) is 'cancelled'.

i) FIELD_ROLES: a mapped type over every schema object (Recipe, Stage, each node, Step, Gate, PassCondition, Retry, Lens, Branch); every field is 'name', 'child', 'semantic' or 'semantic-set', so an unclassified field fails typecheck. 'semantic' includes lens.name, branch.name, route.id, medium, variant, block and knobs; 'semantic-set' covers inputs, consumes, produces, sitsOut and exceptions. projection.ts (admission only, hashed with @byway/canonical) drops 'name' fields and sorts 'semantic-set' fields.

j) THE DECLARATION RULE. Every protection is granted only by an executed predicate (personWrite, voiceWrite, authorWrite, changesWork, runsEveryTime, exit points, gateFeed, the held voice, loopRounds, limits). Declarations may only add arming or refusals. ST12 refuses: an uncontained step that changes the work by execution without writes:true (under-declaration only: over-declaring writes:true is stricter and stays legal, as on C5's matte, a tool relay that runs as an honest skip under ADR-0069); a declared VOICE (block VOICE or the 'voice' port) on a step that is not a voiceWrite, and a voiceWrite without the 'voice' port (both directions for VOICE); a block label other than its role's block (both directions). keepsVoice is an executed declaration: it requests the held-voice check, which the runtime performs. variant, knobs, frozenPrompt and (from stage 4) onCap are executed; a declared `isolated` can only add refusals.

2. ADMISSION

a) Validator, all kinds.
- flowRecipe with `contained` and exit forks; FlowOps.step receives `contained`.
- PR6 arms on voiceArm (and a fixed 'voice' input) and flags changesWork for non-human steps without keepsVoice.
- scope.ts ends option_set<artifact> at every personWrite; a pick, an each or an option consumer after it gets ST5 'set-aside', naming the write.
- ST9/ST10 keep their 'writes' clause and add 'human-write' (a personWrite or declaresVoice step in a lens or gate body).
- ST2/ST10 'feed'; ST10 'metric' refuses one-shot check-clean and human gates.
- ST10 'retry-scope' (stage 2): a gate with a retry inside replicate, each or an audit lens. ST10 is an invariant.
- ST12 (invariant, registered in @byway/protocol RULES): writer-undeclared, voice-not-written, voice-undeclared, block-role, voice-per-candidate, pick-judge, pick-actor, set-aside (on the exit-aware flow: a tells-compare whose previous version may predate a personWrite; a critic-score or critic-rank loop holding an uncontained personWrite; an option consumer reached only through a back-edge).
- ST3 'limit' (stage 2); LS1 also covers human-metric loops.
- DR9: 'fixed-input' and 'missing' require a voiceWrite; per-step clauses read the (now honest) block; new 'claims-only' from voiceScope.
- scope.ts typeAudit, gate and each follow 1e (stage 4).

b) Composed profile.
- COMP-1 matches the nearest's protected checkpoints one to one over runsEveryTime, uncontained steps: voiceWrite by (stage, voiceScope) with the coverage order, authorWrite by stage. No declaration takes part.
- Writer allowance per VOICE (new): for each voiceWrite of the nearest (optional ones included), count the model writers that can run after it, per role; the composed recipe may have no more after its counterpart. A VOICE with no counterpart, or a declared-only VOICE, allows none.
- COMPOSED-AUTHOR flags writers after an authorWrite. alwaysRunSteps is replaced by runsEveryTime.
- COMPOSED-PROMPT: the prompt is used by a catalog model step with step.role; PromptLibrary.info(prompt, medium).output === outputForStep(step, medium); the template dry-renders with exactly slotsForStep(step). slotsForStep lives in a new prompts file exported only from the main entry, typed structurally (no @byway/recipe dependency).
- COMPOSED-LIMIT; checkAnswer turns any non-Zod throw into COMPOSED-INTERNAL.

c) Runner.start (client.ts) runs engineProblems(recipe) after parseRecipe: ENGINE_LIMITS (with batchBytes), workBound, pick-judge, retry-scope. It throws a typed RecipeRefused before createRun. It runs no product policy.

d) Web startRun calls Advisor.admit(storedRecipe, nearestRecipeId, profileId), which re-runs checkAnswer with the stored recipe's own id (the hash must equal the stored hash) and recomputes the ComposeResult. Not ok, a changed hash or RecipeRefused: 400 'rebuild'. A changed diff or presentation: 409 with the intake updated. The estimate is refreshed silently.

e) Bundle hygiene (stage 1): @byway/protocol declares "sideEffects": false. Verified in memory with build.ts's options: RULES and EXCEPTIONS leave the workflow bundle and only blocks.ts and media.ts remain (hash e572716a, equal to the dist stamp, becomes bfdda860 once); adding ST12 afterwards leaves it unchanged (bundle-se.mts). prompts/src/outputs.ts (in the bundle) is not edited before stage 4.

3. EXECUTION (stage 4, one bundle change)

- Ports gains held?: string[], the held voice: each finished voiceWrite appends its answer. ports.voice is set only by a voiceWrite (today: any 'write' step declaring 'voice', interpreter.ts:409) or by the fixed input at start. For every catalog step this equals today.
- keepsVoice at model-step.ts:113, relay.ts:92 and asset.ts:122/134 checks the union of ports.voice and ports.held. For canonical C5 that union equals today's ports.voice wherever a keepsVoice writer runs.
- PR6 guard: a non-human, uncontained step that changes the work and lacks keepsVoice fails with RunFailure before any activity when ports.held is non-empty. Ctx gains `contained`. held follows ports: replicate, each and audit return their entry ports' held (a VOICE inside them is refused), and a retry resets to the stage entry's held.
- wording.ts humanKind reads HUMAN_WRITE_ROLES. pick throws instead of defaulting to 'A' when a judge gives no label.
- runRecipe runs engineProblems inside run.ts's try block, so a refused recipe ends 'failed' instead of staying 'queued'.
- loop() routes every cap exit through capTurn (the human-metric branch and the :532 fallthrough); cap questions show the work and the round's notes. RunStopped maps to cancelRun. Critic and check loops with a feed keep ADR-0073.
- Not done, for proportionality: clearing options and the previous version at a human write, tagging loop snapshots, and an effects-gated applyModel. Admission refuses every recipe where they would matter, and parserFor is held to the effects table by an agreement test.

4. EXPLANATION (stage 3)

diffFromNearest pairs every node type and says 'The same steps as X' only when the projections are equal. Describers cover picks (who picks; 'chosen at random, no one compares them'), gate strictness ('stops at a lower/higher quality bar', never the number), how a loop stops early, VOICE scope, optional triggers, and container moves (into or out of a lens, gate body or candidate body; 'now runs only when the check finds problems' across an exit point; 'now runs after your words'). Any other projection difference reads 'Other technical changes that affect how it runs'.

present.ts: R picks read 'chosen at random, no one compares them'; appliesFindings comes from the effects table; the 'your words' explainer is shown only for voiceWrite steps and worded by voiceScope. The estimator uses the effects table for feedsSwaps and loopRounds(gate).planned, and says more rounds may be allowed once at the cap; the C2 and C6a copy gains 'you can allow more once'.


**Steps**
1. 0. Draft ADR-0081 and ADR-0082 (status Proposed; next free numbers at implementation time) and the spec section 3.2 and 4 deltas. File a P2 item in docs/backlog.md 'Product follow-ups', owned by runner + contracts and routed as its own finding: 'Activity inputs carry run-level and path-level data by value'. Evidence: every activity input embeds RunRef.problem and RunRef.seeds (interpreter.ts:114-116) and the step's whole entry ports, including option lists and a fixed voice deck; web accepts 20,000 characters plus 5 attachments of 200,000 (schemas.ts:10-11). With the demo brief, replicate(300, seed) then each(critic) is a 4.76 MB batch; a maximal brief fills 4 MB at about four activities. Root fix: the brief stored once in CAS, RunInput and RunRef carry its id, activities read it through ArtifactReader; RunRef stops carrying seeds and activities read the run's seed memos from the store; activities receive only the ports their step reads. Acceptance: a demo-mode C2 run with a maximal non-ASCII brief completes D1. RunInput changes, so it should ship with stage 4's retirement if scheduled together.
2. STAGE 1: closes the P1 at admission. One workflow-bundle change (protocol tree-shaking).
3. 1. Tests first for semantics.ts. (a) The effects table agrees with execution: ROLES x ACTORS x produces against parserFor's answer kind, asset and relay, human.ts and prompts ARTIFACT_ROLES. (b) personWrite and voiceWrite agree with the real human.ts on a memory store; HUMAN_WRITE_ROLES equals the roles humanKind maps to 'write'; a human fix and a human build take the same human.ts branch. (c) For every CATALOG recipe: declaresVoice equals voiceWrite; every block equals BLOCK_OF_ROLE; every uncontained work-changing step declares writes:true; no contained human write; no per-candidate VOICE; judge-role pick judges; onCap human on human loops; no retrying gate inside a fan-out; runsEveryTime yields the same checkpoints as today's alwaysRunSteps. (d) Every catalog VOICE's voiceScope equals its documented scope. (e) exitPoint agrees with the interpreter: for a loop of each metric, a fixture drives the real Interpreter with act stubbed and records which steps run after a clean, threshold, plateau, stopped and cap exit. Then implement semantics.ts.
4. 2. Validator tests first. r1/r2/r3 cases keep their verdicts (S1-S3, V1, V1b, V2a, V2b, V3, variants4, Q1-Q3, QA, Q4, QRh, QS, QF, M1-M3, W1-W2d, Q1+W1, Q1+W2, X1-X4, a C6 author draft with writes omitted). New: K2g gives ST12 'block-role'; R1 gives ST12 'set-aside'; operators.test.ts:52-56 and 163-167 unchanged; vanilla-overlap valid; c1h and its ablations keep their verdicts; DR9's raw findings unchanged on all 18 CATALOG recipes. Then extend flowRecipe (contained, exit forks), switch PR6, ST9/ST10, scope.ts set-aside, add ST12 and the DR9 change. The conformance test keeps every CATALOG verdict.
5. 3. Advisor tests first: K1-C1, K1-C1b, K1-C2, K1-C5 and a VOICE after a relay whose link holds the check give COMPOSED-VOICE; K1-C6c gives COMPOSED-AUTHOR; a C6 author loop with the write before the check, and C6 with the author write as role fix, are admitted; K2b, K2f and K2m (matte) give COMPOSED-VOICE (writer allowance per VOICE); C4/C6 disguised writers, V2c, V3, V3c and the r3 voice cases give COMPOSED-VOICE / COMPOSED-AUTHOR as before; compose.test.ts:104 (C4's key-lines VOICE widened to every-line) stays ok; COMPOSED-PROMPT cases as r3; a non-Zod throw gives COMPOSED-INTERNAL. Then move the profile onto semantics, delete advisor/src/flow.ts, add slotsForStep to the prompts main entry, widen the advisor deps to PromptLibrary.
6. 4. Web test first: a stored composed recipe with ok:true that fails current admission gets 400; one whose recomputed diff differs gets 409 with the intake updated; an unchanged one starts with the same recipe hash. Then add Advisor.admit (additive in @byway/contracts) and wire startRun.
7. 5. Bundle: set "sideEffects": false in @byway/protocol's package.json. Build tests: the workflow bundle contains no protocol file other than blocks.ts and media.ts, and editing rules.ts or exceptions.ts leaves its hash unchanged (an esbuild onLoad edit, as in bundle-se.mts). Record in ADR-0081 that stage 1 retires runs open at that upgrade once (ADR-0078).
8. 6. Two corpus tests. Declaration monotonicity: for every refused recipe in the acceptance corpus, no single change of writes (true, false, absent), produces 'voice' (added, removed), keepsVoice (true, absent) or block (each of the 8, absent) on any step makes checkAnswer accept it (prototype: 4,256 changes on 14 refused bases, 0 admitted). Placement soundness: for C1-C7, every single move of one seq child to another seq position that admission accepts keeps every protection under a trace oracle (loops unrolled twice with exits after exit points, optionals both ways, every route branch, containers contained): the nearest's every-run checkpoints occur on every trace one to one; per VOICE occurrence, no more distinct model writer steps after it than the nearest has; no pick, keep-or-revert or scored-loop exit brings back an alternative made before a person's write (prototype: 3,453 moves, 0 breaches admitted; today 72, r3 16).
9. STAGE 2: bounds. No workflow-bundle change.
10. 7. Tests first: a 2,000-deep seq and a 2 MiB answer give SCHEMA violations, not RangeError; replicate 1e9, nested 600x1 and step runs over 2,000 give ST3 'limit' on every kind; replicate(300, seed) followed by each(critic) gives ST3 'limit' (batchBytes), and the BASE, SEED_B and ID_B constants are pinned by a unit test that drives the real Interpreter with act stubbed and measures scheduled activity inputs for seed-then-each and replicate-after-options shapes; G1 gives ST10 'retry-scope'; C1 replicate 17, nested 50x50, loop max 13, relay 9, 5 lenses, peak 33 and 401 step runs give COMPOSED-LIMIT; b-bon for N = 1..64 passes ENGINE_LIMITS; every CATALOG workBound equals its pinned value (C5: 213); Runner.start refuses replicate 1e9, a C pick without a judge and G1 before any run record or workflow exists; the bundle hash is unchanged. Then implement the shape check, ENGINE_LIMITS with batchBytes, workBound, ST3 'limit', ST10 'retry-scope', COMPOSED-LIMIT and engineProblems with RecipeRefused (400 in web).
11. STAGE 3: disclosure. No workflow-bundle change.
12. 8. Tests first: a table-driven single-field mutation over every FIELD_ROLES 'semantic' field across C1-C7 never reads 'The same steps' and never quotes a threshold; Q1, a pick mode change, a threshold change, a plateau or probe change, V3, V3c, an optional trigger change, the C3 critic moved into an audit, a step moved across an exit point and C5's retry moved from D2 to D1 each produce a specific or 'Other technical changes' line; an id-only rename and a consumes reordering still read 'The same steps'; a type test proves FIELD_ROLES exhaustive; the bundle hash is unchanged. Then add projection.ts, rewrite diffFromNearest with the reduced describer set, and fix present.ts.
13. STAGE 4: operators, loops and the held voice at run time; every interpreter edit in one workflow-bundle change.
14. 9. Validator tests first: variants3 and variants3b give ST2 'feed'; variants7 gives ST10 'feed'; a one-shot check-clean or human gate gives ST10 'metric'; score after an audit, view or score after a gate, and the pool inside each give ST5; a human loop with onCap policy gives LS1. Intended changes: operators.test.ts:80-85 ('annotations from every lens are in scope after the audit', consuming score) now expects ST5, and the Audit doc comment in recipe schema.ts:66-69 says an audit returns its joined critique and notes, not a score (several lenses cannot make one score). Then implement gateFeed, the scope.ts alignment and LS1.
15. 10. Runner tests first. Human loops: humanGate(1) asks the cap question and approving it exits; humanGate(3) answered No every time asks READY, READY, cap, rounds 4-6, then the final choice; 'Stop the run' ends the run as cancelled. Critic loops: a feedless critic loop at its cap asks BEST_SO_FAR. The held voice: a VOICE without 'voice' in produces still sets ports.voice and held; a human vision labelled VOICE or a model step declaring 'voice' sets neither; a keepsVoice writer after C5's D3 VOICE (fixture bypassing admission) is refused when it changes a line of the VO script; canonical C5 runs unchanged, including its retry to D2. The guard: a post-VOICE writer without keepsVoice fails before any gateway call; it does not fire on a C5 retrying D1, on vanilla-overlap, or in replicate(2, build>react>fix>voice). Start: a recipe over ENGINE_LIMITS fails before beginRun and ends 'failed'. Then implement held, ports.voice from voiceWrite, the keepsVoice union, Ctx.contained and the guard, the pick throw, the start check inside the try, capTurn with the 'choose' final, RunStopped to cancelRun, wording.ts reading HUMAN_WRITE_ROLES, estimator loopRounds and the C2/C6a copy. Record the second retirement in ADR-0082.
16. 11. e2e: drive the C6a author loop to its cap with a small-max fixture, including a raise, the final choice, and cancellation while the cap question is open. Then update spec section 3.2 (loop and gate rows, exit points, operator effects on the work) and section 4 (admission, the declaration rule, the held voice, set-aside, diff means semantic equality, limits by owner), and move both ADRs to Accepted.


**Acceptance tests**
- checkAnswer on C4 plus a model fix after VOICE is refused with ST12 'writer-undeclared' and/or PR6 plus COMPOSED-VOICE in all three forms: writes:false, writes omitted, and writes omitted with produces:['artifact']. All three are accepted today.
- V1 and V1b are refused with ST12 'voice-undeclared' (V1 also PR6) and the writer allowance. Both are accepted today.
- M1-M3, W1 (C2, C3), W2, W2b, W2c, W2d, Q1+W1, Q1+W2 and X1 are refused with ST12 'voice-not-written' (and 'block-role' where the role is not voice) plus COMPOSED-VOICE; X3 and X4 with ST12 'voice-not-written'; X2 with ST12 'voice-undeclared' and 'block-role'.
- K1-C1 (C1's VOICE after a defect check in a check-clean loop, max 1, policy), K1-C1b (max 2, onCap human), K1-C2, K1-C5 (vo-script) and a VOICE after a relay whose link holds the check are refused with COMPOSED-VOICE; K1-C6c (C6's author write after the check) with COMPOSED-AUTHOR. All are accepted today and by r3. A C6 author loop with the write before the check is admitted.
- C6 with its author write declared as role fix is admitted (r3 would report COMPOSED-AUTHOR).
- K2b (render-in-scene), K2f (vo-audio) and K2m (matte) moved after C5's D3 VOICE with keepsVoice kept are refused with COMPOSED-VOICE (writer allowance per VOICE). K2b and K2f are accepted today and by r3. At run time (stage 4), a keepsVoice writer after C5's D3 VOICE that changes a line of the VO script fails the held-voice check.
- K2g (C5 with VOICE moved before CUT and TELLS, labels and knobs stripped) is refused with ST12 'block-role' and COMPOSED-VOICE. Accepted today and by r3.
- R1 (C3's keep-or-revert moved right after the human cut) is refused with ST12 'set-aside'. Accepted today and by r3's flow.
- G1 (C1 with a retrying one-shot gate inside each-candidate) is refused with ST10 'retry-scope' at compose and by Runner.start. Accepted today and by r3.
- Declaration monotonicity over writes, produces 'voice', keepsVoice and every block label: no single change admits a refused recipe (prototype 4,256 changes, 14 bases, 0 admitted).
- Placement soundness: no single move of a seq child of C1-C7 that admission accepts breaks a checkpoint protection under the trace oracle (prototype: 3,453 moves; today 72, r3 16, r3-1b 0).
- V2a and V2b are refused with ST9/ST10 'human-write' plus COMPOSED-VOICE; V2c, V3 and V3c with COMPOSED-VOICE (V3 also DR9 'claims-only').
- Q1-Q3, QA and Q4 are refused with ST5 'set-aside'; QRh and QS with ST12 'set-aside'; QF gets no set-aside finding.
- Every CATALOG recipe, research-frozen ones included, validates with exactly its cited exceptions and an unchanged hash; no ST12, ST10, PR6, ST9/ST10, set-aside, COMP-1 or writer-allowance finding is added; runsEveryTime yields the same checkpoints as today's alwaysRunSteps; C5's matte (over-declared writes:true) stays legal; DR9's raw findings are unchanged; operators.test.ts ST9:writes and ST10:writes still pass.
- compose.test.ts:104 (the mock composer widens C4's key-lines VOICE to every-line) stays ok:true; an exact (stage, scope) key comparison would have refused it.
- COMPOSED-PROMPT is reported for C1 critic-fix using product.c4.revise, C4 draft using product.c7.implement, and C3 revise on a fix that does not consume critique; canonical C7 copied verbatim is admitted; all 72 product model steps dry-render and match their output contract.
- ST2 'feed' for variants3 and variants3b; ST10 'feed' for variants7; ST12 'pick-judge' for variants4.
- A composed C5 whose gate retries D1 is admitted; at run time its D1 build runs on the retry pass without the guard firing.
- ST3 'limit' (no exception relaxes it) for replicate 1e9 or MAX_SAFE_INTEGER, for step runs over 2,000, and for replicate(300, seed) followed by each(critic) (batchBytes), on every kind. COMPOSED-LIMIT for C1 replicate 17, nested 50x50, loop max 13, relay 9 and 5 lenses. b-bon at N=64 passes ENGINE_LIMITS.
- checkAnswer on a 2,000-deep nested seq returns SCHEMA violations (today a RangeError).
- Runner.start with replicate 1e9, or with G1, throws RecipeRefused, and no run record or workflow exists afterwards.
- web startRun: a stored composed recipe with ok:true that fails current admission gets 400; one whose recomputed diff differs gets 409 and an updated intake; an unchanged one starts with the stored hash.
- The workflow bundle contains no @byway/protocol file other than blocks.ts and media.ts after stage 1; its hash is unchanged by stages 2 and 3 and by any edit to rules.ts or exceptions.ts.
- Interpreter: a model writer without keepsVoice after a human VOICE fails before any gateway call, including when the VOICE did not declare 'voice'; a step that only declares VOICE sets neither ports.voice nor held.
- diffFromNearest never reads 'The same steps' for a single semantic change, an added pick or a move across an exit point; an id-only rename or a consumes reorder still does.
- presentComposed does not explain an R pick as 'The AI chooses what to keep', a claim-log VOICE as 'write the words readers will take as yours', or a step labelled VOICE that is not a voiceWrite as your words.
- Human loop humanGate(1): the cap question is asked, and approving it exits. humanGate(3) answered No every time: READY, READY, cap, rounds 4-6, then the final choice. 'Stop the run' ends the run as cancelled; a one-shot gate's 'No' still ends it as failed.
- e2e: cancelling while a human loop's cap question is open ends the run as 'cancelled'.


**Compatibility.** Recipes and hashes:
- No canonical or research-frozen recipe changes. Hashes, recipes/ snapshots, the manifest and research pins are unchanged.
- CATALOG validator verdicts are unchanged; the conformance test guards them. The new clauses (block-role, retry-scope, the exit-aware set-aside, the writer allowance per VOICE, COMP-1 over runsEveryTime with authorWrite as any non-voice person write) add nothing on any of the 18 CATALOG recipes (drive.mts: every role carries its block; no retrying gate in a fan-out; no person write after an exit point; runsEveryTime yields the same checkpoints as alwaysRunSteps; copies of C1-C7 against themselves get no composed finding).

Research:
- Only the shape bounds and ENGINE_LIMITS apply to research-frozen recipes. b-bon (no seeds, no options in its fan-out's ports) passes ENGINE_LIMITS for N up to 125; at large N with a large fixed copy deck, byte safety depends on the by-reference item, since run inputs are outside batchBytes.
- ST12 counts writes-work and person writes only, never restores, so c1h's proxy keep-or-revert is untouched. Research recipes have no human writes or VOICE, so the voice, held-voice and set-aside rules add nothing; the fixed copy deck still arms PR6 'fixed-input' and never the run-time guard (held stays empty).

Temporal:
- Stage 1 changes the workflow bundle once: @byway/protocol becomes side-effect free, so its rule and exception tables leave the bundle (in-memory build: e572716a to bfdda860; ST12 then changes nothing). Runs open at that upgrade end with 'started by an older version' (ADR-0078). Stages 2 and 3 leave the hash unchanged (build tests). Stage 4 changes interpreter.ts, wording.ts and run.ts once and retires open runs a second time.
- RunInput is unchanged. Ports gains an optional `held` (string[]), read by the activities' keepsVoice check; ports.voice is set from the executed VOICE write, which coincides with the declared port on every catalog step. Ctx.contained lives only in the workflow and is never persisted.

Stored data:
- No SQLite migration. Stored composed intakes are re-admitted at start with their own id and hash: 400 'rebuild' when they fail (including one that relied on a VOICE label, a skippable checkpoint, a moved writer or a block label), 409 with a refreshed intake when the disclosure changed.

Contracts (ADR-0068), all additive:
- Advisor.admit; RecipeRefused from Runner.start;
- RuleId ST12 with clauses writer-undeclared, voice-not-written, voice-undeclared, block-role, voice-per-candidate, pick-judge, pick-actor and set-aside; new clauses ST5 'set-aside', ST3 'limit', ST9/ST10 'human-write', ST2/ST10 'feed', ST10 'retry-scope', DR9 'claims-only';
- the ST3, ST10, LS1 and DR9 descriptions widen;
- the @byway/prompts main entry gains slotsForStep (structural type); the advisor's prompts dependency widens to PromptLibrary.

Runner fixtures use role judge for judged picks and small counts.

**ADR.** Yes. ADR history is append-only, so these are two new ADRs.

ADR-0081, 'Recipe semantics are derived from execution and checked at every entry', records:
- the declaration rule: protections are granted only by executed predicates; declarations only add arming or refusals; ST12 refuses an under-declared writer (over-declared writes:true stays legal, as on C5's matte) and a VOICE or block label that disagrees with execution in either direction; keepsVoice is an executed request for the held-voice check;
- the effects table; personWrite, voiceWrite and authorWrite (any non-voice person write); voiceScope and its coverage order; the block of each role;
- loop exit points, runsEveryTime and the exit-aware flow walk, which every flow-based rule uses;
- containment: contained model writers are allowed, contained human writes and declared VOICE are not;
- what each operator can put in place of the work, and set-aside, enforced at admission (the interpreter does not re-implement it, for proportionality);
- the held voice: keepsVoice keeps every executed VOICE write on the path; the composed profile allows writers after each VOICE only as the nearest does after its counterpart;
- the operator port semantics, gate feeds, one-shot metrics, pick judge and actor, no per-candidate VOICE, and the gate retry as a stage-level transfer that may not sit inside a fan-out;
- limits by owner, with batchBytes as the count-determined part of a scheduling batch and run inputs owned by the by-reference item;
- engine admission (runner and workflow start) versus product admission (compose and web start);
- prompt binding by declared output plus a dry render; semantic equality in the diff; re-admission at start with the stored id;
- @byway/protocol is side-effect free so rule edits do not retire runs; stage 1 retires open runs once;
- ADR-0058's 'cannot be removed' as one-to-one counterparts of executed checkpoints that run every time.

ADR-0082, 'Every loop exit at the cap follows one policy; a loop a person holds ends only on their answer', extends ADR-0073 and records the end-status policy (a failed check is failed even when confirmed; a person stopping with nothing failed is cancelled) and stage 4's retirement.

Update spec sections 3.2 and 4 to match.


**Deliberately not doing**
- No separate compiled plan IR and no interpreter rewrite (option A).
- No removal of `writes`, keepsVoice, block or the 'voice' port declaration (option D). They stay as declarations that can only make a step stricter, and ST12 keeps them honest.
- No ST12 'skippable' refusal for every kind (root-cause critic's suggestion). The protection is restored by counting only checkpoints that run every time; refusing every person write after an exit point would also refuse a legitimate human fix after a check in a check-clean loop (the person repairs what the check found; skipping it on a clean check is intended). The placement sweep finds no admitted move that skips a counted checkpoint.
- No VOICE counterpart from a human build or fix labelled VOICE. It runs as the author's draft, not the VOICE write-back, and block-role now refuses the label.
- No run-time arming from declarations: the interpreter reads only voiceWrite; admission arms on the superset voiceArm, so no admitted recipe meets the run-time guard where PR6 passed.
- No run-time set-aside (clearing options and the previous version at a human write, tagging loop snapshots) and no effects-gated applyModel. Admission refuses every recipe where they would matter, research recipes have no human writes, and parserFor is held to the effects table by an agreement test. This keeps the shared engine's change surface small for ADR-0041 research releases.
- No set-aside check at runner or workflow start. Those entries enforce executability only; set-aside is enforced at compose and web start for composed recipes and by the conformance test for the catalog, the only recipes that can be started.
- No CancellationScope around concurrent children for a gate retry. Refusing a retrying gate inside a fan-out is simpler and changes no catalog verdict.
- No per-scope 'voice' port for consumers. ports.voice stays the latest VOICE answer (what C5's vo-audio reads after vo-script); a voice consumer moved after a later VOICE is refused by the writer allowance.
- No rejection of contained model writers such as vanilla-overlap.
- No product policy (DR/PR defaults, COMP-1, COMPOSED-LIMIT, set-aside, ST12's voice clauses) in Runner.start.
- No per-candidate voice tracking through replicate or each joins. A VOICE per candidate is refused instead.
- No describer for every semantic field. Projection equality decides 'The same steps'; specific describers cover picks, gate strictness, early stops, VOICE scope, optional triggers and container or exit-point moves; everything else reads 'Other technical changes that affect how it runs'.
- No runtime concurrency limiter in replicate, each or audit.
- No byte bound on run inputs and no brief-size cap in this cluster. ACCEPTED RESIDUAL, routed at P2 (step 0): the brief, a fixed voice deck and other run inputs are carried by value in every activity input, so canonical C1 and C2 can still wedge in 'running' with very large attachments until the by-reference item lands. batchBytes covers the count-determined part (seeds and option lists).
- No implementation of one-shot check-clean or human gates. They are refused.
- No change to critic and check loop cap semantics beyond the feedless exit.
- No mapping of Temporal limit failures to failed runs. That belongs to the backlog item 'Reconcile lost runs while the engine runs'.
- No structured-data diff (UX-13 remainder), no relabelling of composed-recipe evidence, and no change to the stale-view-after-a-write behaviour shared by every writer.


**How it resolves each finding**
- **F01:** One effects table, the person's-words predicates (personWrite, voiceWrite, authorWrite as any non-voice person write), voiceScope with its coverage order, the block of each role, loop exit points with runsEveryTime and an exit-aware flow walk, the containment rule, the held voice, and the operator effects on the work replace every reader of a declared `writes`, a declared 'voice' port, a block label, a structural 'always runs' and an exit-unaware flow. The readers that move are PR6, extraWritersAfterVoice, alwaysRunSteps/COMP-1, DR7 and DR9 (through honest labels), ST9, ST10, scope.ts, feedsSwaps, appliesFindings and the interpreter's ports.voice.

The declaration rule: protections are granted only by executed predicates. COMP-1 counts executed VOICE writes by (stage, scope) and author writes by stage, one to one, over steps that run every time; PR6 arms on executed or declared voice; the writer allowance is per VOICE counterpart; keepsVoice is checked against every held VOICE at run time; ST12 refuses an under-declared writer and any VOICE or block label that disagrees with execution. K1 (C1, C1b, C2, C5, C6c, relay), K2b/K2f/K2m, K2g and R1 are refused, along with every r1-r3 case; no single declaration change admits a refused recipe (4,256 tried) and no single move of a C1-C7 node that admission accepts breaks a protection (3,453 tried; today 72, r3 16).

Set-aside is enforced at admission on the exit-aware flow (ST5 and ST12 'set-aside'). ST12 also refuses per-candidate VOICE, non-judge pick judges and a mismatched pick actor. ST9/ST10 refuse human writes and declared VOICE inside lenses and gate bodies. COMPOSED-PROMPT checks the template's declared output plus a dry render. Operator disagreements are settled in scope.ts and gateFeed.

Defence in depth: web start re-admits with the stored id and refreshes the disclosure; runner and workflow start enforce executability; the interpreter's port-scoped held voice drives the PR6 guard and the keepsVoice union; pick no longer defaults to 'A'.
- **F02:** Bounds are split by who controls the counts.
- parseRecipe bounds shape (depth 64, 10,000 nodes, 1 MiB) iteratively, so deep trees become SCHEMA violations.
- ENGINE_LIMITS: finite positive counts, peak 500, 2,000 step runs, 3 retries, and batchBytes <= 2 MiB per concurrent fan-out (width x (base + about 51 B per seed that can precede it + the option ids and views in its entry ports), constants measured from the real interpreter). Reported as ST3 'limit' and enforced at Runner.start and at workflow start.
- ST10 'retry-scope' keeps a retrying gate out of replicate, each and audit, so a retry never orphans concurrent siblings and workBound is a real bound.
- COMPOSED_LIMITS (n 16, loop 12, relay 8, lenses 4, peak 32, 400 step runs, depth 12, 100 nodes, 32 KiB) apply only to model-authored recipes; their worst batch is about 0.7 MB with the demo brief.

The root cause of the bytes is now named correctly: the verifiers' GrpcMessageTooLarge came from RunRef.seeds by value (quadratic in counts), not the brief. Accepted residual, routed at P2: run inputs (brief, fixed voice deck) are still carried by value and can wedge canonical C1/C2 with very large attachments; the backlog item (brief, seeds and unconsumed ports by reference) is widened accordingly, with a demo-mode acceptance test.
- **F08:** diffFromNearest is rebuilt on the shared semantic definition: exhaustive FIELD_ROLES; a projection that drops names and sorts set-like arrays; every node type paired; 'The same steps' only when projections are equal; specific describers for picks, gate strictness, early stops, VOICE scope, optional triggers and container or exit-point moves (V2a, K1-C1 and K2b now read what changed); 'Other technical changes that affect how it runs' otherwise.

present.ts explains R picks as random, reads appliesFindings from the effects table, and shows 'your words' only for executed VOICE writes, worded by voiceScope.

Web start recomputes the disclosure and asks for review again when it changed. A single-field mutation test across C1-C7 guards that no semantic change reads 'The same steps'.
- **F20:** Every loop exit at the cap goes through capTurn, covering the human-metric branch and the :532 fallthrough. Human loops ask the cap question with raise-once, then a final 'Use this version' or 'Stop the run'; Stop ends the run as cancelled, under one stated end-status policy (a failed check is failed even when confirmed). Critic and check loops with a feed keep ADR-0073.

gateFeed admission stops critic loops from reaching the cap without their gate, and LS1 covers human loops. The estimator and workBound read one loopRounds; the exit points the cap policy acts on are the same ones COMP-1 and the flow walk read. Copy, the docstring, the c6.ts comment and spec section 3.2 are aligned in ADR-0082. Tests and an e2e cover max 1, max N with repeated No, the raise, the final stop, a feedless critic loop at its cap, and cancellation while the cap question is open.


**Changes forced by the adversarial rounds (last round)**
- ROOT-CAUSE mustFix 1 (K1, COMP-1 counts a checkpoint the gate can skip) ACCEPTED. Verified: interpreter.ts:317 runs afterGateStep after a model critic or check; :579/:589/:594/:597/:604-606 throw LoopExit; loop() catches it at :512-518, so the rest of the round never runs; alwaysRunSteps (profile.ts:64-87) visits loop bodies whole. Root cause: 'always runs' and the validator's flow walk (flow.ts:33-38) are structural and ignore where a gate can end a body. Changed: semantics.ts defines loop exit points (through seq, relay, route and optional; not through replicate, each, audit, gate or an inner loop); runsEveryTime excludes steps after an exit point of an enclosing loop; COMP-1 counts only those; the single flow walk also sends the state after each exit point to the loop's exit. Prototype (revise-A-r3-1b/drive.mts): K1-C1, K1-C1b, K1-C2, K1-C5 and a VOICE after a relay whose link holds the check give COMPOSED-VOICE; K1-C6c gives COMPOSED-AUTHOR; a C6 author loop with the write before the check stays admitted; every CATALOG recipe's counted checkpoints are unchanged. The same root cause hid R1, found by my placement sweep (C3's keep-or-revert moved right after the human cut restores the AI angle card when the critic passes before `revise`): accepted today and by r3's flow, refused by ST12 'set-aside' on the exit-aware flow.
- ROOT-CAUSE mustFix 1, suggested ST12 'skippable' for every kind: PARTLY REBUTTED. The executed predicate is the root fix and restores the protection; a blanket refusal of person writes after an exit point would also refuse a human fix after a check in a check-clean loop, where skipping on a clean check is the intended behaviour. Evidence: the placement sweep finds no admitted move that skips a counted checkpoint.
- ROOT-CAUSE mustFix 2 (K2, keepsVoice honoured only against the latest VOICE) ACCEPTED. Verified: interpreter.ts:409 replaces ports.voice; relay.ts:92, model-step.ts:113 and asset.ts:122/134 check only it (writes.ts:20-23, copy.ts:291-301); the allowance counts writers after any VOICE (profile.ts:180-189). Changed at both ends: the held voice is every executed VOICE write on the path and keepsVoice checks their union at run time (stage 4); the composed profile allows writers after each VOICE only as the nearest does after its counterpart (stage 1). K2b, K2f and K2m (matte) are refused; canonical C5 is unchanged, including its retry to D2. keepsVoice and every block label are now in the monotonicity set.
- ROOT-CAUSE mustFix 3 (G1, a retrying gate inside a fan-out orphans its siblings) ACCEPTED. Verified: Promise.all at interpreter.ts:427/:434/:659, RetryStage at :679, runStages restarts at :143-149 with no cancellation, gateRetries keyed by gate id (:104, :672); main.cancel() in run.ts runs only when the run ends. Changed: the retry is defined as a stage-level transfer; ST10 'retry-scope' (invariant) refuses a retrying gate inside replicate, each or an audit lens, and engineProblems checks it at runner and workflow start; workBound is stated as a bound under this rule. CancellationScope was not chosen (more engine change, same effect). G1 is refused; the catalog's only gate is at stage level.
- ROOT-CAUSE shouldConsider (DR7 reads block labels, K2g) ACCEPTED at the root rather than in DR7: execution never reads `block` (runner activities/steps.ts:35), so semantics.ts gains BLOCK_OF_ROLE and ST12 'block-role' refuses any label that is not its role's block. That makes every label reader honest (DR7, DR9, ST6, ST7's knob registry, the presentation). All 18 CATALOG recipes agree (blocks.mts). K2g is refused by block-role and by the per-VOICE allowance.
- ROOT-CAUSE shouldConsider (authorWrite counts build only) ACCEPTED. A human build and a human fix take the same human.ts branch (:113-121), the same prompt (wording.ts:43-45) and both set `authored` (interpreter.ts:408). authorWrite is now any non-voice person write; C6 with its author write as role fix is admitted (r3 refused it).
- ROOT-CAUSE shouldConsider (feeds inside a relay) ACCEPTED: exit points pass through relay, so later links after an exit point are conditional in runsEveryTime and in the flow walk; the diff's move describer says so.
- ROOT-CAUSE shouldConsider (monotonicity covers only some fields; extend to placement) ACCEPTED in two parts. Declarations: the set now covers writes, produces 'voice', keepsVoice and all 8 block labels plus none; 4,256 single changes on 14 refused bases (including K1-C1, K2b, K2f, G1) admit none. Placement is not a declaration, so it gets its own property: a trace oracle (loops unrolled twice with exits after exit points, optionals both ways, every route branch, containers contained) checks every single move of a seq child of C1-C7 that the rules admit. 3,453 moves: today's rules admit 72 that break a checkpoint protection, r3's 16, r3-1b 0 (oracle.mts, oracle.log). Honest limits: the oracle shares step-level predicates with the rules and covers single moves only.
- ROOT-CAUSE shouldConsider (describe moves into a gated loop body and past a VOICE) ACCEPTED within the reduced describer set.
- ROOT-CAUSE shouldConsider (write down the exit points) ACCEPTED: design section 1d lists each exit, its reason and what it skips; COMP-1, ST12, the flow walk, workBound, capTurn and the estimator read it.
- ROOT-CAUSE verdict challenge F01 ACCEPTED: r3's 'fixes root cause: yes' was overstated (structural always-run, exit-unaware flow, keepsVoice against the latest VOICE). With 1c, 1d and 1f the claim is restored, with the evidence above and its stated limits.
- ROOT-CAUSE verdict challenge F02 ACCEPTED: the work bound needed the retry-placement rule; F02's rationale and resolution now say so.
- REGRESSION mustFix 1 (stages 1-3 change the bundle) ACCEPTED. Verified: dist/workflows.js holds `var RULES` and `var EXCEPTIONS`; its stamp e572716a equals an in-memory build with build.ts's options. Root cause: the bundle hash covered admission tables the workflow never reads. Fix: @byway/protocol declares "sideEffects": false (simpler than PURE annotations, and it also drops EXCEPTIONS). My in-memory build (bundle-se.mts) leaves only blocks.ts and media.ts, changes the hash once to bfdda860, and adding ST12 then changes nothing; the critic's PURE variant reproduced too (bundle-pure.mts). Stage 1 now states one retirement of open runs, stages 2-3 are tested to leave the hash unchanged, stage 4 retires once more, and a build test guards it.
- REGRESSION mustFix 2 (seeds by value, F02 byte root cause misidentified) ACCEPTED. Verified: interpreter.ts:116 copies every seed into each RunRef; model-step.ts:112 and writes.ts:17 read them. Changed: F02's rationale and root cause name seeds and entry-port option lists (quadratic in counts) as well as the brief; ENGINE_LIMITS gain batchBytes with measured constants, so replicate(300, seed) followed by each(critic) is refused; the 500-wide e2e is replaced by a deterministic unit test that measures scheduled activity inputs; the P2 backlog item is widened to the brief, seeds, the fixed voice deck and unconsumed ports by reference.
- REGRESSION mustFix 3 (the declaration rule contradicts itself for `writes`) ACCEPTED. Verified: C5's matte is a tool relay with writes:true and keepsVoice that runs as a skip (interpreter.ts:261-275). The rule now says: for `writes`, only under-declaration is refused and over-declaration stays legal (matte is pinned in the conformance test); both directions apply to the VOICE declarations and to block labels.
- REGRESSION shouldConsider (proportionality of run-time set-aside) ACCEPTED: run-time clearing of options and the previous version, snapshot tags, the bestVersion filter, the model keep-or-revert pass and an effects-gated applyModel are dropped; set-aside is enforced at admission on the exit-aware flow. Kept: the port-scoped held voice (now also the K2 fix), the pick throw, capTurn and the workflow-start check.
- REGRESSION shouldConsider (effort) ACCEPTED: stage 1 is L. slotsForStep goes in a new prompts file exported only from the main entry, with a structural step type, so @byway/prompts gains no @byway/recipe dependency and nothing reaches /pure.
- REGRESSION shouldConsider (COMP-1 exact keys would refuse compose.test.ts:104) ACCEPTED and verified: the prototype shows an exact (stage, scope) comparison misses 'voice:D3:all/key-lines' for the mock composer's every-line VOICE, while the coverage order admits it. The test is pinned in stage 1.
- REGRESSION shouldConsider (Advisor.admit must keep the stored id) ACCEPTED: admit re-runs checkAnswer with the stored id, and a changed hash is a 400.
- REGRESSION shouldConsider (start check inside run.ts's try) ACCEPTED.
- REGRESSION shouldConsider (stage 4 reverses operators.test.ts:80-85 and the Audit doc comment) ACCEPTED: both are listed as intended changes in step 9, with the reason (several lenses cannot make one score).
- REGRESSION shouldConsider (F08 scope) ACCEPTED: describers only for picks, gate strictness, early stops, VOICE scope, optional triggers and moves; projection equality and the 'Other technical changes' line cover the rest.
- REGRESSION shouldConsider (cancelled versus failed) ACCEPTED as one stated policy in ADR-0082: the status names what ended the run, so a failed check confirmed by the person is failed and a person stopping with nothing failed is cancelled.
- REGRESSION shouldConsider (OUTPUT_CONTRACTS is in the bundle) ACCEPTED: prompts/src/outputs.ts is not edited before stage 4.
- REGRESSION verdict challenge F02 ACCEPTED (see mustFix 2). Severity stays P2.
- KEPT from r3: the effects table, personWrite/voiceWrite, ST12 voice clauses, containment, voiceScope one-to-one counting, gate feeds, set-aside at admission, limits by owner, prompt binding by declared output plus dry render, FIELD_ROLES projection, capTurn, re-admission at web start. drive.mts re-confirms every r1-r3 case with its expected verdict, QF free of set-aside findings, the C5 gate retrying D1 admitted, and C1-C7 copies admitted.
- Process note, for honesty: one command this round started with `python3 - <file> <<'PYEOF'`, the heredoc pattern the ground rules forbid. python3 is not installed, so it failed with 'command not found' and ran nothing; I then used the Edit tool. A mistaken `cat > /tmp/dummy` created an empty C:/Users/arvik/AppData/Local/Temp/dummy, which I deleted. Nothing was written to the repo (git status clean, HEAD b33f128) and the review folder was not accessed. All prototypes and outputs are in C:/Users/arvik/AppData/Local/Temp/byway-review-verify/round3/revise-A-r3-1b/: sem.mts, drive.mts (r31b.out.json), oracle.mts (oracle.out.json, oracle.log), bundle-se.mts and bundle-pure.mts (with .out.json), blocks.mts.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- F02 batchBytes: the seed term is ambiguous. The design counts 'seed-step runs that can precede it'. Read as 'the seeds before the fan-out starts', it misses seeds that finish inside the same fan-out before that fan-out's later activities are scheduled. Take replicate(300, seq(seed, render, critic)): peak 300 and 900 step runs both pass ENGINE_LIMITS, and the formula gives about 300 x 1.4 KB. But each critic input carries every seed finished by then (up to about 300 x 51 B), so one scheduling batch can pass 4 MB.
- Accepted residual, carried over from the previous final check. Run inputs are still passed by value in every activity input: the brief with up to 5 x 200,000-character attachments, and the fixed voice deck. Stage 4's ports.held adds another by-value copy of every VOICE answer to each later activity input. Large inputs can still wedge canonical C1/C2 runs in 'running', because they hit Temporal's 4 MB batch limit, its 2 MB payload limit or its history-size limit.
- The evidence has stated limits. The placement oracle (3,453 moves, 0 admitted breaches) and the declaration-monotonicity sweep (4,256 changes, 0 admitted) reuse the rules' step-level predicates, and the oracle's 'writers after a VOICE' criterion is the same per-VOICE allowance the profile enforces. Its zero holes are partly by construction, and the sweep covers single moves only.
- Stage 1 adds a test that the effects table agrees with prompts/src/outputs.ts (ARTIFACT_ROLES, outputForStep). The design also says outputs.ts, which is in the workflow bundle, is not edited before stage 4. The earlier critic found that outputs.ts disagrees with the runner's writer roles for voice and render.


## Cluster B: Paid-operation identity, accounting and cost authority

**Root cause.** The gateway's spend authority keeps no durable, shared record of a paid call between admission and settlement. Its admission bound also does not match the billing plan that is actually dispatched.

Today exposure exists in only two forms:
- an in-memory reservation, held by one process and sized for one attempt on the requested model (gateway.ts:130, 194-197, 511-540);
- a settled JSONL line, read leniently and appended last (ledger.ts:207, 242).

Everything between those two is invisible to the caps and to Temporal retries:
- another process's in-flight call;
- a fal job the provider has accepted;
- a submit or stream attempt that may have been billed, re-sent blindly by an SDK's hidden policy;
- an owner that crashed or timed out;
- a server-side refusal-fallback or sticky-routed attempt on another model inside the same request;
- a billed call whose ledger append failed or tore.

The runner memo records results only after the effect, minutes later in the worst case, so it cannot stand in for this record.

One correction removes these symptoms at the boundary where the wrong assumption lives:
- a durable, shared paid-operation record that fails closed, written at admission and closed at settlement;
- a lease on each operation, held only while its caller is alive and, once the operation is settled, until its result is kept;
- one decision on whether a failed attempt may have been billed;
- dispatches that bill exactly one model. Anthropic requests carry no server-side fallback, so the reservation always describes what is sent.

Token estimates remain estimates. Their contract is stated rather than claimed to be a bound.

The gap at the UI edge is a separate, minor root cause: a paid side effect inside a GET render, and no identity supplied by the caller when a run starts.


### F03: Paid operation identity, reservation, acceptance, result and accounting are separate nondurable steps

- **Verdict:** ACCEPT_PARTLY · **Severity:** P2 (review: P1) · **Label:** paid-operation accounting / spend-cap integrity

**Rationale.** Every accounting gap reproduces at b33f1285; I re-checked the source myself. Two mechanisms the review relies on are wrong, and the critics corrected a third. Sub-claim by sub-claim:

(1) Cross-process reservation race: CONFIRMED.
- reservations is a Set held by one instance (gateway.ts:130). reserve() adds only that Set to the ledger spend (gateway.ts:511-540), and its own comment says so (506-510).
- The web process creates two gateways on one ledger path, one for demo and one keyed (create.ts:56). The worker creates one (scripts/serve.ts:141).
- The exposure is bounded. Advisor calls carry no runId, so only the workspace cap is exposed, and only by the other process's in-flight estimate.

(2) Memo race: the mechanism is CONFIRMED, but the trigger is narrow.
- memo.ts:81-106 does getMemo, then the paid call, then setMemo (first write wins).
- An overlap needs one of two things: a second Temporal attempt while the first is still alive (heartbeat timeout 30 s, startToClose 15 or 45 min, acts.ts:17-22), or a worker that dies after the provider has answered.
- The window after settlement is wide. Before the memo exists, the call waits for the ledger lock (up to 120 s, gateway.ts:91, 575-578), puts the bodies (583-584), and makes up to 4 memo saves, each with a 10 s busy wait (memo.ts:58-63).
- Both calls are ledgered. This is duplicate spend, not lost accounting.

(3) Accepted fal job lost: PARTLY. The refuter is right on the mechanism.
- toFailure maps every GatewayError to type 'StepFailed' (failures.ts:46), which acts.ts:12 lists as non-retryable. Temporal never retries a poll-exhaustion error.
- The real defect comes through two other paths:
  (a) Re-submission after an ambiguous failure.
    - @fal-ai/client 1.10.1 hard-codes QUEUE_RETRY_CONFIG on queue.submit: 3 retries on 429, 502, 503, 504 and network errors, walking the cause chain (queue.js:33-38, 66).
    - request.js:35 merges options.retry over config.retry, so the client's {maxRetries:0} does not apply. The comment at fal.ts:69 is wrong.
    - After the SDK gives up, the gateway's withRetries (gateway.ts:347-354) re-submits on 429 and 5xx statuses only. Undici resets are classed non-retryable, because the code is on the TypeError's cause (errors.ts:8-9, 61-67). I re-ran the critic's probe and it confirms this.
    - 502 and 504 are the ambiguous statuses.
  (b) A worker that dies during a multi-minute clip is retried after its heartbeat times out (media maxAttempts 2). The memo misses, so a second clip is submitted.
- The lost job's spend never reaches the ledger (fal.ts:144-146 admits this).

(4) Damaged accounting fails open: CONFIRMED.
- readNew skips lines it cannot parse (ledger.ts:242-246).
- Gateway.verifyLedger() is in the contract, but no production code calls it; only memo.ts:127 passes it through.
- A torn tail makes lastEntry() throw (ledger.ts:203-207). Every later billed call then fails non-retryably and goes uncounted (gateway.ts:579-580).
- A torn tail needs an OS crash, power loss or a short write on a full disk. A process kill cannot tear the single small appendFile at ledger.ts:136.

(5) UI command identity: PARTLY, P3.
- A GET render makes a paid call: recommend page.tsx:48, through api.ts currentRecommendation.
- client.ts:67 mints a new run id each time a run starts.
- But Start is guarded while busy, and the duplicates cost cents and are ledgered.

**Severity rationale.** The spec promises that the gateway enforces the run's budget and that the ledger is the spend authority (spec 3.3/3.4). That promise breaks in real ways, but each leak is either bounded or needs an unusual trigger:
- The cross-process overrun is limited to the workspace cap and to one advisor call's estimate.
- The memo overlap needs a Temporal timeout or a dead worker.
- Ledger damage needs an OS crash, power loss or a full disk during an append. After that, every later paid call is billed, fails and goes uncounted until someone repairs the file by hand. This part is serious but rare.
- A fal re-buy costs $0.35-1.70 per clip, after an ambiguous submit or a worker restart.
No unbounded overspend was shown, so P2. The fal re-dispatch and the torn tail should be fixed first.

**Root cause.** Between admission and settlement, the gateway keeps no durable, shared record of a paid call:
- Exposure exists only as a reservation in one process's memory (gateway.ts:130), or as a settled JSONL line that is read leniently (ledger.ts:242).
- Provider acceptance (the fal request_id) lives only on the stack (fal.ts:127-129).
- The runner records the result only after the effect, and after a window that can last minutes (memo.ts:85-103).
- Nothing decides whether a failed attempt may have been billed. Retries are blind, and the decision is split between an SDK's hidden policy and a classifier that misreads wrapped errors.

Anything in that gap is invisible to the caps and to retries: another process's in-flight call, an accepted job, an attempt that may have been billed, a dead or timed-out owner, or a billed call whose ledger write failed.

A separate, minor root cause sits at the UI edge: a GET render creates the recommendation as a side effect, and starting a run has no identity supplied by the caller.


### F04: Planning estimates are used as guaranteed cost bounds

- **Verdict:** ACCEPT_PARTLY · **Severity:** P2 (review: P1) · **Label:** cost-cap enforcement

**Rationale.** CONFIRMED core claim. Both verifiers agree and the source matches.
- Admission reserves one attempt on the requested model (gateway.ts:194-197).
- The Anthropic adapter opts every live call into the server-side refusal fallback by default (anthropic.ts:73, 123; gateway.ts:455). No production root turns it off; only one adapter test passes refusalFallback:false (providers.test.ts:146). No ADR records the choice, and the research protocol requires it off (docs/study1/protocol-v1.1-draft.md:437).
- Settlement prices each billed iteration on the model that served it (anthropic.ts:96-110; gateway.ts:543-549).

Anthropic's documented routing (claude-api skill, shared/model-migration.md, read now), corrected per the final-check critic:
- Sonnet 5.5 retries only cyber and frontier_llm declines, on claude-sonnet-5 at $2/$10. It does not retry bio, reasoning_extraction or general_harms.
- Opus 5.5 never retries reasoning_extraction. It falls back within its allowed_fallback_models, expected to be claude-opus-5 or claude-opus-4-8 at $5/$25.
- Fable 5.1 falls back to claude-opus-4-8 or claude-opus-5 by per-category routing that is not published, and some categories have no fallback.

What that costs:
- A declined attempt is billed if it declines mid-stream. If it declines before any output, billing depends on the category.
- One routed refusal can therefore settle at up to about 2x its reservation on Sonnet 5.5, 2.25x on Opus 5.5 and 1.5x on Fable 5.1. My earlier '2.5x', and 'the refused attempt is billed too', overstated this.
- Sticky routing is a second path that I had missed. For about an hour after a fallback, requests carrying fallbacks with the same content are served directly by the fallback model. A call can then settle at the fallback model's price with no refusal in that call.

CONFIRMED, but conditional: a served model with no price row is settled at the requested model's rate (gateway.ts:547).
- claude-sonnet-5 has no price row, so a Sonnet 5.5 fallback is priced at the Sonnet 5.5 row. The rates are the same, so the result is correct by coincidence.
- OpenAI and Google report dated or versioned snapshots of the requested model (openai.ts:100, for example gpt-6.1-sol-2026-09-30 in providers.test.ts:161; google.ts:56). The requested rate is right for those.

PARTLY: the text and image estimates are heuristics that the code describes as erring high (estimate.ts header). They are not bounds:
- chars/3 is not a bound for dense non-Latin text, hex ids or minified markup.
- An image of unknown size is estimated at 5000 tokens, below the file's own 6400 cap.
- gpt-image's 8000 output tokens is a planning bound (prices.ts:59-63).

REFUTED:
- The overspend is neither silent nor continuing: the settled cost is the true one, and the next call is refused.
- The advisor's range only seeds the suggested budget; it is not the enforced bound.
- The fallback fix does not need F03's lifecycle.

**Severity rationale.** This breaks a promise the person sees: 'The run stops and asks before it would spend more' (RecommendationView.tsx:424-425), and the workspace budget is described as 'the most all runs together may spend' (SettingsView.tsx:171).

It is P2 rather than P1 because:
- the overshoot is limited to one extra attempt for each refused or sticky-routed call already in flight;
- it needs a safety-classifier refusal, which is uncommon in this creative product, and admission within a narrow band below the cap;
- later spend is refused, because settlement is correct;
- demo mode is unaffected.

**Root cause.** Two wrong assumptions.

(1) Admission assumes one billing plan: one attempt on the requested model. But the adapter opts every Anthropic request into a server-side fallback. That can bill a second attempt, or a sticky-routed first attempt, on another model that Anthropic picks by refusal category, and admission never saw that plan. Settlement also silently substitutes the requested rate for any served model that has no price row.

(2) The code and UI treat heuristic token estimates as guaranteed upper bounds ('estimates err high'). Without the provider's tokenizer, no pre-call estimate is a bound. The defect is claiming that it is one, and setting the default for an image of unknown size below the code's own maximum.


### Options


**A. The review's full operation lifecycle** (fixes root cause: yes; effort XL; risk high)

Build one SQLite operation state machine shared by web and worker. Each record binds:
- the identity of the user's command;
- the identity of the logical activity;
- the request hash;
- the reservation;
- the provider job id;
- the uncertainty and reconciliation state;
- the result artifact;
- the settled usage.

Other changes:
- Paid-call results move from the runner memo into the record.
- Blind re-submission is replaced by explicit reconciliation states and a reconciliation UI.
- JSONL becomes an export only.
- Creating a recommendation becomes an idempotent command, and run starts get caller ids.
- F04's caps are enforced through the same record.


*Pros*
- Removes every symptom of both findings, and the UI command gap, in one model.
- Results and money share one row, which also closes the window between settlement and the memo save.
- Matches idempotent-API guidance and fal's queue recovery by stored request id.

*Cons*
- XL effort. It rewrites the memo semantics of ADR-0079 and ADR-0080, every provider path, and the web start and recommendation flows. It also adds a reconciliation UI that a local, single-user product hardly needs.
- The person must reconcile text completions worth cents that have no provider idempotency.
- Moving results out of the memo while runs are in flight puts runs started on the old engine at risk (ADR-0078).
- Token estimates are still estimates, and a refusal fallback still needs the same single-model decision. A works only through the same contracts as C.


**B. Targeted patches per symptom (C's stage 1 alone, plus a reservation table)** (fixes root cause: partly; effort M; risk medium)

Separate fixes:
- C's stage 1: one billing classification, fal submit without hidden retries, server-side refusal fallbacks off, served-model resolution, the estimate contract, torn-tail quarantine and a single in-process call for the first recommendation.
- In-flight reservations in a short-lived SQLite table, with settled spend still read from JSONL. Keeping the two in step needs a 'last ledger seq seen' handshake.
- Paid admission refused while the ledger has lines that do not parse.


*Pros*
- Each patch is small and can ship on its own.
- JSONL stays the spend authority, so the spec line is unchanged.
- The most valuable fixes land fastest: the fal re-submission, the torn tail and the fallback overrun.

*Cons*
- Exposure before settlement still lives in several ad-hoc places, and a future provider path can miss one.
- Calls interrupted by a crash or a stop stay uncounted. The fal request id is not durable, so a retried clip is bought again.
- Because the audit file is still the cap authority, any ledger damage must block all paid work.
- Keeping SQLite reservations and JSONL settlements consistent is subtle.


**C. Durable spend book (SQLite) as cap authority, single-model dispatches (server-side fallbacks off), per-operation leases tied to the caller; JSONL kept as the audit outbox (staged)** (fixes root cause: yes; effort L; risk medium)

Three stages, each shippable on its own.

Stage 1 (M): independent fixes at the provider edge.
- One billingOf() classification in errors.ts, used by every provider path.
- Every fal queue job is submitted once over REST, outside the SDK's hidden retries.
- Anthropic requests carry no server-side fallbacks. The gateway option is removed, so every dispatch bills the model it was admitted for, and a refusal fails plainly with its category.
- Served-model snapshot resolution, with unknown models flagged.
- The estimate contract: non-ASCII text counts at its UTF-8 bytes, and images of unknown size at the maximum.
- Torn-tail quarantine with a file name Windows accepts.
- One in-process call for the first recommendation, shared by concurrent loads.

Stage 2 (L): a paid_operations table in byway.sqlite becomes the cap authority, behind a contracts SpendBook port.
- Admission, the sent mark, acceptance and settlement are short BEGIN IMMEDIATE transactions shared by web and worker.
- A row that was never sent is released.
- A sent row whose caller died, or an attempt that may have been billed, becomes 'uncertain'. It counts at its single-attempt bound against the workspace cap only, until the person clears it in Settings.
- ledger.jsonl stays the hash-chained audit record. A single idempotent absorb step reconciles every ledger line into the book: legacy entries, entries the outbox drained, and entries a crash left unmarked.

Stage 3 (M): the runner passes an operation key plus two signals, the invocation's cancellation and its end.
- An unsettled operation is held while the caller is alive and not cancelled.
- A settled operation is held until the invocation ends, which covers the memo save.
- An overlapping attempt waits for the memo.
- A timed-out or dead owner's operation is taken over, and an accepted fal job is resumed from its stored request ids.


*Pros*
- One correction at admission and settlement covers the cross-process race, crash and stop orphans, lost fal jobs, billed calls that never reached the ledger, torn or corrupt ledgers, and the fallback overrun.
- Single-model dispatches keep reservations at today's size, so concurrency does not drop. The C2 12-way stage still admits 9 of 12 at its suggested budget.
- byway owns no refusal-routing table. The product engine and the study engine both run with server-side fallbacks off (protocol-v1.1-draft.md:437), so a run's served model is the model it was admitted for.
- Interrupted calls never inflate a run's budget, so a stop and restart does not raise a budget question. The workspace cap still counts them conservatively, and the person can clear them.
- Uses machinery the product already runs: the shared SQLite file, WAL, BEGIN IMMEDIATE (db.ts:66-78), the CapsSource-style port, and Temporal's own cancellation (TIMED_OUT/NOT_FOUND) as the liveness signal.
- No change to workflow code, activity shapes, recipes or memo keys, so replay is unaffected (ADR-0078).
- Staged: stage 1 delivers the most valuable fixes before the migration.

*Cons*
- The upper end of L in total. The critic rated the earlier, larger scope XL; plan.ts, the fallback pricing bound, the client fallback table, the claim column and the POST have since been cut.
- It rewires admission for every paid call, and a defect there either blocks paid work or miscounts. Mitigation: one contract suite runs against both the SQLite book and the in-memory book, plus two-process tests, the demo e2e and a workflow-bundle hash test.
- The spend authority moves from the ledger alone to the book plus the ledger. This needs an ADR and a spec note.
- A classifier false positive that Anthropic's server-side fallback would have rescued now fails its step. That covers Sonnet 5.5 cyber and frontier_llm declines, and the routed categories of Opus 5.5 and Fable 5.1. Anthropic recommends opting in so that false positives do not become outages. ADR-0081 records this departure, and notDoing names the way back.
- Two residuals remain and are named. A caller process that dies between settlement and the memo save re-buys once, and the re-buy is counted. Admission still uses token estimates, so a call can settle above its reservation; that is recorded, and later calls are refused.


**D. Ledger-chain operations (JSONL as sole authority)** (fixes root cause: yes; effort L; risk medium)

Keep ledger.jsonl as the only spend authority, and add reserve, sent, accept, settle and release records to the hash chain under the existing cross-process file lock.
- Admission verifies the chain incrementally and folds the open operations, all under the lock.
- Liveness uses the same per-operation caller signals as C, written as lease records.
- F04 uses the same single-model dispatches, with server-side fallbacks off.


*Pros*
- No new cross-package port, and no spec change to the spend authority.
- Reservations and acceptances become chained records that show tampering.
- Cross-process visibility uses a lock that both processes already take.

*Cons*
- It builds a transactional database on an append-only file: lease takeover, key claims and state transitions all become folds over appends.
- Every admission and lease renewal contends on a file lock whose stale holders are broken after 30 s (ledger.ts:169). Lease records every 15 s grow the file and the contention.
- Damage to the audit file must still block all paid work, because the audit file is the authority.
- Every LedgerEntry reader must learn the new record kinds.


### Recommendation: C

**Why.** C corrects the shared root cause where the wrong assumptions live: the gateway's admission and settlement boundary, and the dispatch it admits. It uses machinery the product already runs.

The final check tightened C in three places.

1. Fallbacks. My client-side routing table was wrong for Sonnet 5.5 and Opus 5.5, and it cannot be known for Fable 5.1. Anthropic itself advises against owning a fallback list.
- C now turns server-side fallbacks off. Every dispatch then bills the model it was admitted for, and sticky routing goes away with them.
- This departs from Anthropic's opt-in recommendation, so it is a product decision, recorded in ADR-0081. A refusal now fails its step plainly, as refusals in categories Anthropic does not route already do today.

2. Ledger reconciliation. One idempotent absorb step reconciles every ledger line, so a crash between an append and its mark can no longer duplicate an audit entry.

3. Settled operations. A settled operation stays held until its caller's invocation ends, even after Temporal times the attempt out. A live caller therefore never causes a re-buy, and the drain on the call path waits at most 2 s.

Against B: B leaves exposure before settlement scattered, and leaves stop orphans, crash orphans and fal re-buys uncounted.
Against D: D forces a transactional lifecycle onto an append-only file, and makes any audit damage stop all paid work.
Against A: A adds a reconciliation workflow and moves results out of the memo. This local, single-user product does not need either.

Staging puts the most valuable fixes first, and none of them needs the book: the fal submit, the torn tail and the fallback overrun.

**Design.** STAGE 1: fixes at the provider edge that do not need the book (M)

1a. One billing classification.
- errors.ts gains billingOf(err), which returns 'none' or 'maybe'. It walks err.cause, so undici's TypeError('fetch failed') is read through its cause.
- 'none':
  - any answer that carries the provider's own error body, including 429, 500, 503 and 529;
  - a stream error event such as overloaded_error or api_error;
  - a failure before the request was written (ECONNREFUSED, ENOTFOUND, EAI_AGAIN, UND_ERR_CONNECT_TIMEOUT).
- 'maybe':
  - no answer after the request may have been written (ECONNRESET, EPIPE, UND_ERR_SOCKET, timeouts, AbortError);
  - 408, 502 and 504, or any 5xx without a provider error body;
  - a stream that ended without its terminal event.
- toGatewayError derives retryability from this classification. That fixes wrapped resets being classed non-retryable today.
- 'none' failures keep today's backoff.
- After a 'maybe' failure, a synchronous call (a completion or an image) is re-sent once. A fal job submission is never re-sent.

1b. fal submit.
- Every queue job, generation and extract-frame alike, goes through runJob's single submit: one direct REST POST to queue.fal.run/<endpoint>, through the adapter's fetch with the key header. The SDK's hard-coded QUEUE_RETRY_CONFIG therefore never re-sends a job.
- Status, result and storage upload still use the SDK.
- A 'none' failure, including a 503 with fal's error body, is retried with the gateway's backoff.
- A 'maybe' failure fails the call non-retryably, with a plain message that fal may have accepted the clip.
- The comments at fal.ts:69 and retry.ts:96-98 are corrected.

1c. Anthropic: server-side refusal fallbacks off, so every dispatch bills one model.
- Requests never carry `fallbacks` or the server-side-fallback beta header.
- GatewayOptions.anthropicRefusalFallback is removed; no production root sets it. The adapter's refusalFallback default becomes false, and only adapter tests set it.
- The adapter keeps parsing usage.iterations, so a response served by several models would still be priced per model.
- A refusal is recorded in the ledger and fails with 'refused', naming its category (anthropic.ts:116). Refusals in categories that Anthropic does not route already behave this way today. The runner surfaces it as StepFailed; the advisor shows the existing 'declined' message (model-errors.ts:30).
- With no fallbacks there is no sticky routing either, so each Anthropic call is served by the model it was admitted for. This matches the study protocol (protocol-v1.1-draft.md:437).
- byway owns no routing table. The comments in anthropic.ts:40-50 and prices.ts:47-48 are updated. The claude-opus-5 and claude-opus-4-8 price rows stay, for any multi-model response.

1d. Settlement pricing.
- The served model resolves to its own price row first.
- Failing that, a snapshot of the requested id is priced at the requested row, unflagged. A snapshot means the requested id followed by -YYYY-MM-DD, -YYYYMMDD, a three-digit -NNN, or @<version>. Because the suffix forms are this narrow, claude-opus-5-5 can never be read as a snapshot of claude-opus-5, the prefix collision Anthropic's guide warns about.
- Anything else is priced at the requested row and flagged LedgerEntry.priceBasis = 'assumed'. The field is optional and covered by the hash, and Settings shows it.
- A known served model is never priced above its own row.

1e. The estimate contract.
- estimate.ts and a note in spec 3.4 say that admission uses planning estimates, not bounds. A call can settle above its reservation; that is recorded, and later calls are refused.
- Non-ASCII text counts at its UTF-8 byte length, which is a true bound on those characters for byte-level tokenizers. ASCII text stays at chars/3.
- An image of unknown size counts at IMAGE_TOKENS_MAX.
- The Recommendation range is labelled as an estimate. The run-budget sentence becomes 'asks before starting a call whose estimated cost would take the run over its budget'.

1f. Ledger tail.
- Under the lock, if the file does not end in a newline, the partial tail is copied to ledger.jsonl.damaged-<yyyyMMddTHHmmssSSSZ>-<pid>. The name has no colons, which Windows rejects.
- The file is then truncated to the last newline, and the append continues the chain from the last valid entry.
- lastEntry() reads back to the last line that parses.
- verify() runs on demand from Settings, cached by file size and mtime.

1g. Single flight for the first recommendation.
- The web host keeps a Map<intakeId, Promise> beside its other services. There is one per process, on globalThis (services/index.ts:34-45), and only that process calls the advisor.
- Concurrent first renders share one advisor call. The entry is dropped when the call settles.

STAGE 2: a durable spend book as cap authority (L)

Contracts v6 (additive):
- spend.ts defines a SpendBook port with Promise-returning methods, which Store exposes as store.spendBook:
  - admit(AdmitRequest) returns an AdmitOutcome;
  - markSent(opId, owner) returns a boolean (compare-and-set from open to sent);
  - accept(opId, role: 'generation' | 'extract', providerJobId);
  - retain(opId, usd, workspaceCapUsd) returns ok or BudgetDetails;
  - release(opId), for an attempt that was definitely not billed;
  - abandon(opId), for one that may have been billed;
  - settle(opId, Settlement) returns { ledgerEntryId }, idempotently;
  - renew(opIds, owner, leaseMs);
  - absorb(LedgerBatch) returns { faults };
  - unledgered(limit);
  - markLedgered(opId, seq);
  - spend(workspaceId);
  - records(workspaceId), for Settings;
  - clearUncertain(workspaceId, opIds);
  - acknowledgeFault(id).
- AdmitRequest = { opId, operationKey?, owner, leaseMs, workspaceId, runId?, stepId?, purpose, kind, provider, model, reserveUsd, paid, caps: { workspaceUsd, runUsd? } }.
- AdmitOutcome = { admitted } | { budget: BudgetDetails } | { inFlight } | { resume: { opId, jobs } } | { fault: message }.
- LedgerBatch = { entries, unreadable: { offset }[], cursor: { offset, seq } }.
- SpendSummary gains inFlightUsd and uncertainUsd. spentUsd and byRun stay settled-only, so runs.cost_usd and settleLateCost (liveness.ts:106) are unchanged.
- BudgetDetails gains uncertainUsd?.
- LedgerEntry gains operationId? and priceBasis?.
- GatewayErrorCode gains 'in-flight' and 'accounting-fault'.
- GatewayOptions.spendBook is required, and Gateway gains close().

Store, migration 6:
- paid_operations(id PK, op_key UNIQUE NULL, released_key, workspace_id, run_id, step_id, purpose, kind, provider, model, reserved_usd, retained_usd DEFAULT 0, state CHECK IN (open, sent, accepted, settled, released, uncertain), provider_jobs_json, owner, lease_until, sent_at, settled_usd, price_basis, served_model, usage_json, request_sha256, response_sha256, ledger_entry_id, ledgered_seq, cleared_at, created_at, updated_at), indexed on (workspace_id, state) and (run_id, state).
- spend_faults(id, kind, detail, offset UNIQUE, created_at, acknowledged_at).
- spend_book_meta(ledger_cursor_offset, ledger_cursor_seq).
- src/spend-book.ts implements the port. Every method is one short writeTransaction (BEGIN IMMEDIATE), and no transaction spans a network call.

Exposure. A row is live while lease_until > now.
- Run cap: settled_usd of the run's settled rows, plus reserved_usd of the run's live open, sent and accepted rows.
- Workspace cap: all settled_usd, plus reserved_usd of live open, sent and accepted rows, plus reserved_usd of uncertain rows that have not been cleared, plus retained_usd that has not been cleared. An uncertain row is one in state uncertain, or one that was sent or accepted and is no longer live.
- An open row that is no longer live counts 0, because it was never sent.
- Uncertain amounts are deliberately not charged to the run cap.

admit(), in one transaction:
1. Refuse a paid call while an unacknowledged fault exists.
2. Sweep: an open row that is no longer live becomes released; a sent row that is no longer live becomes uncertain.
3. Resolve the operation key (stage 3).
4. Check both caps against exposure + reserveUsd. On refusal, return BudgetDetails with uncertainUsd.
5. Insert the row as open, with its owner and lease.

Per call, in the gateway:
1. Absorb new ledger lines (see below), then call admit.
2. Register the operation with the gateway's holder registry.
3. Just before the first provider request, call markSent. If the row was swept while the process slept, re-admit once.
4. After a 'maybe' failure of a synchronous call, retain(opId, the attempt's bound, workspace cap). If it fits, re-send once; otherwise fail with budget-exceeded at workspace scope.
5. On a final failure, release if every attempt was 'none', otherwise abandon.
6. On an answer, settle, with up to 4 tries and growing pauses. The ledger entry id is chosen at settle and returned as ledgerEntryId.
7. If settle still fails, the row stays counted at its bound, and the call fails with the existing non-retryable billed failure.
8. Drain the outbox (bounded, see below), then store the request and response bodies as today.

settle() accepts rows that are open, sent, accepted, uncertain or released; the true cost wins. On a row that is already settled it is a no-op.

Holder registry and leases:
- Each ModelGateway has an owner id and one unref'd timer. Every 15 s it renews, with a 60 s lease, each registered operation its caller still holds:
  - an unsettled row (open, sent or accepted) while neither operation.until nor operation.cancel has aborted;
  - a settled row while operation.until has not aborted. Cancellation is ignored here, because no provider work is left, only the memo save.
- An unkeyed call (the advisor in the web process) is held only while the call runs.
- The same tick drains the outbox when unledgered rows exist.
- Timer errors are caught.
- close() stops the timer. serve.ts stop and ServiceHost.close() call it before store.close().

Ledger reconciliation (absorb): one rule for import, repair and drain.
- When it runs: before every spend() and admit(), and inside every drain under the ledger lock.
- What it reads: the complete lines after the book's cursor. If the file is now shorter, for example after quarantine, it reads from 0.
- book.absorb applies them in one transaction:
  - An entry with an operationId: if its row exists, set ledgered_seq when it is unset, and settle the row from the entry if it is not yet settled (the entry's cost wins). If no row exists, insert it settled and ledgered.
  - An entry without an operationId (legacy, or appended by an older worker during contributor-mode skew): INSERT OR IGNORE a settled, ledgered row keyed 'ledger:<entry id>'.
  - A complete line that does not parse: a spend_fault keyed by its byte offset, so it is recorded once.
  - The cursor advances to the furthest point seen.
- Every line is reconciled where it is read, so the cursor is only a read optimisation. Re-reading never double counts, and an entry that an import passed over is already marked ledgered.
- Settings and Recommendation therefore show legacy spend before any call. Restarts change nothing, and an older worker's appends are picked up.
- A fault refuses paid admission with 'accounting-fault' until it is acknowledged in Settings. $0 demo calls are not blocked.
- A partial legacy tail that was set aside is shown as a note that does not block anything.

Outbox drain:
- It runs under the ledger lock. It first absorbs the new lines, then appends each settled row that has no ledgered_seq, in settled order, with its pre-chosen entry id and operationId, then calls markLedgered.
- A crash after an append but before its mark, two drainers at once, or an import that runs before the next drain therefore never duplicate an entry.
- On the call path the drain waits at most 2 s for the lock (append's lockTimeoutMs). If it cannot get the lock, the timer tick drains later.
- A failed or skipped drain never fails the call. Settings shows 'N calls not yet in the audit file'.

Durability:
- admit, markSent, accept and settle commit with PRAGMA synchronous=FULL. It is set before BEGIN and reset after COMMIT on the store connection; node:sqlite transactions are synchronous, so nothing interleaves.
- JSONL appends stay unsynced, and absorb and the drain repair them from the book.

Settings 'Spending records' panel:
- in-flight amounts, and amounts that may have been billed, with a Clear action;
- faults, with Acknowledge;
- calls priced on an 'assumed' basis;
- 'Check the audit file': verify() plus a cross-check that every ledgered settled row has an entry with the same cost.
- 'Left' in SettingsView and history.ts is computed as cap minus (spent + in flight + may have been billed).

Composition:
- create.ts and serve.ts pass store.spendBook. A composition test fails if a root omits it.
- Tests use an in-memory SpendBook that passes the same contract suite.

STAGE 3: operation identity across retries (M)

- SpendContext gains operation?: { key, until: AbortSignal, cancel?: AbortSignal }.
- Invocation (liveness.ts) gains `done`, an AbortSignal that stop() aborts. The activity wrapper already calls stop() in its finally (activities/index.ts:42).
- The wrapper passes memoGateway cancel = ctx.cancellationSignal and until = done. ctx.cancellationSignal aborts when Temporal cancels the attempt, including TIMED_OUT and NOT_FOUND, which arrive in a heartbeat reply within about 2 s.
- memoGateway passes operation.key = runId + '/' + memoKey. The key is built after hashing, so memo keys are unchanged.

Key resolution in admit():
- If the key is held by a live row in any state, including settled, return in-flight.
- If the latest row has expired and is open: release it, and insert a new row.
- If expired and sent: mark it uncertain, and insert a new row.
- If expired and accepted: transfer the owner and lease, and return resume with the stored generation and extract job ids.
- If expired and settled (the owner process died before the memo was kept): free the key, and insert a new row. This is a counted re-buy, the named residual.

In-flight wait in memo.ts:
- Poll getMemo every 2 s, and return the memo on a hit.
- Call the gateway again every 10 s.
- Honour the invocation's own signals.
- After 5 minutes, fail with a plain StepError.

fal resume:
- ProviderVideoRequest.onAccepted(role, requestId) awaits book.accept before polling. If accept fails, the failure is logged and polling continues; the row stays counted at its bound, and only resumability is lost.
- ProviderVideoRequest.resume { generation?, extract? } skips the jobs that were already submitted and polls their stored ids.

P3, separable (may ship on its own):
- Run-start identity: the client mints a UUID once per Start action, and the server validates its format before using it as the run id, workflow id and memo scope.
- createRun returns the existing run when the workspace and intake match, and 409 otherwise.
- A WorkflowExecutionAlreadyStarted error for workflowIdFor(id) counts as success.


**Steps**
1. Stage 1 (each fix test-first):
2. 1. Billing classification: a table test of billingOf. An undici TypeError('fetch failed') with an ECONNRESET cause gives maybe and retryable. ECONNREFUSED gives none. 429, 500 and 503 with a provider body, 529, and the overloaded_error and api_error stream events give none. 408, 502, 504, a 5xx with a bare HTML body, and a stream that ended without message_stop give maybe. Then implement billingOf and derive retryability from it in toGatewayError.
3. 2. fal submit: tests with a fake fetch. A 503 with fal's error body is re-sent with backoff and ends in 1 accepted job. A 502, or a reset after the request was written, gives exactly 1 submission and a non-retryable 'may have been accepted' error. extract-frame goes through the same submit. Then add the REST submit in runJob, and fix the comments at fal.ts:69 and in retry.ts.
4. 3. Fallbacks off: tests. By default, no Anthropic request from the composed gateway or the adapter carries 'fallbacks' or the server-side-fallback beta. A refusal is ledgered once, and the call fails with 'refused' naming its category. A C2 12-way seed stage at its suggested $1.50 admits 9 of 12 concurrently, as today. Then remove GatewayOptions.anthropicRefusalFallback, flip the adapter default, and update the comments in anthropic.ts and prices.ts.
5. 4. Pricing and estimates: tests. gpt-6.1-sol-2026-09-30 and a -001 Gemini version are priced at the requested row, unflagged. claude-opus-5-5 served for a claude-opus-5 request resolves to its own row, not to the snapshot rule. An unknown id is flagged priceBasis 'assumed'. 3000 CJK characters estimate at 9000 tokens or more. A WebP of unknown size estimates at 6400. Then implement, and update the estimate.ts header, the spec 3.4 note and the two UI sentences.
6. 5. Ledger tail: tests with a torn tail. The next call succeeds, the bytes are kept under a name without colons, the chain continues, and verify() is clean. Then implement the quarantine, a tolerant lastEntry and the cached on-demand verify.
7. 6. Recommendation single flight: a test where two concurrent first loads of one intake produce 1 advisor.intake ledger entry. Then add the per-host map.
8. Stage 2:
9. 7. Contracts v6: write the SpendBook contract suite first. It covers admit, cap refusal, the exposure rule (uncertain rows count against the workspace only), the sweep, markSent compare-and-set, retain, release, abandon, idempotent settle from every state, lease expiry with an injected clock, absorb (legacy rows, rows marked by operationId, a missing row inserted from its entry, a fault recorded once per offset, re-absorbing from 0 changes nothing), the outbox, faults, clear and acknowledge. Then add the types.
10. 8. Store migration 6 and spend-book.ts: run the suite against two node:sqlite connections on one file, plus a test where two child processes admit against one remaining budget.
11. 9. Gateway admission rework. Failing tests first:
- two ModelGateway instances on one store respect one cap;
- a row admitted but never sent is released after its owner dies;
- a sent row whose owner dies counts as uncertain against the workspace and not the run;
- with the ledger lock held during settlement, the call returns within about 2 s with its result, and the next drain writes the entry whose id equals the result's ledgerEntryId;
- an append followed by a crash before markLedgered, then a restart where spend() (absorb) runs before the drain, leaves exactly one entry for the operation, and the row is ledgered.
Then replace reserve() and reservations with the book, and add the holder registry, renewal, close(), absorb and the bounded drain.
12. 10. Legacy import, through absorb: tests.
- After an upgrade over an existing ledger, spend() equals the legacy sum before any call.
- Two restarts leave spend unchanged.
- Web and worker absorbing at the same time leave one row per entry.
- A corrupt line in the middle refuses paid admission with accounting-fault; demo calls proceed; Acknowledge clears it.
Then implement.
13. 11. 'maybe' handling for synchronous calls: a test where a completion stream is reset after the 200 and the call then succeeds. The attempt's bound is retained on the workspace, the run cap is untouched, and the call is re-sent once; a second 'maybe' fails plainly. Then wire retain and abandon into the retry loop.
14. 12. The Settings panel, the meter fields and the new spend() fields. Then wire create.ts and serve.ts, with a composition test that fails if a root omits spendBook.
15. Stage 3:
16. 13. Runner tests with the real store.
- Two overlapping memoGateway attempts on one scope. The owner is blocked between settle and setMemo, and its cancel signal is aborted with TIMED_OUT. Exactly 1 provider call, and attempt 2 returns the memo once the owner saves it.
- Attempt 1 hangs in its provider call past its timeout in a live process (cancel aborted). Attempt 2 proceeds within one lease period for text, or resumes for fal with 0 new submissions and 1 ledger entry.
Then add SpendContext.operation, Invocation.done, the renewal rule, key resolution, the in-flight wait, and fal onAccepted and resume.
17. 14. Extend the runner harness that runs the demo with fakes. Kill the worker during a relay link; stop and restart the worker during a C2 seed stage at its suggested budget.
18. 15. ADR-0081, the spec 3.3 and 3.4 notes, the README data table, and backlog rows for everything under notDoing. Add a test asserting that the workflow bundle hash is unchanged, then run the full gateway, store, runner and web suites and the e2e.
19. P3 (separable): 16. Tests: a POST start repeated with the same client UUID gives 1 run and 1 workflow; a different workspace or intake gives 409; a malformed id gives 400. Then implement.


**Acceptance tests**
- Two processes, one data dir, workspace cap $0.15, each attempting a $0.10 call at the same moment: exactly one provider call is made. The other gets budget-exceeded with reservedUsd 0.10, and spend afterwards is 0.10. (Today both dispatch, for $0.20.)
- Stop the worker during a C2 seed stage run at its suggested $1.50 budget, then restart it. The run continues without a budget question. Calls admitted but never sent count $0. Each interrupted call that was dispatched counts its single-attempt bound against the workspace only, shown in Settings as 'may have been billed'. Clear removes it.
- An overlapping memoGateway attempt on the same key, while the first owner is blocked between settlement and setMemo and its cancellation signal has been aborted with TIMED_OUT: 1 provider call, 1 ledger entry, and both attempts return the same answer.
- Attempt 1 hangs in its provider call past its startToClose in a live worker (cancellationSignal aborted with TIMED_OUT). Attempt 2 dispatches within one lease period, and attempt 1's row is uncertain at workspace scope. For fal, attempt 2 resumes the stored request ids, with 0 new submissions and 1 ledger entry.
- A fal submit that is accepted and then reset: exactly 1 submission, the call fails non-retryably, and spend counts the clip as may have been billed. (Today the SDK re-submits.)
- A fal submit answered with 503 and fal's error body is re-sent with backoff and ends in 1 accepted job. A 502 or 504 is not re-sent. The extract-frame job takes the same path.
- A ledger that ends in a torn partial line: the next paid call succeeds and is counted. The bytes are kept in ledger.jsonl.damaged-<stamp without colons>-<pid>, and later appends keep working. (Today every later call is billed, then fails and goes uncounted.)
- The ledger lock is held past 2 s during settlement: the call returns its result, and spend includes it. The next drain writes the entry with the same id as the result's ledgerEntryId.
- A crash after the outbox append but before markLedgered, followed by a restart where an import (spend()) runs before the next drain: exactly one ledger entry for that operation, and the row is marked ledgered.
- After upgrading over an existing ledger, Settings shows the legacy spend before any new call, and two restarts leave it unchanged. A corrupt line in the middle refuses paid calls with accounting-fault until acknowledged, while demo calls proceed.
- No Anthropic request carries 'fallbacks' or the server-side-fallback beta header. A classifier refusal is ledgered once at its true cost, the step fails with 'refused' naming the category, and settled spend never includes a second model's attempt. (Today a routed refusal can settle at up to about 2x-2.25x its reservation; the review's probe cases settled over the cap.)
- A C2 12-way seed stage at its suggested budget admits at least as many seeds concurrently as today (9 of 12).
- A dated or versioned served id is priced at its requested row, unflagged. claude-opus-5-5 is never priced as a snapshot of another id. An unknown served id is priced at the requested row, flagged priceBasis 'assumed', and shown in Settings.
- A completion stream reset after the 200 that then succeeds: spend equals the actual cost plus the first attempt's bound, retained at workspace scope only. The run-cap check is unchanged.
- 3000 CJK characters estimate at 9000 tokens or more, and a WebP of unknown size at 6400.
- The workflow bundle hash is unchanged by the whole change.
- Gateway.close() stops lease renewal and draining, and no timer fires after store.close().
- (P3) Two concurrent first recommendation loads of one intake give 1 advisor.intake ledger entry. Two POST starts with the same client UUID give 1 run and 1 workflow.


**Compatibility.** Temporal: nothing changes in workflow code, activity input or output shapes, or recipes.
- A test asserts that the bundle hash is unchanged, so persisted histories still replay (ADR-0078).
- Invocation.done and SpendContext.operation live only in activity code.
- The new 'accounting-fault' and the in-flight-wait timeout surface through the existing StepFailed type. A run in flight at upgrade over a damaged legacy ledger therefore ends plainly; ADR-0081 says so.

Store: migration 6 is additive and checksum-tracked, and older builds refuse the newer database, as today. Absorb is idempotent, keyed by operation id or entry id. It covers legacy entries, entries an older worker appends during contributor-mode skew, and a crash between an append and its mark.

Ledger JSONL:
- New entries carry the optional operationId and priceBasis, both covered by the canonical hash. Old entries verify unchanged.
- Torn tails are set aside as new sibling files.
- The file name, location and chain are kept.

Contracts: all additions are optional, with two exceptions. GatewayOptions.spendBook is required, so no production root can keep per-process reservations. Gateway.close() is new. apps/web model-errors.ts needs the two new error codes.

Gateway package: GatewayOptions.anthropicRefusalFallback is removed. No production code sets it; only an adapter test sets the adapter option.

Research: the protocol's 'server-side fallbacks are off' now holds by default for the shared engine.

Demo: rows are written at $0, and faults block only paid calls.

Behaviour users can notice:
- A classifier refusal is no longer retried on another model. The step fails, or the recommendation shows the existing 'declined' message, and the failure names the category. Anthropic recommends the opposite default; ADR-0081 records why byway departs from it, and the person can reverse that decision through the backlog path.
- Settings shows in-flight amounts and amounts that may have been billed, with Clear.
- A stop during a run leaves the interrupted calls' bounds as 'may have been billed', against the workspace budget only.
- A billed call whose audit write failed or was delayed no longer fails its step.
- An ambiguous fal submit stops the link instead of silently buying a second clip.

**ADR.** Yes: a new ADR-0081, 'Paid calls have a durable spend book'.

It does not edit earlier ADRs. It supersedes the spec 3.3 'Spend authority' sentence and ADR-0079's 'Workspace spend comes from the ledger (ENG-4)' wording. It narrows ADR-0079's 'Retries never buy the same thing twice' and ADR-0080 so that they name the residual window.

It records:
- The book in byway.sqlite is the cap authority. ledger.jsonl is its hash-chained audit record, filled through an idempotent outbox and reconciled by one idempotent absorb step.
- The exposure rule, including that uncertain amounts count against the workspace cap only, until the person clears them.
- Leases on each operation, tied to the caller's Temporal liveness. A settled operation is held until its invocation ends, even after cancellation.
- One billing classification. Synchronous calls are re-sent once after a 'maybe' failure; fal jobs never are.
- Server-side refusal fallbacks are off product-wide. No ADR covered turning them on. Each dispatch bills the model it was admitted for, and there is no sticky routing. This departs from Anthropic's recommendation to opt in so that classifier false positives do not become outages. The reasons:
  - spend-cap integrity without halving concurrency;
  - one engine for product and study;
  - no routing table owned by byway, which Anthropic advises against and which is partly unpublished.
  - The way back is recorded too: server-side 'default', with admission at the stream's switch point.
- The estimate contract, with its residuals named: settlement can exceed a cap by the estimate error of calls in flight; gpt-image's output figure is a bound only for planning; Gemini image thinking tokens are not yet verified.
- The remaining residuals:
  - A caller process that dies between settlement and the memo save re-buys once after its lease expires, and the re-buy is counted.
  - A waiting attempt gives up after 5 minutes with a plain message if the owner is still alive but stuck.
  - accounting-fault surfaces as StepFailed.


**Deliberately not doing**
- No reconciliation workflow. Uncertain operations count conservatively against the workspace cap until the person clears them with one Settings action.
- No background reconciliation of orphaned fal jobs against fal's API. A job is resumed only when the same operation is retried.
- Paid-call results stay in the runner memo and do not move into the book. The residual is a counted re-buy when the owner process dies between settlement and the memo save.
- No replacement of ledger.jsonl or its hash chain, and no anchoring of the chain's head outside the data directory.
- No provider token counting (for example Anthropic count_tokens). Estimates stay estimates by contract, and gpt-image's 8000-token output figure stays a named planning number.
- No refusal rescue: no Anthropic server-side fallbacks, no client-side routing table owned by byway, and no fallback-credit beta. If the person wants rescue back, the backlog path is server-side fallbacks: "default" with the fallback attempt admitted at the stream's switch point (a message_start naming another model, or a fallback content block), with the stream aborted when that attempt does not fit. Never a byway-owned table.
- No change to any other provider's fallback behaviour. OpenRouter stays pinned with allow_fallbacks false.
- Uncertain exposure is not charged to run caps. This is a deliberate decision, recorded in ADR-0081.
- No leases or locks beyond SQLite row leases, and no multi-tenant or distributed machinery.
- Calls already in flight are not cancelled. That stays the backlog item 'Cancel stops calls already in flight', which can reuse SpendContext.operation.cancel.
- Gemini image thinking tokens are not added to pricing. The image path ignores thoughtsTokenCount (google.ts:91), unlike completions (google.ts:58). A backlog row will verify billing before the price row changes.
- No claim column and no client POST for the recommendation. A single in-process call per intake is enough for one web process.


**How it resolves each finding**
- **F03:** The spend book settles F03 at its root.

Cross-process race: admission is one BEGIN IMMEDIATE transaction over rows both processes share, so web and worker see each other's in-flight exposure.

Crash, stop and timeout orphans:
- An unsettled operation's lease is renewed only while its caller's invocation is alive and not cancelled.
- A row that was never sent is released.
- A row that was sent becomes uncertain. It counts at its single-attempt bound against the workspace cap only, until it is cleared, so restarts do not raise run-budget questions.

Accepted fal job lost:
- Every queue job is submitted once over REST, so neither the SDK's hard-coded QUEUE_RETRY_CONFIG nor the gateway can re-send it.
- An ambiguous submit is counted and not re-sent.
- The request ids are recorded with book.accept() before polling, and a retried operation resumes them.

Memo race: the operation key is held from admission until the caller's invocation ends.
- A settled operation stays held through the bounded drain, the body puts and the memo save, even after Temporal has timed the attempt out.
- An overlapping attempt waits for the memo.
- A dead owner's operation is taken over within one lease period.
- A stuck owner's waiter gives up after 5 minutes with a plain message.

Damaged accounting:
- The book, not the lenient JSONL, is the cap authority.
- A torn tail is set aside under a name Windows accepts.
- One idempotent absorb step reconciles every ledger line into the book, and the outbox appends only rows that absorb has not seen. A crash, two drainers, or an import before a drain never duplicates an entry.
- A failed or delayed append no longer drops spend or fails the call.
- Complete lines that do not parse raise a fault, which blocks paid admission until acknowledged.
- verify() runs on demand, with a cross-check against the book.

Retry decisions: one billingOf() classification decides retries everywhere, which also fixes wrapped resets being classed non-retryable.

UI command identity (P3):
- A single in-process call per intake removes the duplicate recommendation spend.
- Run-start identity is a separable step using a validated client UUID.

Residual, named in ADR-0081: a counted re-buy if the owner process dies between settlement and the memo save.
- **F04:** Settled at the same admission boundary, by making every dispatch bill exactly the model it was admitted for.

Fallback:
- Anthropic requests no longer carry server-side fallbacks, and the gateway option is removed. Reservations stay at today's single-attempt size, so concurrency does not drop.
- Sticky routing disappears with the fallbacks.
- A classifier refusal is ledgered at its true cost and fails plainly with its category, as unrouted refusals already do.
- byway owns no routing table. This departs from Anthropic's opt-in recommendation, is recorded in ADR-0081 with a way back, and matches the research protocol.

Unknown served model:
- Dated or versioned snapshots, matched by narrow suffix rules so claude-opus-5-5 never collides with claude-opus-5, resolve to the requested row.
- A genuinely unknown id is priced at the requested row and flagged priceBasis 'assumed', in the ledger and in Settings.
- Known models are never priced above their own row.

Estimates:
- The wrong assumption that heuristic estimates are bounds is removed: estimate.ts, spec 3.4 and the two UI sentences now say they are planning estimates.
- Non-ASCII text is counted at its UTF-8 bytes, a true bound on those characters for byte-level tokenizers.
- Images of unknown size count at the 6400-token maximum.
- A settlement above its reservation is recorded at its true cost, and later admission refuses.
- The input-estimate overshoot and the gpt-image output figure remain named residuals in ADR-0081, so this sub-part is fixed by contract rather than by proof.

The refuted parts need no change.


**Changes forced by the adversarial rounds (last round)**
- Final check, mustFix 1 (BLOCKING: the client-side fallback routing table contradicts Anthropic's documented routing): ACCEPTED, and verified against the claude-api skill's shared/model-migration.md.
- Sonnet 5.5 'Safeguards and fallback': default retries only cyber and frontier_llm declines, on claude-sonnet-5, and never bio, reasoning_extraction or general_harms.
- Opus 5.5: reasoning_extraction is never retried, and the targets come from allowed_fallback_models.
- Fable 5.1: the targets are claude-opus-4-8 and claude-opus-5, the routing is unpublished, and some categories have no fallback.
- Anthropic: 'Prefer "default" over pinning a model'.
My table was wrong for two of the three product models and cannot be known for the third, and my claim that it 'keeps today's product behaviour' was false.

Change: I took the critic's option (a), which critic 2 had also offered in round 1. Server-side fallbacks are off product-wide: GatewayOptions.anthropicRefusalFallback is removed (no production root sets it; only providers.test.ts:146 sets the adapter option), and the adapter's default becomes false. There is no client routing table, no '#fallback' operation key, and no budget question for a near-cap refusal. Refusals fail plainly with their category, as unrouted categories already do (anthropic.ts:116, model-errors.ts:30).

This also removes sticky routing, a second instance of the same wrong assumption that I had missed. ADR-0081 records the departure from Anthropic's opt-in recommendation; notDoing names the way back (server-side 'default' with admission at the stream's switch point). Option C's cons now state the lost rescue honestly.

I rejected option (b), documented routes only, because byway would then own a table Anthropic advises against owning, one that is unpublished for Fable 5.1 and only partly published for Opus 5.5, and it would need a claude-sonnet-5 price row.

I also corrected F04's figures. A routed refusal can settle at up to about 2x its reservation on Sonnet 5.5, 2.25x on Opus 5.5 and 1.5x on Fable 5.1, not 2.5x. A declined attempt is billed mid-stream, and before any output only depending on its category, not always.
- Final check, mustFix 2 (the outbox and the legacy import share ledger_seen_seq, so a crash can duplicate an audit entry): ACCEPTED. The scenario holds against my previous wording: an import that skipped operationId entries but advanced the cursor hid the drain's own earlier append.

Change: one idempotent book.absorb(batch) replaces importLegacy. It reconciles every line it reads:
- an entry with an operationId marks its row ledgered, settling it from the entry if needed, or inserts the row if it is missing;
- a legacy entry is inserted with INSERT OR IGNORE;
- an unparseable line becomes a fault keyed by its byte offset.
Absorb runs before spend() and admit(), and inside every drain under the ledger lock before anything is appended. The cursor is now only a read optimisation, and re-reading from 0 is safe.

Added a test and an acceptance test: append, crash before markLedgered, restart with spend() running before the drain, then exactly one entry for the operation.
- Final check, mustFix 3 (the window between settlement and the memo save is wider than named, and the overlap test does not reproduce production): ACCEPTED. I verified that heartbeats run every 1 s (liveness.ts:22, 43-50), so a TIMED_OUT cancellation arrives within about 2 s. Under my previous `held` signal, renewal of a settled row therefore stopped while the memo save could still take about 45 s (memo.ts:58-63), plus the body puts and a drain with no wait limit.

Changes:
- SpendContext.operation now carries two signals: until (Invocation.done, which stop() aborts in the wrapper's finally at activities/index.ts:42) and cancel (ctx.cancellationSignal). An unsettled row is renewed while neither has aborted; a settled row is renewed until `until`, ignoring cancellation.
- The drain on the call path waits at most 2 s for the ledger lock, and the gateway's timer tick drains anything left over.
- The overlap test now aborts attempt 1's cancel signal with TIMED_OUT while attempt 1 is blocked between settle and setMemo.
- The ADR names the residual as the owner process dying, plus a 5-minute waiter cap when a live owner is stuck.
- Final check (incidental, prefix collision in served-model resolution): ADOPTED from the same guide, which warns that claude-opus-5-5 starts with claude-opus-5. The snapshot rule now accepts only date, three-digit or '@' suffixes, and a served model's own price row is checked first. Added a test.
- Critic 1, mustFix (key freed when settled while the memo is still unsaved): ACCEPTED in round 1 and strengthened in this round. A key is held by a live row in any state, and a settled row now stays live until its invocation ends, even after cancellation. Verified window: memo.ts:85-103, gateway.ts:91 and 575-578, gateway.ts:583-584, memo.ts:58-63.
- Critic 1, mustFix (per-owner leases trap later attempts behind a live process): ACCEPTED in round 1. Leases are per operation, and an unsettled operation stops renewing when Temporal cancels it, including TIMED_OUT and NOT_FOUND (ctx.cancellationSignal, liveness.ts:36-51). Tests: attempt 2 proceeds (text) or resumes (fal) within one lease period.
- Critic 1 and Critic 2, mustFix (phantom spend after normal stops, and rows admitted but never sent): ACCEPTED in round 1. Verified: worker.ts:33-36 and 82-83, gateway.ts:197-203.
- markSent is a compare-and-set, so a row that was never sent is released.
- Uncertain rows count at their single-attempt bound against the workspace only.
- One Clear action in Settings.
- BudgetDetails gains uncertainUsd.
- spentUsd and byRun stay settled-only.
- C2 stop-and-restart acceptance test.
- Critic 2, mustFix (plan-sized reservations crowd concurrent stages): ACCEPTED. In round 1 I dropped plan.ts but replaced it with a client-side fallback. This round adopts the critic's own option 2, fallbacks off, which the final check showed to be the correct form. Reservations stay at today's size, and a test asserts that C2 still admits 9 of 12.
- Critic 1 and Critic 2, mustFix (one billing classification, the fal 503 contradiction, extract-frame still on the SDK submit): ACCEPTED in round 1, and unchanged. I re-ran Critic 1's classify probe from my scratch folder (undici reset gives retryable=false; 502/503/504 give true) and verified QUEUE_RETRY_CONFIG in @fal-ai/client 1.10.1 (queue.js:33-38, 66; request.js:35). There is one billingOf(), and every fal queue job goes through one REST submit.
I keep two departures from Critic 1's list: a 500 or 503 that carries a provider error body is 'none', and synchronous calls are re-sent once after 'maybe' while fal jobs never are.
- Critic 1, mustFix ('yes' for F04 was overstated because the estimator is still a heuristic): ACCEPTED in round 1. The wrong assumption is named as 'heuristic estimates treated as bounds' and removed by contract (estimate.ts header, spec 3.4, the two UI sentences). Non-ASCII text is counted at its UTF-8 bytes and images of unknown size at 6400. The input-estimate error and the gpt-image output figure are named residuals.
- Critic 2, mustFix (backfill timing and double counting): ACCEPTED in round 1. This round folds it into absorb, which runs before every spend() and admit(), reads incrementally, and is idempotent by operation id or entry id. Tests: spend is correct before any call after an upgrade, two restarts change nothing, and concurrent absorbs from web and worker leave one row per entry.
- Critic 1, verdict challenge F03 (3)(a): ACCEPTED in round 1. The gateway's withRetries re-submits only on 429 and 5xx after the SDK's own 3 retries, and not after undici resets, which only the SDK retries. 502 and 504 are the ambiguous statuses.
- Critic 1, verdict challenge F03 (torn-tail realism): ACCEPTED in round 1. A torn tail needs an OS crash, power loss or a full disk, not a process kill (ledger.ts:136). Severity stays P2. The book's money transactions commit with synchronous=FULL, set before BEGIN and reset after COMMIT. That is safe because node:sqlite transactions are synchronous (db.ts:66-78), and SQLite refuses a change to the safety level inside a transaction.
- Critic 1 and Critic 2, shouldConsider (max(own, bound) over-records): ACCEPTED in round 1. Known served models are priced at their own row, snapshots resolve to the requested row, and only genuinely unknown ids are flagged 'assumed'.
- Critic 1 and Critic 2, shouldConsider (outbox idempotency and ledgerEntryId): ACCEPTED. The entry id is chosen at settle and returned as ledgerEntryId. Duplicate safety now rests on absorb under the lock (final-check fix), not on a cursor.
- Critic 1, shouldConsider (accept or settle failing after the provider answered): ACCEPTED in round 1. A failed accept is logged and polling continues, so only resumability is lost. A failed settle is tried 4 times, then the row stays counted and the call fails with the existing non-retryable billed failure.
- Critic 1, shouldConsider (sequencing): ACCEPTED. Stage 1 comes first and needs no book: classification, fal submit, fallbacks off, pricing, estimates, ledger tail and the recommendation single flight.
- Critic 1, shouldConsider (near-cap refusal should become a budget question): now MOOT. With no fallback attempt there is no fallback plan to admit, and a refusal fails plainly whatever the cap.
- Critic 1, shouldConsider (fault UI only for legacy data; contributor-mode skew): PARTLY, unchanged. Acknowledge stays, because any complete but unparseable line from an external edit or a disk fault needs a fail-closed way out. Skew is covered because absorb is incremental and runs before every spend read.
- Critic 1, shouldConsider (Gemini image thinking tokens): NOTED. Verified that google.ts:58 counts thinking tokens for completions while :91 ignores them for images. It is a backlog row in notDoing.
- Critic 1, shouldConsider (verify cross-check of book against ledger): ACCEPTED, as part of the on-demand 'Check the audit file' in Settings.
- Critic 2, shouldConsider (Windows quarantine name): ACCEPTED. The file is named ledger.jsonl.damaged-<yyyyMMddTHHmmssSSSZ>-<pid>, and a failed quarantine copy can no longer fail a paid call once the book is the authority.
- Critic 2, shouldConsider (late transitions after Windows sleep): ACCEPTED. markSent is a compare-and-set with one re-admit. settle() is idempotent from every state, and the true cost wins. Two pollers on one resumed fal job settle once.
- Critic 2, shouldConsider (gateway lifecycle and timers): ACCEPTED. Gateway.close() stops the renewal and drain timer and is called before store.close() in serve.ts stop and in ServiceHost.close(). Errors in the tick are caught.
- Critic 2, shouldConsider (bound the in-flight wait): ACCEPTED. The wait is capped at 5 minutes with a plain StepError, and normally ends within one lease period or when the owner saves its memo.
- Critic 2, shouldConsider (two fal jobs per clip): ACCEPTED. provider_jobs_json stores the generation and extract ids by role, and a resume skips jobs that were already submitted.
- Critic 2, shouldConsider (AND the per-call fallback flag with the research pin): MOOT. There is no fallback flag at all now. The shared engine meets the protocol's 'server-side fallbacks are off' by default.
- Critic 2, shouldConsider (workflow replay): ACCEPTED. No FAILURE type is added, accounting-fault and the wait timeout use StepFailed, a test asserts the bundle hash is unchanged, and the ADR says that runs in flight end plainly on a damaged legacy ledger.
- Critic 2, shouldConsider (split and simplify the P3 work): ACCEPTED. One in-process call per intake on the web host (globalThis, services/index.ts:34-45), and run-start identity as a separable step with a validated client UUID and an insert-or-return createRun.
- Critic 2, shouldConsider (effort is XL): PARTLY. With plan.ts, the bound pricing, the client fallback table, the claim column and the POST all cut, I rate the remaining scope L (staged M, then L, then M) and say in the cons that it is the upper end of L.
- Critic 2, shouldConsider (cost of verify() on every render): ACCEPTED. It runs on demand, cached by file size and mtime.
- Critic 1 and Critic 2, shouldConsider (keep spentUsd and byRun settled-only): ACCEPTED. In-flight and uncertain amounts get their own fields, and 'left' is cap minus (spent + in flight + may have been billed).


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- Takeover race when an operation settles close to its lease expiry. After a TIMED_OUT cancel, renewal of an unsettled row stops. If the call settles within the last 15 s of the remaining lease, the next 15 s tick can arrive after expiry, and attempt 2's 10 s gateway re-call can land in that gap. Attempt 2 then sees 'expired and settled', frees the key and buys the call again while the owner is still alive and about to save its memo.
- Key resolution is underspecified. admit() runs the sweep (step 2) before key resolution (step 3), so an expired 'sent' row has already become 'uncertain', and an expired 'open' row 'released', before the listed rules look at them. The rules also never cover 'uncertain' rows (including rows abandon() marked while their owner was alive) or 'released' rows that still hold op_key. Implemented literally, the new insert collides with the UNIQUE op_key.
- Held keys stay held for up to 60 s after the invocation ends, because 'until' only stops renewal and the lease then runs out. This delays any re-run of the same step call after a failure that followed settlement, for example a rerun after a workspace budget question or a refusal.
- The claim that absorb and the drain repair the JSONL from the book is overstated after an OS crash. markLedgered is not committed at synchronous=FULL and JSONL appends are not synced, so a crash can keep the 'ledgered' mark while losing the line. Absorb then rereads from 0 but never clears stale ledgered_seq values, so the entry is never appended again. Only the on-demand cross-check reports it.
- The outbox drain holds the ledger lock for absorb plus a batch of appends, and the lock is broken as stale after 30 s by mtime, which is not refreshed while it is held (ledger.ts staleLockMs). A long hold, such as the first absorb of a large legacy ledger or a big backlog, could be broken into, giving two concurrent drainers and a forked chain.
- billingOf() treats as 'none' (definitely not billed) both a mid-stream provider error event after partial output (overloaded_error or api_error) and a 500 or 503 that carries a provider error body. Neither is backed by verified provider billing documentation. The design also keeps two departures from critic 1's list.
- Behaviour changes that are not fully stated. (a) Counting non-ASCII text at its UTF-8 byte length roughly triples reservation input for CJK briefs (3 bytes per character instead of chars/3), so concurrency for non-Latin briefs drops below today's (about 8 of 12 C2 seeds instead of 9 for a 2000-character Japanese brief). The 9-of-12 acceptance test uses ASCII. (b) If an overlapping attempt is already waiting when the timed-out owner fails all 4 memo-save tries, it buys the call again after the lease expires. That contradicts ENG-3's 'fail rather than pay again'.
- The effort estimate is optimistic. Stage 1 (M), stage 2 (L) and stage 3 (M), with the book, leases, absorb and outbox, fal REST submit and resume, the Settings panel and the P3 work, is closer to XL than to 'upper L'.


## Cluster C: Artifact viewer consent and evidence completeness

**Root cause.** In both findings, an artifact representation built for one viewing context is reused in a stricter one, and the boundary that produces it cannot carry the property the stricter context needs:
1. The artifact route's response is the scriptable one built for a consented frame. Consent is not part of the response, so every top-level navigation gets scripts. The app's frames were also never limited in where they may navigate.
2. The run-screen ArtifactInfo carries a byte prefix under the name 'text', with no completeness flag. Decision views show it as whole, and row summaries count from it.
3. The lineup card's capacity is estimated, clipped silently and never reported. In cards form the card is the only channel for words.

The fix is a shared principle applied at three boundaries (route response, ArtifactInfo contract, card renderer and lineup), not a shared module. Each boundary states its context property (consented or inert, excerpt or whole, fitted or cut), so no consumer can mistake one context's representation for another's. No common abstraction is warranted.


### F05: Full-size HTML serves a more permissive execution policy than its preview

- **Verdict:** ACCEPT · **Severity:** P2 (review: P1) · **Label:** security / consent-boundary bypass (generated HTML opened full size)

**Rationale.** Every claim holds at b33f1285. pageCsp always ends in 'sandbox allow-scripts', with script-src 'unsafe-inline' plus the CDNs (apps/web/src/server/artifacts.ts:26-40). It is sent on every text/html response (artifacts.ts:65) with a one-year immutable cache (artifacts.ts:70). artifactResponse never varies it per request, and route.ts passes no request metadata. Consent lives only in the iframe attribute: frameSandbox (view/pages.ts:10), ScaledPage.tsx:46 and PageResult.tsx:33.

Seven in-app paths open the raw URL top-level:
- the four Open links: StepDetail.tsx:55, PickPanel.tsx:107, References.tsx:25, and ResultView.tsx:107 ('Open in a new tab', right beside the 'Scripts are off' note; the review omits this one)
- the ArtifactPreview.tsx:55 fallback 'Open {title}', used when the info is missing or the type unknown, so it can be a page
- the results.tsx:28 clip fallback
- model-written Markdown links (Markdown.tsx:18)

ADR-0080 says 'Generated pages run no scripts by default', so this breaks a documented guarantee; it is not an accepted trade-off. Both verifiers reproduced the leak on a production build. A page with no JavaScript also leaks through meta refresh, because the allow-scripts token re-enables automatic features. The Chromium prototype (design-C/gate-probe.mts) confirmed the repair boundary.

A new probe (revise-C-r1/frame-src-probe.mts) adds one finding: the app CSP has no frame-src. So even inside byway, one click on a model-written link in a scripts-off frame carries its URL off-site, and so does a consented frame's script navigating itself. The verifiers disagree only on severity.

**Severity rationale.** P2, placed at the top of the P2 order and fixed first among the P2s, as Change 1.

Why not P1:
- Exploitation needs hostile active content in a generated page. That comes from prompt injection in pasted material, a misbehaving model, or a bad CDN package; C1 takes no user examples.
- It needs a deliberate click.
- Only that one document's text, plus IP and timing, leaves. The opaque origin, connect-src 'none' and the media route keep cookies, the API, keys and other artifacts out of reach.
- The review rates comparable conditional promise-breaks (F16, F17, F18) as P2.

P1 is defensible on the literal rubric, because the UI says 'Scripts are off' next to a link that runs them. That is why this ships first.

**Root cause.** One URL, /artifacts/<id>, serves one response policy to two viewing contexts. CSP sandbox flags intersect with the iframe's sandbox attribute, so for the per-page switch to work, the route always grants 'sandbox allow-scripts'. Consent is therefore encoded only in the embedding iframe, never in the response. Any top-level navigation to the URL gets the scriptable policy without consent: Open links, fallbacks, Markdown links, typed URLs and history.

The immutable cache keeps pre-fix responses alive. SEC-4 modelled the threat as 'pages shown inside byway' and never revisited the links. Unit and e2e tests pin the permissive header as intended (server.test.ts:40-44, api.test.ts:199-201, configurations.spec.ts:57).

A second, related gap: the app's own CSP never limited where its frames may navigate, so a framed page can still be carried off-site by a navigation.


### F13: Human and model review views silently omit artifact content

- **Verdict:** ACCEPT · **Severity:** P2 (review: P2) · **Label:** correctness / evidence completeness (human decision views, row summaries, and GREAT-critic lineup cards)

**Rationale.** Both halves hold.

Human half:
- run-data.ts:13 sets EXCERPT_BYTES = 16_000, and run-data.ts:21 decodes a byte slice, so a split character becomes U+FFFD (reproduced).
- ArtifactInfo (view/rundata.ts:9-13) is {mediaType, text?}, with no completeness flag or size.
- ArtifactPreview size='large' renders the prefix inside decision surfaces: ComparePanel (TELLS before/after), References, StepDetail and RunStatusPanel. References links to the whole only for pages.
- The critic found a third kind of consumer, and I reproduced it. StepThumbs.tsx:57-67 counts a diff's files and +/- lines from the prefix and shows the result as fact. My 54 KB, 12-file diff (revise-C-r1/diffstat.mts) gives the row '4 files, +142 −142' instead of 12 files, +480 −480.
- PickPanel shows non-page drafts only as a 260 px clipped card, with no path to the whole text (PickPanel.tsx:102-110).
- The spec sanctions excerpts for step rows only (product-v1-design.md:158).

Model half:
- fontSizeFor returns 12 without checking fit (cards.ts:76-84).
- The card clips at 2576 px with overflow:hidden (cards.ts:108).
- cardOf keeps tiles[0] only (critic.ts:185-186).
- In cards form the text slot holds only CARD_NOTE, or '' for screenshot media (critic.ts:247), so clipped words reach the critic nowhere.
- cards.test.ts:74 pins the clipped render.

Minor overstatements that do not change the verdict: large JSON over 16 KB is uncommon, the U+FFFD is cosmetic, and the write editor holds the full initialText.

**Severity rationale.** Agree with P2. No stored data is lost: CAS bytes, the write editor, the Result page and exports are whole.

But decisions are made on partial evidence without notice:
- A TELLS compare with a tail-only swap past 16 KB shows two identical columns.
- A C7 step row understates a diff's size.
- A GREAT critic's rank, which gates loops, can be computed on clipped text, including our own item's.

The model half alone would sit at P3-P2, because it needs a mixed-form lineup.

**Root cause.** Two mechanisms share one pattern: a representation built for a lighter context is reused in a decision context, and it cannot say it is partial.

(a) ArtifactInfo has one overloaded text field. It is a byte prefix designed for step rows and contact sheets, but nothing in the contract marks it as a prefix. So decision views render it as the artifact, and row summaries count from it.

(b) The BLIND-1 card assumes an item's words fit one 2576 px tile. Fit is estimated rather than measured, overflow is clipped silently by CSS, and in cards form the card is the only carrier of the words, because the text slot holds CARD_NOTE.


### Options


**A. Review's repair as written: central trusted viewer, rich evidence metadata, paginated model evidence** (fixes root cause: partly; effort XL; risk medium)

F05: route every HTML view, previews and full size, through one trusted viewer route that embeds the artifact. The raw route is inert by default, and execution is served only on a distinct path. Audit every link and disclose that downloaded HTML runs its scripts.

F13: ArtifactInfo carries byte length, completeness, source artifact and transformation policy. Human views lazy-load the whole text and parse it before summarizing. Model evidence is paginated into several card images per item, within a stated, measured evidence budget, so words beyond that budget are still cut.


*Pros*
- Matches the review's acceptance list item for item
- One viewer component for every HTML view gives one place to audit consent
- Pagination lets image-only critics see more words than one tile allows

*Cons*
- The in-app previews (ScaledPage, PageResult) are already trusted viewers, so routing them through a viewer route adds nested frames for no security gain
- 'Transformation policy' and 'source artifact' have no consumer, which is speculative contract surface
- Multi-image cards break BLIND-1's one image per label and the C5 template wording ('attached as one image'), forcing a prompt version bump
- Still budget-bound for image-only critics, so it only partly fixes the model half, the same as B, at higher cost
- Does not address frame navigation off-site
- Largest change of the four


**B. Each boundary states its context: inert-by-default response with an iframe-only consent variant, one whole-artifact view, an excerpt contract with server facts, and words carried as words** (fixes root cause: partly; effort L; risk medium)

Three independently shippable changes.

(1) F05: /artifacts/<id> is inert ('sandbox', which also blocks meta refresh). /artifacts/<id>?scripts=1 runs scripts only when a same-origin iframe requests it (Fetch Metadata), and is never cached. One helper, openHref, sends every in-app 'open' path to a new whole-artifact viewer, /view/<id>, which carries the same per-page switch. The app CSP gains frame-src 'self'.

(2) F13 human: ArtifactInfo.text becomes excerpt plus complete and bytes. The server computes whole-artifact row facts (diffstat, option titles). Large previews load the whole text and show a visible partial state until it arrives, and pick cards link to the viewer.

(3) F13 model: critics that read a text lineup get every item's full words under its label. Image-only critics keep words on the card under a measured budget; a cut there is visible, memoized with the card, and disclosed in the step note in terms the person knows.


*Pros*
- Puts consent in the response, covering typed URLs, history, Markdown links and future links, not just the known ones
- Fails closed: a browser without Fetch Metadata never gets scripts
- Prototype-verified in Chromium: zero leaks on every top-level path, the consented frame runs, frame self-hops are refused, and frame-src 'self' blocks link-click and script self-navigation off-site
- One rule for every Open link (openHref), so no in-app link navigates top-level to the raw route; this also shrinks the pre-fix cache residual
- Renaming to excerpt makes the compiler list every consumer; server facts make row counts true
- Keeps ADR-0080's per-page switch and full-size working C1 pages
- Text critics get exactly the text-form evidence: no capacity or legibility limit, and one card per label still holds
- Cut records survive retries, because they are memoized with the card
- No workflow code changes, so workflowBundleHash is unchanged and no runs retire (ADR-0078)
- Each change ships and reverts on its own

*Cons*
- Fixes the root cause fully for F05, F13 human and text critics. For image-only critics (C5 gate, web-page) words beyond one tile still do not reach the critic. The cut is measured and disclosed, not silent, but the evidence stays partial. Hence 'partly'
- Two card behaviours (text critics and image-only critics)
- Pre-fix immutable cache entries stay reachable by typed URLs, history and copied links until the browser cache is cleared (documented)
- Adds one app route (/view/<id>) and a client whole-text loader
- The e2e suite needs a seeding helper (test-side only)
- Changes text critics' inputs for runs spanning the upgrade (documented)


**C. Minimal: header gate on the same URL, partial notices, visible card cut** (fixes root cause: partly; effort S; risk medium)

F05: keep one URL. Serve 'sandbox allow-scripts' only to requests with Sec-Fetch-Dest iframe, inert otherwise, with Vary: Sec-Fetch-Dest. Links unchanged.

F13: add complete and bytes, and show 'Showing the first 16 KB' with a raw link on large previews, without loading the rest. Cards keep a sticky 'cut' marker, and the step note lists cut labels.


*Pros*
- Smallest diff
- Closes the top-level script path for new cache entries

*Cons*
- Pre-fix cached responses on the same URL keep allow-scripts for a year, and every Open link still targets that URL, so ordinary clicks reach them
- Any scripts-off iframe still receives the scriptable response
- Full-size C1 pages lose their consent path, a functional regression
- Decision views stay partial, and row counts stay false
- The critic still ranks clipped text; cut records are lost on memo hits


**D. Remove the variables: no page scripts, whole text always shipped, never text in pictures** (fixes root cause: yes; effort L; risk high)

F05: drop the per-page switch and serve every page inert.

F13: getRunData ships whole text for every artifact. Cards never typeset words: every item's words go in a text block, and the C5 gate-critic and web-page critic templates gain a text lineup.


*Pros*
- Strongest invariants: no consent state, no excerpts, no words in pixels

*Cons*
- C1 build prompts need inline JS and the critic's renderer runs scripts, so the person would judge a different page than the critic saw
- Reverses ADR-0080's deliberate per-page consent
- Every poll would carry the full text of open-checkpoint artifacts
- Template version bumps and a BLIND-1 redesign for image-only critics


### Recommendation: B

**Why.** B corrects each wrong assumption at the boundary where it lives, with the smallest mechanism that removes it everywhere.

F05: making the response inert unless a same-origin iframe asks with consent covers every current and future top-level path. It also closes the meta-refresh channel. One openHref rule moves every in-app 'open' to the viewer, which keeps full-window C1 pages working on consent. frame-src 'self' is one directive; the probe showed it closes the link-click and script self-navigation channels for every in-app frame.

F13 human: renaming the field to excerpt puts completeness in the contract, so each consumer has to choose a snippet, the whole text, or a server fact. That fixes decision views and the false row counts the critic found, not only the reproduced surfaces.

F13 model: words go to the channel built for words wherever the critic's template reads a text lineup. Image-only critics get a measured, visible, disclosed budget that survives retries. B is rated 'partly' only because that last branch still cuts words beyond one tile. Closing it would need multi-image cards (A, which also has a budget) or template changes (D). Both cost more than the rare case warrants: long text examples in ad or page lineups, where C5 also tells the critic not to judge wording.

The three changes ship separately, F05 first.

**Design.** Three changes, each with its own ADR, shipped in order. Overall effort L.

CHANGE 1 (F05): consent lives in the response; one whole-artifact view; frames stay inside byway.

Server (apps/web/src/server/artifacts.ts, api.ts, app/artifacts/[id]/route.ts):
- New pure function pageScriptsGranted(url, headers): true only when url.searchParams.get('scripts') === '1', sec-fetch-dest === 'iframe' and sec-fetch-site === 'same-origin'.
- pageCsp(origin, granted) ends in 'sandbox' (no scripts, no automatic features, no forms, no popups, opaque origin), or 'sandbox allow-scripts' when granted. All other directives stay.
- artifactHeaders(mediaType, origin, downloadTitle?, scripts?: { asked; granted }): when asked, Cache-Control is 'no-store'. Otherwise caching stays immutable. That is safe because the default URL is always inert and never depends on request headers, so no Vary is needed.
- artifactResponse takes the request's fetch metadata, and route.ts passes request.headers. Downloads (?download=1) and the media route never grant.

Client (apps/web/src/components/api.ts):
- pageFrameUrl(id, scripts) returns artifactUrl(id), plus '?scripts=1' when scripts is on.
- openHref(id) returns '/view/' + encodeURIComponent(id).
- artifactIdOf(url) extracts the id from own-artifact URLs (view/pages.ts OWN_ARTIFACT).
- ScaledPage and PageResult, the app's only two iframes, take id instead of src and derive both src (pageFrameUrl) and sandbox (frameSandbox) from one scripts boolean. frameSandbox stays as a second layer.

Viewer: new apps/web/app/view/[id]/page.tsx. It is a server component outside /artifacts/, so the app CSP applies.
- isArtifactId, or 404; a missing artifact is 404.
- It reads the whole artifact once:
  - text/html: PageResult filling the window (Desktop/Phone and ScriptsToggle, consent keyed by id, never stored).
  - image/* and video/*: the element.
  - text types: ArtifactPreview size='large' with { mediaType, excerpt: whole text, complete: true, bytes }. Storyboards get media info through artifactInfo(storyboardArtifacts), as result/page.tsx does.
  - anything else: redirect to the raw route, which is inert.

One link rule: every link that opens an artifact for viewing uses openHref:
- StepDetail.tsx:55
- PickPanel.tsx:107, now for every option
- References.tsx:25, now for every reference
- ResultView.tsx:107
- the ArtifactPreview.tsx:55 fallback
- the results.tsx:28 clip fallback
- Markdown.tsx links whose href is isOwnArtifactUrl

The raw route stays only for element src (img, video, iframe via pageFrameUrl) and downloads (artifactUrl(id, name)). The HTML download control gets one line: a downloaded page runs its scripts when opened from your computer.

App CSP (next.config.ts): add frame-src 'self'. In Chromium 1.63 it stopped both a click on a model-written link in a scripts-off frame and a consented frame's script navigating itself to a collector; without it, both arrived. It does not replace consent: scripted pages keep channels CSP does not govern, such as DNS prefetch and WebRTC.

Correct the comments in artifacts.ts, route.ts, view/pages.ts, ScaledPage.tsx, PageResult.tsx and next.config.ts.

CHANGE 2 (F13 human): the contract says what it carries.

apps/web/src/view/rundata.ts: ArtifactInfo becomes { mediaType; excerpt?: string; complete?: boolean; bytes?: number; diffstat?: { files; additions; deletions }; titles?: string[] }.
- excerpt is the opening of a text artifact, at most EXCERPT_BYTES, cut on a character boundary. It is a snippet unless complete is true.
- Renaming text to excerpt makes the compiler list every consumer: ArtifactPreview:42, PickPanel:16, StepThumbs:16 and :58.

server/run-data.ts artifactInfo:
- bytes is the length, and complete is length <= EXCERPT_BYTES.
- excerpt = new TextDecoder().decode(bytes.subarray(0, EXCERPT_BYTES), { stream: true }), which drops a partial trailing character (verified).
- From the whole bytes: diffstat via parseUnifiedDiff for text/x-diff, and titles via parseOptions for application/json when it parses.

Consumers:
- StepThumbs: the diff row uses diffstat, the options row uses titles, and the prose row is an excerpt(…, 120) snippet.
- PickPanel: cards stay snippets (the prose-card already clips visibly at 260 px), and every option gets Open → /view/<id>.
- ArtifactPreview splits into a pure TextPreview({ type, text, size, partial }) and useWholeText(id, info, enabled).

For size='large' with complete === false, the hook calls loadWholeText(id):
- A module-level Map of promises, keyed by the content-addressed id, fetches artifactUrl(id).
- A rejected promise is evicted, so the next render retries.
- State starts undefined and is set in an effect, so the server render and the first client render emit the same excerpt-plus-status markup.
- Until the text arrives, or after a failure, the preview shows the excerpt plus 'Showing the first 16 KB of 23 KB' and 'Open the whole text' (openHref).
- JSON is parsed only from whole text. A partial large JSON shows 'Loading the whole text' instead of a raw fragment; a partial JSON thumbnail shows its titles.

Thumbnails stay snippets with no notice; ADR-B says so, and why. This covers ComparePanel, StepDetail, References and RunStatusPanel without touching them. A guard scan lists the files allowed to read .excerpt (TextPreview, the StepThumbs snippet, PickPanel cardInfo), so a new consumer must be reviewed.

CHANGE 3 (F13 model): words reach critics as words; image-only critics get a measured, disclosed budget.

Files: packages/runner/src/activities/critic.ts, cards.ts and model-step.ts. In buildLineup's cards branch, each item's card text is computed once, as today: '' for ours when framesOnly and it has frames, else item.text. That one value drives both channels.

(a) Text critics (viewKindOf(medium) === 'text': prose, options, code-diff; the C2, C3, C4, C6, C6a and C7 templates present {{view}} as the lineup):
- view = labelled(cardTexts.map(t => t.trim() ? t : CARD_NOTE)).
- The card draws the item's pictures and, for an item with words, a fixed line ('Its words are written out under this label.') instead of typesetting them. Such a card is one tile by construction, because images are bounded by the FRAMES_ALONE and rowMax CSS, so it needs no measuring.
- Rule: whether a label carries words follows whether the item has words, never whether it is ours.

(b) Image-only critics (media/C5 and web-page): words stay on the card, as their templates say, under a measured budget.
- cardHtml drops max-height and overflow:hidden from .card. The fontSizeFor floor stays at 12 px.
- cardOf starts from the words cut at a word boundary to the 12 px estimate, renders, and measures the height from the tile count and the last tile's PNG height (imageSize).
- Over one tile, it cuts proportionally, then about 10% per re-render, at most 6 renders. A cut ends with a visible line '[… N more words not shown]'.
- If the card still does not fit, all words go, with '[all N words not shown]'. If it still exceeds one tile, the step fails with a StepError naming the example. A card is never silently cut at tiles[0].

Memo: the card memo stores JSON { artifactId, cut?: { shownWords, totalWords } } under 'card2/<hash of the uncut card HTML>'. The new prefix means a pre-upgrade string memo is never parsed as JSON. Lineup.cut is { item: 'ours' | { ref: artifactId }; shownWords; totalWords }[], built from the memo value on hit and miss alike.

Note: model-step.ts merges cut entries across shuffles (deduplicated by item) and appends one sentence to the step note, for example 'Example 2 and your work were too long to show the outside critic in full: it saw the first 3,100 of 9,800 words and 2,000 of 2,400 words.' Examples are numbered by their position in input.refs, in the order the person supplied them. Blind labels are never named.


**Steps**
1. Change 1, tests first. server.test.ts:
- The default HTML CSP ends in 'sandbox' with no allow-scripts.
- The granted variant carries 'sandbox allow-scripts' and no-store.
- The next.config app CSP contains frame-src 'self'.
2. api.test.ts: ?scripts=1 is scriptable only with dest iframe and site same-origin. It is inert for dest document, missing headers, site cross-site, the default URL and downloads.
3. Static tests (renderToStaticMarkup in panels.test.ts and previews.test.ts):
- openHref returns /view/<id> for: StepDetail, PickPanel (page and text options), References, ResultView, the ArtifactPreview fallback, the Clip fallback, and a Markdown own-artifact link.
- The ScaledPage and PageResult src carries ?scripts=1 exactly when sandbox is allow-scripts.
- A guard scan finds no single-argument href={artifactUrl(...)} in src/components.
4. Implement pageScriptsGranted, pageCsp(origin, granted), the artifactHeaders scripts option and the route.ts wiring. Then pageFrameUrl, openHref and artifactIdOf; ScaledPage and PageResult by id; app/view/[id]/page.tsx; the link repoints; the download line; frame-src 'self'; and the comments.
5. New e2e/consent-boundary.spec.ts, a standalone harness. It starts its own loopback server built on the real artifactHeaders and pageScriptsGranted (synthetic pages and a local collector) and needs no demo data. It asserts zero collector hits for: top-level default, top-level ?scripts=1, meta refresh, Open popups, a frame hop to ?scripts=1, a link click in a scripts-off frame and a consented script self-navigation (both under frame-src 'self'). The consented frame does run.
6. New e2e/seed.ts, test-side only. It runs after the demo server is up, from the Playwright process, using createStore on BYWAY_E2E_DATA_DIR. It writes:
- an ended run, with step artifacts (a hostile page, a 19.5 KB memo with a tail sentinel, a 54 KB 12-file diff) and an output page;
- a running run, with open pick, compare and react checkpoints that reference a hostile page and two roughly 17 KB memos differing only in the tail.

Why this works: reconcileLostRuns runs only at engine start, runner.view reads only the store, and seed-probe.mts showed a second store instance's open checkpoint visible to the first. Specs never submit the seeded checkpoints, because client.ts:116 would settle the run as lost. guard-boundaries scans only src, app, proxy.ts and next.config.ts, so e2e may import @byway/store. No product route is added.
7. e2e/artifact-views.spec.ts on the seeded data:
- Each Open path (StepDetail, PickPanel, References, Result) opens /view/<id> with sandbox='' and leaves the collector empty.
- The toggle gives src ?scripts=1 with allow-scripts, and reloading the viewer returns it to off.
- After a frame-initiated reload of a consented frame, no script runs (fail closed; the switch may still read 'on', which ADR-A documents).
- Flip configurations.spec.ts C1 to expect an inert raw CSP.

Write ADR-A. Ship Change 1.
8. Change 2, tests first:
- rundata.test.ts: artifactInfo on 19,561 bytes gives complete false and bytes 19561; 15,999 ASCII bytes plus U+1F337 gives an excerpt with no U+FFFD; the 54 KB diff gives diffstat {12, 480, 480}; an options JSON gives titles.
- Static: StepThumbs shows '12 files'; a partial large preview shows the status and an openHref link; TextPreview of the whole text shows the sentinel; a whole 17.5 KB options JSON renders OptionsList.
- Node test: loadWholeText caches success and evicts failure.
- Guard: the scan allowlist of .excerpt readers.
9. Implement the rename and new fields, the character-safe excerpt, diffstat and titles, TextPreview, loadWholeText and useWholeText, and the PickPanel Open for every option.

In e2e: the compare panel shows both memo endings, StepDetail and /view/<id> show the memo's tail sentinel, and the step row reads '12 files'. Write ADR-B. Ship Change 2.
10. Change 3, tests first. critic.test.ts:
- Prose ours with an end sentinel against [image, 30k-character text with a sentinel, text] gives form 'cards'; the view contains both sentinels; the image item gets CARD_NOTE; every label has exactly one PNG; and ours has the same shape as the text reference.
- Restate BLIND-1: one card image per label from one template, and words under a label exactly when the item has words.
- The view in cards form is as long as the text-form view for the same text items.
- Memo-hit identity: building twice with one runId gives identical lineup.cut and an identical note.
- A fake renderer that always returns 2 tiles gives a StepError, not tiles[0].
- The note is deduplicated across 2 shuffles and names 'Example N' and 'your work'.
11. cards.test.ts (Chromium): a screenshot-media card with about 30k characters either keeps the sentinel within one tile or ends with the visible marker, and the cut is recorded. Replace the assertion that pins clipping.
12. Implement the critic.ts cards branch, the cards.ts word line and budget (no CSS clip), the measured cut in cardOf with the card2 JSON memo, Lineup.cut, and the note in model-step.ts. Check workflowBundleHash is unchanged. Write ADR-C. Run the web, runner and e2e suites. Ship Change 3.


**Acceptance tests**
- server.test.ts: artifactHeaders('text/html', 'http://127.0.0.1:3000') gives a CSP matching /(^|; )sandbox$/ with no 'allow-scripts', and the next.config app CSP includes "frame-src 'self'" (fails today: artifacts.ts:39 always adds allow-scripts, and there is no frame-src).
- api.test.ts: /artifacts/<html-id>?scripts=1 returns 'sandbox allow-scripts' and Cache-Control 'no-store' only with sec-fetch-dest 'iframe' and sec-fetch-site 'same-origin'. Dest 'document', missing headers, 'cross-site', the default URL and ?download=1 are inert (fails today: always allow-scripts).
- e2e/consent-boundary.spec.ts (standalone harness on the real header functions): zero collector hits for top-level default, top-level ?scripts=1, meta refresh, Open popups, a frame hop to ?scripts=1, a link click in a scripts-off frame and a consented script self-navigation. The consented frame does run (fails today for top-level, meta refresh and popups; the frame-src cases were verified in revise-C-r1/frame-src-probe-results.json).
- Static (renderToStaticMarkup): every Open link (StepDetail, PickPanel page and text options, References, ResultView, the ArtifactPreview fallback, the Clip fallback, a Markdown own-artifact link) has href /view/<id>, and every frame's src has ?scripts=1 exactly when sandbox='allow-scripts' (fails today: raw URLs).
- e2e/artifact-views.spec.ts (demo server plus data seeded after start): clicking each Open path opens /view/<id> with sandbox='' and leaves the collector empty. The toggle gives src ?scripts=1 with sandbox='allow-scripts'. Reloading the viewer returns to off. A frame-initiated reload of a consented frame runs no script. configurations.spec.ts C1 now expects an inert raw CSP.
- rundata.test.ts: artifactInfo on 19,561 bytes gives complete === false and bytes === 19561. 15,999 ASCII bytes plus a 4-byte emoji gives no U+FFFD. A 54,228-byte, 12-file diff gives diffstat { files: 12, additions: 480, deletions: 480 } (fails today: no fields, U+FFFD present, and the row counts 4 files, +142 −142 from the prefix).
- Static: StepThumbs with that info shows '12 files'. A large partial preview shows 'Showing the first' and an 'Open the whole text' link to /view/<id>. TextPreview with the whole text renders the end sentinel. A whole 17.5 KB options JSON renders OptionsList, not pre.preview-raw. A PickPanel text option has Open → /view/<id>.
- Node: loadWholeText returns the cached promise on a second call, and after a rejected fetch the next call fetches again.
- e2e (seeded): the compare panel with two roughly 17 KB memos differing only in the closing paragraph shows both endings once loaded (fails today: identical columns), and /view/<memo-id> shows the tail sentinel.
- critic.test.ts: buildLineup('prose', ours with a sentinel, [image, long text with a sentinel, text]) gives form 'cards'. slots.view contains both sentinels and CARD_NOTE under the image's label. Every label has exactly one PNG. Ours and the text reference have identical shapes (fails today: the view is CARD_NOTE only).
- critic.test.ts: a lineup whose card is cut, built twice with the same runId (the second build a memo hit), gives identical lineup.cut and an identical step note. A renderer that always returns 2 tiles gives a StepError. Two shuffles produce one deduplicated note naming 'Example N' and 'your work', never a label.
- cards.test.ts (Chromium): a screenshot-media card with about 30k characters never hides content. Either the sentinel lies within the single tile, or the card ends with '[… N more words not shown]' and lineup.cut names the item (fails today: about 1,183 px hidden, with no marker and no record).


**Compatibility.** Temporal and replay: no workflow code changes. critic.ts, cards.ts and model-step.ts are activity code that the workflow bundle does not import, so workflowBundleHash is unchanged and no runs retire under ADR-0078; the CI bundle-hash check confirms it.

Runs spanning the upgrade keep running:
- A retried critic builds a new lineup, so at most one extra critic call per in-flight retry.
- In loops, later rounds' text critics see words plus cards where earlier rounds saw cards only, so plateau comparisons across the upgrade mix conditions. Best-version selection is a fresh re-rank (interpreter.ts:499), so it is unaffected. ADR-C states this.

Memos: card memos move to the 'card2/' prefix with a JSON value. Old string memos are orphaned, never parsed.

Stored data: nothing migrates. CAS, the run store schema and recipe hashes are unchanged; no template changes.

Contracts: ArtifactInfo is web-internal, and server and client ship together. The rename is checked by the compiler, and the tests that construct ArtifactInfo are updated.

Browsers: Chromium/Edge, Firefox 90+ and Safari 16.4+ send Fetch Metadata on loopback. Without it the switch fails closed (scripts stay off). frame-src 'self' was verified in Chromium; in other engines it is defense in depth, not the consent boundary.

Residuals ADR-A lists accurately:
- Pre-fix immutable cache entries for /artifacts/<id>, reachable only by typed or bookmarked URLs, history, links copied before the upgrade, or a consented frame hopping to another page's default address, because no in-app link targets the raw route any more. Clearing byway's cached files once removes them.
- Downloaded HTML opened from disk.
- Ordinary links in Markdown text artifacts and on a top-level inert page, which the person sees and clicks.

Cost: text critics in cards form now receive full words as well as images. The volume equals the text form's (at most 10 references of MAX_REF_TEXT plus ours), bounded by the run budget caps.

Tests that pin old behaviour are rewritten, not deleted: server.test.ts:40-44, api.test.ts:199-201, configurations.spec.ts:57, critic.test.ts:117-127 (viewTextOf) and cards.test.ts:74.

**ADR.** Yes: three new ADRs, one per change, numbered at merge time, since other cluster designs may also add ADRs. ADRs are append-only, so each supersedes in part rather than edits, and each records honest provenance under the delegated-decision convention.

ADR-A (corrects ADR-0074 and ADR-0080's page-scripts paragraph):
- Generated-page responses are inert by default. Scripts are served only to a same-origin iframe that asks with the person's consent, and never cached.
- Every in-app 'open' goes to the whole-artifact viewer, with the same per-page switch.
- The app's frames may navigate only within byway (frame-src 'self').
- It lists the residuals above and the fail-closed behaviour, including that the switch can read 'on' over an inert frame after a frame-initiated reload.

ADR-B (run-screen artifact info):
- The excerpt is a snippet, with completeness and size stated.
- Row facts are computed from whole bytes.
- Decision views show whole text, and a partial view says so.
- Thumbnails and pick cards are snippets, with a one-click whole view.

ADR-C (amends ADR-0080 BLIND-1 and extends ADR-0072):
- In a cards lineup, text critics read every item's full words under its label. Whether a label carries words follows whether the item has words, never whether it is ours.
- The modality trade is explicit: in 'text against image references' ours is visibly the text item, as it already was on cards.
- Image-only critics get words on the card within a measured budget, cut visibly, memoized with the card, and disclosed in the step note.
- It covers runs spanning the upgrade.


**Deliberately not doing**
- No viewer route for thumbnails or in-app large previews: ScaledPage and PageResult are already the trusted in-app viewers.
- No 'source artifact' or 'transformation policy' fields, and no JSON text API: the raw route already serves whole text same-origin.
- No full text in the polled RunData, and no change to the 16 KB excerpt size.
- No multi-image or paginated cards, and no changes to the C5 gate-critic or web-page critic templates. BLIND-1 keeps one card image per label.
- No raised font floor (the earlier 16 px proposal is withdrawn): it cut capacity about 44% and changed C5 gate inputs on an unmeasured downscaling hypothesis. The root cause is silent clipping, which is fixed.
- No Clear-Site-Data purge. The server cannot know whether a given browser has already purged without adding per-browser state (a cookie), and sending it on every document would wipe the app's cache on each navigation. After the link rule, only typed or history URLs reach pre-fix entries, and that is documented.
- No Vary header: the default URL's response no longer depends on request headers, and the consent variant is no-store.
- No seeding endpoint or env-gated write route in the product server. E2E seeding is test-side, through the store.
- No change to external Markdown links: they are ordinary links the person sees, a documented residual.
- No sandboxing of downloaded HTML beyond a disclosure line.
- No admission-time warning for long text examples in image-only-critic recipes. It would be a second, unmeasured estimate; logged as a backlog follow-up, since the run-time note discloses any actual cut.
- No diff highlighting in compare, no change to text-form or OK-mode lineups, and no change to MAX_REF_TEXT.


**How it resolves each finding**
- **F05:** Change 1 makes /artifacts/<id> inert ('sandbox', which blocks scripts and meta refresh and keeps the opaque origin). Scripts are served only for ?scripts=1 requested by a same-origin iframe, never cached, and only ScaledPage and PageResult request it, deriving src and sandbox from one consent boolean.

One openHref rule sends every in-app 'open' to the new /view/<id> viewer, with the same per-visit switch. That covers the four Open links, the ArtifactPreview fallback, the clip fallback and Markdown own-artifact links, so no in-app link navigates top-level to the raw route.

The app CSP adds frame-src 'self'. Chromium-verified, this blocks link-click and script self-navigation off-site from every in-app frame.

Tests: header unit tests; static href and frame-pair tests; a standalone Chromium leak harness on the real header functions; and a seeded demo e2e for the Open paths, the toggle and reloads. ADR-A corrects ADR-0074 and ADR-0080 and lists accurate residuals.
- **F13:** Human half (Change 2): ArtifactInfo.text becomes excerpt plus complete and bytes, cut on a character boundary, so the compiler flags every consumer. The server computes whole-artifact row facts (diffstat, option titles), which fixes false step-row counts. Large decision previews load and render the whole text, with a visible partial status and an Open-the-whole-text link until then; JSON is parsed only from whole text. Pick cards stay snippets with Open → /view/<id>, which renders the whole artifact. A guard scan limits .excerpt readers.

Model half (Change 3): in cards lineups, text critics receive every item's full words under its label. Cards keep pictures plus a fixed line, which makes each one tile by construction. Image-only critics keep words on cards under a measured budget, with no CSS clip; a cut is visible, fails closed when it cannot fit, is memoized with the card (so retries keep the record), and is disclosed once per step in the person's terms.


**Changes forced by the adversarial rounds (last round)**
- ACCEPTED (critic-C-root-cause mustFix 1, cut record lost on retry): verified. kept() memoizes only the PNG id as a string (critic.ts:143-144, memo.ts memoized). cardOf returns just the id (critic.ts:179-190), so a memo hit rebuilds no cut record and the step note (model-step.ts:94) would drop it. The card memo value is now JSON { artifactId, cut? } under a new 'card2/<hash of the uncut card HTML>' prefix, so old string memos are never parsed. Lineup.cut is built from the memo value on hit and miss. Added a memo-hit identity test. The note is deduplicated across C5's two shuffles and names items 'your work' or 'Example N' (position in input.refs, the order supplied), never blind labels.
- ACCEPTED (critic-C-root-cause mustFix 2, excerpt assumption removed only in one branch): verified and reproduced. StepThumbs.tsx:57-67 counts a diff from the 16 KB prefix: my 54,228-byte, 12-file diff (revise-C-r1/diffstat.mts) gives '4 files, +142 −142' instead of 12 files, +480 −480. PickPanel non-page drafts had no way to the whole text. Resolved at the contract:
- ArtifactInfo.text is renamed excerpt (plus complete and bytes), so the compiler lists every consumer.
- The server computes diffstat and option titles from whole bytes.
- StepThumbs uses those facts.
- Every PickPanel option gets Open → /view/<id>, which renders the whole artifact.
- A guard scan allowlists .excerpt readers.
- ADR-B states that thumbnails and pick cards are snippets, with a one-click whole view.
- ACCEPTED (critic-C-regression-scope mustFix, untestable acceptance tests and effort): verified that the e2e suite has no seeding, that reconcileLostRuns (dev-engine.ts:106, lost-runs.ts:57-67) closes runs seeded before start, and that the web tests have no DOM environment. Resolution:
(a) No product seeding route.
(b) Seed from the Playwright process via createStore on BYWAY_E2E_DATA_DIR after the demo server is up. This is simpler than a second web-only project: reconcileLostRuns runs only at engine start, runner.view reads only the store (client.ts:127-131), and seed-probe.mts showed a second store instance's open checkpoint visible to the first. Specs never submit seeded checkpoints (client.ts:116), and guard-boundaries scans only src, app, proxy.ts and next.config.ts.
(c) The leak matrix runs in a standalone Chromium spec on the real artifactHeaders and pageScriptsGranted.
(d) The scan test is replaced by an openHref helper plus static href tests, with a narrower scan for single-argument href={artifactUrl(...)}.
(e) useWholeText is split into a node-testable loader, a static TextPreview and Playwright glue.
Effort is re-estimated from M to L, shipped as three independent changes with F05 first.
- ACCEPTED (both critics, pre-fix cache residual described too narrowly): the residual list was wrong. The fix routes the remaining in-app top-level paths (ArtifactPreview.tsx:55 fallback, results.tsx:28 clip fallback, Markdown own-artifact links) through openHref. ADR-A lists the residuals accurately: typed, bookmarked or history URLs, links copied before the upgrade, and a consented frame hopping to another page's default address. REJECTED the one-time Clear-Site-Data: the server cannot know whether a browser has purged without new per-browser state (a cookie), and sending it on every document wipes the app's cache on each navigation. The remaining reach is low and documented.
- ACCEPTED (critic-C-root-cause consider, one rule for every Open link): a single openHref(id) for every viewing link. /view/<id> renders HTML with the consent switch, text types whole, images and video as elements, and redirects anything else to the inert raw route. The per-link 'when text/html' checks disappear.
- ACCEPTED, and decided deliberately (critic-C-root-cause consider, user-clicked links): revise-C-r1/frame-src-probe.mts (Chromium 1.63, results in frame-src-probe-results.json). Under the current app CSP, a click on a model-written link in a scripts-off frame and a consented script navigating itself both reached a collector. With frame-src 'self' added, both were blocked. So the app CSP gains frame-src 'self' (only two iframes exist, both same-origin). Ordinary links in Markdown text and on a top-level inert page stay as a documented residual. ADR-A does not claim scripted pages are safe, because CSP does not govern channels such as DNS prefetch and WebRTC, so consent stays.
- ACCEPTED (critic-C-root-cause consider, fail-closed UI divergence): the seeded e2e reloads a consented frame from inside the frame and asserts that no script runs (the safe direction). ADR-A documents that the switch can read 'on' over an inert frame, and that turning it off and on reloads with consent.
- ACCEPTED (critic-C-root-cause consider, honest rating): B's fixesRootCause is now 'partly'. It is 'yes' for F05, F13 human and text critics, but over-budget words for image-only critics are still cut, though visibly and disclosed. For consistency, A is also rated 'partly', since its pagination is bounded by an evidence budget too; only D is 'yes', at high cost. REJECTED the admission-time warning for now: it would be a second, unmeasured estimate at a boundary without a renderer. Logged in notDoing as a backlog follow-up.
- ACCEPTED (both critics, BLIND-1 trade and the framesOnly leak): the view is derived from the same per-item card text (the framesOnly-adjusted value at critic.ts:242-244), so ours with frames never leaks its words. The rule is 'whether a label carries words follows whether the item has words, never whether it is ours'. The restated test asserts that ours and a text reference have identical shapes. ADR-C states the modality trade: in 'text against image references' ours is visibly the text item, as it already was on cards.
- ACCEPTED (critic-C-root-cause consider, failure mode): re-renders are bounded (at most 6). The final fallback drops all words with '[all N words not shown]'. If a card still exceeds one tile (images overflowing, which the CSS max-heights should prevent), the step fails with a StepError naming the example. tiles[0] is never kept silently.
- ACCEPTED (both critics, useWholeText robustness): rejected promises are evicted from the module-level Map, and state starts undefined and is set in an effect, so the server render and first client render match.
- ACCEPTED (critic-C-root-cause consider, prompt size): added a test that the cards-form view for text items equals the text-form view's size. The cost delta (words plus images) is noted in compatibility, bounded by the run budget caps.
- ACCEPTED, and went further (critic-C-regression-scope consider, text-critic cards render more than they use): text-critic cards no longer typeset the words at all. They draw pictures plus a fixed line, so they are one tile by construction and need no measuring. Measurement applies only to image-only critics, and starts from the estimate.
- ACCEPTED (critic-C-regression-scope consider, 16 px floor is speculative): withdrawn. fontSizeFor keeps its 12 px floor, the root cause (silent clipping) is fixed by measuring and disclosing, and legibility is not changed without a measurement.
- ACCEPTED (critic-C-regression-scope consider, runs spanning the upgrade): ADR-C documents that later loop rounds' text critics see words plus cards. Best-version selection is a fresh re-rank (interpreter.ts:499), so only plateau comparisons across the upgrade mix conditions. The cost delta is noted.
- ACCEPTED (critic-C-regression-scope consider, ADR bookkeeping): the single ADR-0081 becomes three ADRs, one per change, numbered at merge time.
- OWN SIMPLIFICATION: dropped 'Vary: Sec-Fetch-Dest, Sec-Fetch-Site'. The default URL's response no longer depends on request headers, and the consent variant is no-store, so Vary added nothing.
- ACKNOWLEDGED (critic-C-regression-scope 'verified, no change needed'): agreed and relied on. There are only two iframes, the runner renders through its own origin, next.config excludes only the artifact paths from the app CSP, guard.ts keeps hosts loopback, and research recipes use OK critics only. No verdict challenges were raised; both verdicts and severities stand.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- Non-blocking: the cut note numbers examples by their position in input.refs ('Example N'). The Start form numbers every entry 'Example {i+1}', blank ones included (Examples.tsx:125), but storeExamples drops blank text entries (Examples.tsx:21-28). If the person leaves an earlier entry blank, the note's 'Example 2' is the item they saw as 'Example 3'.
- Non-blocking: the excerpt allowlist lets TextPreview pass a partial diff to DiffView in thumbnails. DiffView then prints per-file +N/−M from the excerpt (DiffView.tsx:8-20), so the last, cut file's counts are understated in a diff thumbnail with no notice.
- Non-blocking test-plan detail: the run screen shows one active checkpoint at a time (RunScreen.tsx:220). The seeded e2e 'running run with open pick, compare and react checkpoints' therefore needs one seeded run per checkpoint kind. The seeding specs should also skip when BYWAY_E2E_DATA_DIR is unset (an external BYWAY_E2E_BASE_URL with no data dir).
- Non-blocking: text-critic cards are argued to be 'one tile by construction' and are not measured. The design should state that the same fail-closed check (more than one tile is a StepError, never tiles[0]) applies to these cards as well, not only on the image-only path.


## Cluster D: Web client state ownership (drafts, recovery, polling)

**Root cause.** The web client has no explicit owner for state whose lifetime differs from a React mount or from a single network response. Screens keep three kinds of state in component-local useState and let mount/unmount, one-time prop copies and network arrival order keep them in step implicitly. (1) Person-authored input lives in leaf components and dies when the view switches or the page is left, although its real owner outlives the component: checkpoint drafts belong to the checkpoint (F06), Recommendation examples to the intake, Start attachments to the tab. (2) Server state that a screen changes through commands is copied into useState once and never reconciled, while other server-derived values stay live props refreshed by re-running a server render that is not a pure read (F14: rec and selection seeded at mount, the gate and remainingUsd live, an invented 'c4' default, and a router.refresh() that can ask the model). (3) Polled server state is applied in arrival order from overlapping requests, and connection state is set by any request (F15, and Nav's waiting count). The single correction is to make each screen's top-level client component the owner of its state, under three explicit rules. (a) Person-authored input is keyed by its server identity, held above every conditional render, kept for the tab session, and settled only by server state: a snapshot showing the question closed, or a stored resolution equal to the draft. It is never settled by a component unmounting. (b) After the server render that seeds it on navigation, a screen's server state changes only through the latest-issued poll or an explicit command's result, applied in one transition. A command returns everything it changes that the screen shows, so a screen never has to re-run a server render that may have side effects. No client-invented defaults. (c) Answerability is derived from the whole snapshot (question open AND run not ended), never from a single field, because the server can return a snapshot whose run and checkpoint fields were read at different moments. F15 and F06 interact: a stale snapshot unmounts YourTurn and loses a draft. The shared fix closes that path twice.


### F06: Preserve unsent human work across inspection

- **Verdict:** ACCEPT · **Severity:** P1 (review: P1) · **Label:** correctness / human-work data loss (client state lifetime)

**Rationale.** Both verifiers reproduced this independently, one of them in a production Next build. Repo truth: RunScreen.tsx:217-223 renders StepDetail, YourTurn and RunStatusPanel as alternatives in one slot, so selecting any timeline step unmounts YourTurn. That includes the current 'Your turn' row, which toggles (RunScreen.tsx:226), and closing with Esc (StepDetail.tsx:18). Every panel keeps the person's input in its own useState, seeded from the checkpoint: TextPanels.tsx:19 useState(() => emptyDraft(cp)), where emptyDraft seeds the text from cp.initialText (checkpoints.ts:102-105); TextPanels.tsx:46 useState(initial) for on-screen copy; PickPanel.tsx:26; SelectPanel.tsx:17; DirectivePanel.tsx:20; ComparePanel.tsx:24 and ChoosePanel.tsx:23 useState(null). A remount silently restarts from the model's text. Mod+Enter fires anywhere (useShortcuts.ts:44) and the send button is enabled, so one keystroke can send the model's initialText as the person's VOICE; both verifiers captured that POST body. Nothing in apps/web/src persists or guards checkpoint drafts. startDraft.ts already keeps the unsent Start text, so this is a gap, not a policy. Two caveats on the review's acceptance list. Polling and a failed POST already keep the draft, because YourTurn is keyed by cp.id and stays mounted; those are regression checks, not current failures. And the same lifetime pattern appears in two siblings that nobody reproduced as a loss but that sit on paths the app sends people down: Start attachments (StartForm.tsx:38; startDraft.ts keeps only the text) and the Recommendation screen's 'Examples you admire' (RecommendationView.tsx:58), lost whenever the page unmounts, for example on the Settings detour that a budget refusal recommends (view/history.ts:60). The design covers all three under one rule.

**Severity rationale.** The path is ordinary and designed in: the 'Back to your turn' label and the Esc shortcut invite inspection while a checkpoint is open. It affects every checkpoint kind, including the VOICE write in every recipe and the C6/C6a author draft. Nothing warns, and nothing on the restored panel shows that a reset happened ('Go back to the starting text' disappears). The reset text can be sent straight away as 'Your words', which breaks the protocol's central human-authorship guarantee in paid runs. That silent-submission path keeps it at P1 rather than P2. Since no money or persisted state is at risk until the person sends, it sits at the P1/P2 boundary.

**Root cause.** Person-authored input has no owner that outlives the component showing it. Each checkpoint panel keeps its draft in its own useState, seeded from the checkpoint record, so the draft lives exactly as long as the YourTurn mount. RunScreen's work area treats inspecting a step as replacing the turn (one conditional slot). Run end, a stale poll that drops the active checkpoint, and a reload also unmount it, and the next mount re-seeds from cp.initialText. There is no checkpoint-keyed store above that boundary, no session persistence, and no rule that a draft is settled only when server state shows the answer landed. The same assumption ties Start attachments and Recommendation examples to their mount.


### F14: Recover the recommendation state after a successful retry

- **Verdict:** ACCEPT · **Severity:** P2 (review: P2) · **Label:** correctness / client state (recommendation recovery)

**Rationale.** Both verifiers reproduced it in their own production builds of b33f128 with identical numbers: c1 stored, 'Memo Polish / Your choice' displayed, the chooser, the why and the alternatives all absent, the Start POST carrying recipeId 'c4', and a reload showing Landing Page Studio. Repo truth: RecommendationView.tsx:50 useState(initial) and :52 selection = chosenRecipeId ?? initial?.recipeId ?? 'c4' copy server state once. The failure gate at :126 reads the live prop recommendProblem. Try again at :131 is only router.refresh(), and page.tsx:58 renders RecommendationView without a key, so the instance and its state survive. The new props open the gate onto stale local state, and the hard-coded 'c4' default is then tagged 'Your choice' (tag logic at :114). The same split hides a composed recipe built while the failure panel is up, because the gate ignores selection.kind === 'composed'; the reproducer confirmed this too. flip() at :78-96 already applies a POST result to rec and selection in one step; the retry path never got that treatment. api.test.ts covers only the server half. The refuter's caveats hold: the in-app Settings, Save, Back path remounts and works, and the realistic triggers are transient model errors whose copy says 'Try again'. Those lower the frequency but do not refute the defect. Two further repo facts shape the fix. remainingUsd (page.tsx:54, :68; RecommendationView.tsx:149, :425) is server-derived and today kept current only by router.refresh(). And router.refresh() is not a safe way to re-read it, because the page's server render is not a pure read: with no recommendation stored and no library recipe chosen it asks the model (page.tsx:48 -> recommendationOrProblem -> currentRecommendation -> recommendIntake, api.ts:92-95). My scratch probe against the real api.ts confirms the final check: a re-render after compose during a failure adds one advisor.recommend call.

**Severity rationale.** Material correctness on a designed recovery path. After the retry, a recipe the person never chose is labelled 'Your choice', the explanation, chooser and alternatives are hidden, and Start launches the wrong paid workflow. Not P1: nothing is lost, the wrong title is visible, Start is an explicit click capped by the run budget, and a reload fixes it. Low-end P2, because the in-app budget fix path does not trigger it.

**Root cause.** The screen has no rule for which server state it owns and how that state changes. The recommendation, and a selection derived from it with an invented 'c4' fallback, are copied into useState once at mount, while the screen-mode gate and remainingUsd read live props. The only re-read path, router.refresh(), re-runs a server render that is not a pure read (it makes the first recommendation, F03), so a 'refresh the live props' step can both desynchronise owned state from props and trigger an unrequested model call. Recovery is a props refresh rather than a state transition, so the gate and the body disagree and a client-made default is presented as the person's choice. The composed recipe hidden behind the alert comes from the same gate.


### F15: Do not regress run state when polls arrive out of order

- **Verdict:** ACCEPT_PARTLY · **Severity:** P3 (review: P2) · **Label:** correctness / client state race (poll ordering)

**Rationale.** The mechanism is confirmed. My probe of the real mergeRunData, fed a newer then an older snapshot, gives status 'waiting', checkpoint 'open' and a retained run-finished event. Both verifiers reproduced the regression in the unmodified RunScreen in Chromium. Repo truth: RunScreen.tsx:82-87 re-arms the timer regardless of the in-flight request; :88-90 (visibility), :104 (after an answer) and :121 (after a control) each start another refresh. There is no abort or generation guard, although api.ts:22 get() accepts a signal. rundata.ts:21-27 takes next.view.run and next.view.checkpoints wholesale in arrival order. The catch at RunScreen.tsx:72-74 sets 'lost' from any request, and pollDelay returns null for ended runs (run.ts:19-23). So a late failure after a newer success leaves a permanent false 'byway is not answering' banner on a finished run; the reproducer is right, and the refuter's 'cleared by the next poll' is wrong for ended runs. Two parts of the review are refuted or overstated. Visible spend cannot go down, because meter.ts runSpend takes the max of the run record and the latest deduplicated cost event. A revived terminal run lasts at most one poll interval: the regressed status re-arms polling and the next full snapshot heals it, and server fencing (runner client.ts:101-107; api.ts resolveInRun 409s) refuses answers and controls on stale state. Event seq cannot serve as a revision: runner view() (client.ts:127-131) reads the run, then events and checkpoints, in separate statements, and the runner writes state before its event (human.ts:74-84). Torn reads within one response are not always transient: cancelRun, failRun and settleLostRun write the terminal status before withdrawing open questions (lifecycle.ts:131-141, lost-runs.ts:27-36), so a snapshot can read 'cancelled' with a question still 'open', after which polling stops. Today's UI already tolerates that tear (the YourTurn gate 'active && !ended', timeline.ts:245-246, run.ts liveQuestions), so the fix derives answerability from the whole snapshot and does not need a server revision.

**Severity rationale.** The display regression heals within one poll interval (1-3 s), nothing wrong can be persisted, and the meter is already monotonic. On loopback the reorder needs an older GET to outlast a POST plus a newer GET, which mostly happens with large open-checkpoint artifacts that are re-hashed on every poll. The lasting harms are a sticky false-offline banner on ended runs and, through F06, a stale snapshot that unmounts a just-opened panel and wipes typed text. F06's fix removes the second. On its own that makes this P3, not P2.

**Root cause.** Server snapshots reach the client (RunScreen, and Nav's waiting count in the same way) through several overlapping, uncancellable requests with no single owner of the request sequence. Each response is applied, and sets connection state, in arrival order. mergeRunData is right to treat a snapshot as authoritative; what is missing is control over which snapshot reaches it. Nothing ties 'the screen shows the most recent server state' to the request/response sequence that could guarantee it.


### Options


**A. The review's repair as written: server snapshot revision, client draft store, recommendation command** (fixes root cause: yes; effort XL; risk medium)

Add a monotonic per-run revision column in SQLite, bumped by every run update, checkpoint open/resolve/withdraw and event append, and returned as RunView.revision (a contracts change). runner.view() reads run, events and checkpoints in one read transaction. The client ignores snapshots older than the newest applied revision and adds single-flight and abort. Checkpoint-keyed drafts live above the panel boundary in sessionStorage and are cleared on acknowledgement. The recommendation retry becomes an explicit command whose result is applied atomically.


*Pros*
- Ordering is guaranteed by storage, independent of how requests are issued (multiple tabs, a future push channel, retries)
- A single-transaction view() also removes the 'run ended, question still open' tear at its source
- Matches the review's wording exactly

*Cons*
- A store migration plus a @byway/contracts RunView change, for a single-user loopback app where request causality already orders snapshots
- Every runner write path (lifecycle.ts, human.ts, emit, lost-runs settle, withdraw) must bump the revision in the same statement; one missed path gives false confidence
- The store interface change ripples through runner, CLI and test fixtures (apps/web/test/fixtures/runner.ts)
- Still needs all of option B's client work (draft ownership, command recovery, answerability from the whole snapshot for older stored runs)


**B. Screen-level state owners, client-side (three ownership rules, one shared correction)** (fixes root cause: yes; effort L; risk medium)

(1) Person-authored input: a pure view/drafts.ts (one starting-draft definition, dirtiness, answerability, settle rules) and a per-run external draft store owned by RunScreen, with a non-terminal lifecycle so StrictMode cannot kill it. Panels are semi-controlled: each seeds once from the store and writes through to it. The store is mirrored per checkpoint to sessionStorage through one guarded sessionSlot helper and settled only by server state. A 'sent' mark covers the gap between the POST and the confirming snapshot, and text left on a question that closed unanswered is shown read-only. The same helper keeps Recommendation examples (per intake) and Start attachments. (2) Polling: a pure view/refresh.ts sequencer owned by a useRefresher hook, one instance per key, created and disposed in a key-only effect (StrictMode-safe). Polls are single-flight and re-arm after they settle; actions supersede and abort; only the latest-issued request applies data or sets connection state; the initial snapshot goes through the same path; a lost connection is retried on any status. Used by RunScreen and Nav. (3) Recommendation: one owned state (rec, problem, selection, composed, remainingUsd) driven by pure transitions. Try again is an explicit idempotent ensure command ({ensure: true}). Each command returns what it changes, including the workspace remaining amount, and is applied in one transition. The screen never calls router.refresh(), whose server render can ask the model. No 'c4' fallback.


*Pros*
- Removes the wrong assumption at the boundary where it lives (each screen's top-level client component), everywhere it appears (Run, Nav, Recommendation, Start), without contracts, store, runner or workflow changes
- Ordering follows from request causality: with sequenced issue and latest-only apply, each applied snapshot was requested after the previous one arrived. The one tear that can persist (run ended, question still open) is neutralised by deriving answerability from the whole snapshot, as timeline.ts and the YourTurn gate already do
- Semi-controlled panels and an external store mean a keystroke never re-renders RunScreen, Timeline or Route, and a mounted panel never changes under the person (no clear-on-ack flash of initialText)
- Commands that return what they change mean the Recommendation screen never re-runs its impure server render, so no command can trigger an unrequested model call (probe: 0 extra advisor.recommend calls on compose during a failure, against 1 with a refresh)
- Reuses existing patterns: startDraft.ts sessionStorage, flip()'s atomic apply, api.ts get(signal), currentRecommendation as the ensure command
- Pure modules are unit-testable in the repo's node-only vitest; interactions go in Playwright, matching the repo's existing split
- Compatible with F03: the retry uses the idempotent ensure command F03 also wants

*Cons*
- Touches eight panel components (semi-controlled seed and write-through), so keyboard and focus behaviour needs e2e coverage
- Drafts survive inspection, reload and back navigation in the same tab, not a closed tab or another browser (a documented sessionStorage policy); Compare and Choose highlights are kept in memory only (UX-1)
- YourTurn renders one effect tick after hydration (it waits for the draft store to load), so the server HTML has no panel
- No storage-level revision; torn reads remain possible and are handled by the answerability rule, which the ADR states
- The Recommendation screen's remaining-budget figure updates on commands and navigation only; a change made in another tab shows after the next command (Start is still checked by the server)
- The F14 e2e needs a synthetic spend line (the mock provider costs nothing), so it runs in its own last Playwright project


**C. Minimal symptom patches** (fixes root cause: partly; effort S; risk medium)

Keep YourTurn mounted but hidden while StepDetail is shown, and gate its Mod+Enter shortcut while hidden. Add a key or a prop-sync effect on RecommendationView so new props reset rec and selection. Drop poll responses whose lastSeq is lower than the current one.


*Pros*
- Small diff; fixes the reproduced inspection path (row click, current-row toggle, Esc)
- No new modules

*Cons*
- Drafts are still lost on reload, back navigation, run end or withdrawal, and a stale-snapshot unmount; the draft's lifetime is still the mount
- Mod+Enter is global (useShortcuts.ts:44): a hidden panel would submit from StepDetail unless every panel's shortcuts are gated, a new failure mode
- A key or prop-sync on RecommendationView wipes examples, the composed selection and in-flight flips on any refresh; the 'c4' default and the impure-refresh retry remain
- Event seq does not order run and checkpoint fields (state is written before its event), so a seq comparison can still apply a regressed snapshot or drop a newer one; the late-failure banner is unaddressed


**D. Server owns everything: persisted drafts plus server revision** (fixes root cause: yes; effort XL; risk high)

Add a draft column on checkpoints with a debounced PATCH autosave endpoint, fenced to open checkpoints, and load drafts from the server on every render. Add the option-A snapshot revision and consistent reads. Make the recommendation retry a server command.


*Pros*
- Drafts survive closing the tab, a browser crash, and a second tab or device
- One authority for all state

*Cons*
- Largest change: contracts (CheckpointRecord.draft), a store migration, a new write endpoint guarded by Host/Origin, and autosave traffic on every keystroke
- Write-fencing races between autosave and resolution need their own design (they interact with F03/F07 resolution semantics)
- Over-engineered for a local single-user app, and diverges from the startDraft precedent
- Still needs every client change of option B for ordering, command recovery and panel ownership


### Recommendation: B

**Why.** Option B removes the shared wrong assumption (mount lifetime, one-time prop copies, impure re-renders and arrival order standing in for state ownership) at the one boundary where it lives, each screen's top-level client component. It covers every place the assumption appears: Run (F06, F15), Nav, Recommendation (F14, examples) and Start (attachments). It needs no contracts, store, runner or workflow change. For a local, single-user, loopback app, request causality already provides the ordering a server revision would: once refreshes are sequenced and only the latest-issued response may apply, each applied snapshot's server read happened after the previous applied response arrived. The one within-response tear that can stick (a terminal run status read before its questions are withdrawn, after which polling stops) is handled by deriving answerability from the whole snapshot, as the UI already does for YourTurn and the timeline; the draft rules now do it too. On the Recommendation screen, commands return everything they change, including the workspace remaining amount, so the screen never re-runs its server render, which asks the model while no recommendation is stored (page.tsx:48). Scratch simulations ground the design, all under C:/Users/arvik/AppData/Local/Temp/byway-review-verify/. Ordering: design-D/design-probe.out.json (stale-after-newer applies only the newer; a late failure leaves 'ok'; overlapping polls make one fetch; today's mergeRunData does regress). Ownership and settling: revise-D-r1/revise-probe.out.json (a runId-keyed owner effect plus a delay-keyed timer effect keeps applying across running->waiting->running, normally and under StrictMode double setup; the settle rules, run with the repo's real emptyDraft, toResolution and on-screen parser, drop a sent or lost-response draft, show a torn-terminal or withdrawn draft as unsent, and treat untouched on-screen copy as clean). Recommendation commands: revise-D-r2/rec-commands-probe.out.json (against the real api.ts, a re-render after compose during a failure adds 1 advisor.recommend call; with commands only, compose adds 0, the first ensure adds 1 and returns the stored recipe with the raised remaining amount, a second ensure adds 0). Draft-store lifecycle: revise-D-r2/draftstore-lifecycle.out.json (a terminal cleanup under StrictMode setup-cleanup-setup loses every later write; flush-only cleanup keeps the debounced and pagehide writes). Option A's revision guards only against tears the answerability rule already neutralises, at the cost of a migration and a contracts change, so it is recorded as a revisit trigger, not built. Option C leaves reload, back-navigation, run-end and stale-unmount loss in place and adds a hidden-panel Mod+Enter hazard. Option D is disproportionate. Ship in two slices under one ADR: slice 1 is the Run screen (F15 sequencer, then F06 drafts, plus Nav); slice 2 is Recommendation and Start (F14 command recovery, examples, attachments).

**Design.** OWNERSHIP RULES (recorded in the ADR; each module below implements one)
- R1, person-authored input: keyed by its server identity, held above every conditional render, kept for the tab session through one guarded helper, and settled only by server state.
- R2, server state: a screen is seeded by its server render on navigation. After that its server state changes only through the latest-issued poll (Run, Nav) or an explicit command's result, applied in one transition. A command returns everything it changes that the screen shows. A screen re-runs its server render (router.refresh()) only where that render is a pure read (Settings' is; the Recommendation page's is not while no recommendation is stored, because page.tsx:48 then asks the model, F03). No client-invented defaults.
- R3, answerability: derived from the whole snapshot. A question is answerable when cp.status === 'open' AND !isEnded(run.status), the same rule as timeline.ts:245-246 and run.ts liveQuestions.

SLICE 1: RUN SCREEN (F15, F06) AND NAV

1) apps/web/src/view/refresh.ts (new, pure). createRefresher<T>({ fetch(signal), apply(data), status('ok'|'lost') }) returns { poll, now, dispose }.
- now() bumps a generation counter, aborts the previous AbortController and issues a fetch. A result is applied, and 'ok' set, only if its generation is still the latest issued and the instance is not disposed. An error sets 'lost' under the same condition, and never for a request this instance aborted itself.
- poll() returns the in-flight promise if there is one, otherwise calls now().
- dispose() aborts and makes this instance inert. It is terminal for this instance only; the owner creates a new one.

2) apps/web/src/components/useRefresher.ts (new hook). useRefresher(key, fetch, apply, status) holds the latest callbacks in refs.
- One effect, keyed only on [key], creates the refresher, stores it in a ref, calls now() once (so the server-rendered initial snapshot, including a stale back/forward router-cache payload, is superseded through the ordered path) and disposes that same instance in its own cleanup. Under StrictMode, setup-cleanup-setup leaves a fresh live instance.
- It returns a stable handle { poll(), now() } that delegates to ref.current.
- RunScreen uses it with key = runId: fetch = (signal) => get<RunData>(`/api/runs/<id>?after=${lastSeq(latest.current)}`, signal); apply = setData(prev => mergeRunData(prev, next)); status = setConnection. mergeRunData is unchanged; its 'latest snapshot wins' is now true.
- The timer is a separate effect keyed on [delay], with delay = connection === 'lost' ? 3000 : pollDelay(run.status), so a lost connection is retried even on ended runs and the banner clears. The effect has a local cancelled flag. Each tick skips the poll while the tab is hidden (as RunScreen.tsx:84 does today), otherwise awaits handle.poll(), and re-arms only if !cancelled. Its cleanup sets cancelled and clears its own timer; it never disposes the refresher.
- visibilitychange calls poll(); resolve() and control() await now().
- Nav.tsx uses the same hook (key = pathname, fetch /api/waiting, 5 s, re-armed after settling), which removes the last arrival-order poller.

3) apps/web/src/view/drafts.ts (new, pure).
- startingDraft(cp): the one definition of an untouched panel. It is emptyDraft(cp), except that a write checkpoint whose initialText parses as on-screen copy gets items = the field values and text = serializeOnScreenCopy(fields).
- isDirty(cp, d) compares toResolution(cp, d) with toResolution(cp, startingDraft(cp)), so whitespace-only directive rows and untouched on-screen copy are clean.
- answerable(cp, runStatus) implements R3.
- persisted(kind): write, react, directive, pick and select (pick and select are deliberate Space/click toggles). Compare and Choose highlights are set by moving or flipping; restoring them after a reload would let a stray Enter keep a version the person only looked at, which UX-1 forbids, so they stay in memory. Confirm has no draft.
- sanitize(cp, stored): an entry is restored only when id and kind match; choice is limited to cp.options ids, and to picksNeeded for pick; items must be strings.
- settle(entry, cp, runStatus) returns: 'keep' if answerable and not sent; 'unlock' if answerable and sent (server state wins); 'drop' if the checkpoint is missing or the entry was sent; 'drop' if cp.status is 'resolved' and cp.resolution equals toResolution(cp, entry.draft) (the answer landed but the response was lost, or the person reloaded mid-POST); 'unsent' if it is a text kind (write/react/directive) and dirty; otherwise 'drop'.
- encode/decode: { v: 1, kind, draft, sent? }; garbage or an unknown version gives null.

4) apps/web/src/components/sessionSlot.ts (new, client). sessionSlot<T>(key, decode) returns { load, save, clear }, plus keysWithPrefix(prefix). It uses a { v: 1, value } envelope, wraps every access in try/catch, and treats a quota failure as 'not kept'. It is the one session-draft helper used by 5, 9 and 10.

5) apps/web/src/components/run/draftStore.ts (new, client). createDraftStore(runId) is an external store, one per RunScreen mount (RunScreen remounts per run). Its in-memory Map is keyed by the full checkpoint id ('<runId>/cpN-<stepId>', interpreter.ts:247).
- The constructor has no side effects (no storage read, listener or timer), so the instance that StrictMode's double-invoked useState initializer discards is harmless.
- load(): idempotent (a loaded flag). After hydration it reads every 'byway.draft.<runId>/' key once, sets ready and notifies.
- attach(): registers pagehide -> flush() and returns a detach function.
- flush(): writes pending debounced entries at once and clears their timers. The store stays fully usable afterwards. There is no terminal dispose: an unmount (or StrictMode's simulated one) only flushes and detaches, and the next setup re-attaches.
- get(cp): the sanitised saved draft, or startingDraft(cp).
- put(cp, draft): updates memory at once, and deletes a clean draft. Persisted kinds are written to their own key 'byway.draft.<checkpointId>', debounced at 400 ms. put does not notify, so a keystroke never re-renders RunScreen, Timeline or Route.
- markSent(id): sets sent, saves at once, notifies.
- settle(checkpoints, runStatus): applies drafts.settle to every entry ('unlock' clears sent; 'drop' removes the entry from memory and storage) and notifies on change.
- unsent(checkpoints, runStatus), discard(id), isSent(id), subscribe and version for useSyncExternalStore.

6) Panels become semi-controlled. PanelProps gains draft: CheckpointDraft (the seed) and onDraft(next).
- Each answering panel (TextWrite, React, OnScreenCopy, Pick, Select, Directive, Compare, Choose) initialises its local state once from draft in a useState initializer and calls onDraft on every change. Confirm is unchanged.
- A mounted panel never re-reads the store, so nothing can change what it shows. This removes the clear-on-ack flash, Directive key drift (its local keys are created once from draft.items) and any need to resync Compare's flip state.
- Compare and Choose map choice <-> index. OnScreenCopy takes labels and separators from parseOnScreenCopy(cp.initialText) and values from draft.items when the lengths match.
- Presentational state stays local and is never persisted: focus index, hint, compare mode, flip position, and Compare's per-turn script opt-in (usePageScripts, SEC-4).
- TurnFooter gains sent: the button reads 'Sent' and is disabled; panels' submit already returns early while busy.

7) RunScreen wiring.
- const [store] = useState(() => createDraftStore(runId)); useSyncExternalStore(store.subscribe, store.version, store.version). The third argument (getServerSnapshot) is required because RunScreen is server-rendered: without it React throws 'Missing getServerSnapshot' during SSR (string present in react-dom 19.3.0's server build). version is 0 until load(), which runs in an effect, so server HTML and hydration agree.
- One effect keyed on [store]: store.load(); const detach = store.attach(); cleanup: store.flush(); detach(). An effect keyed on [checkpoints, run.status] calls store.settle(...) after each applied snapshot.
- The turn is active && answerable(active, run.status). YourTurn is rendered only once store.ready (one effect tick after hydration, so no SSR mismatch), keyed by cp.id, with draft={store.get(cp)}, onDraft={(d) => store.put(cp, d)}, busy={busy || store.isSent(cp.id)} and sent={store.isSent(cp.id)}.
- resolve(): post(...); store.markSent(id); await handle.now(). If that refresh fails, the panel stays locked with the person's own words while the banner shows and polling retries every 3 s; the next applied snapshot settles it. A POST failure leaves the store untouched (the draft is kept, as today).
- error becomes { checkpointId | 'control', message }, and a resolution error is shown only while its checkpoint is the turn, so a 409 for one question no longer sits above the next.
- A 'Your unsent words' block sits at the top of the work area whenever store.unsent(...) is non-empty, above whatever the slot shows. It has the prompt, the read-only text, Copy and Discard, and never a send control.
- StepDetail still replaces Your turn visually; that is now harmless.

SLICE 2: RECOMMENDATION (F14) AND START

8) apps/web/src/view/recommendation.ts (new, pure). RecState = { rec: Recommendation | null; problem: string | null; selection: Selection | null; composed: ComposeView | null; remainingUsd: number }.
- initialRecState(props): selection = chosen ?? rec?.recipeId ?? null (no 'c4'); remainingUsd from the initial prop.
- recovered(state, { recommendation, remainingUsd }): rec set, problem cleared, remainingUsd replaced; a composed selection is kept, otherwise the selection becomes the recipe.
- rerouted(state, { recommendation, remainingUsd }): flip's current semantics plus remainingUsd.
- composedReady(state, { composed, remainingUsd }): composed set, selection becomes composed, remainingUsd replaced; rec and problem untouched.
- retryFailed(state, message); selected(state, selection).
- screen(state, chosenRecipeId): 'failed' only when there is no rec, no library pick and no selection; 'proposal' when the selection resolves to an option; otherwise 'unavailable'.

9) RecommendationView owns RecState in one useState(() => initialRecState(props)) that is never re-seeded from props, and it no longer calls router.refresh() (useRouter stays for router.push on Start). The remaining props (the intake's problem text and attachments, chosenRecipeId, options, questions, demo) cannot change during the screen's life; a comment says so. page.tsx keys RecommendationView by `${intakeId}:${chosenRecipeId ?? ''}`, the identity of the owned state; it is constant while the screen is shown.
- Commands: retry() POSTs /recommend { ensure: true } -> recovered; flip() POSTs /recommend { answers } -> rerouted; compose() POSTs /compose -> composedReady. Each applies its result in one transition. On failure: retryFailed (retry), flip restores its optimistic answers and shows the error (as today), compose shows the error (as today).
- Server: schemas.ts adds RecommendInput = AnswersInput | { ensure: true } (strict; {} is still a 400). api.ts gains workspaceRemaining(deps), the two lines page.tsx:53-54 and startRun (api.ts:159-160) repeat today, and uses it in page.tsx, startRun and the two commands. recommendCommand(deps, id, input) returns { recommendation, remainingUsd }: { ensure: true } calls currentRecommendation (idempotent when called in sequence; it returns the stored recommendation or makes and stores one), { answers } calls recommendIntake as today. composeCommand(deps, id) returns { composed: composeIntake(...), remainingUsd }. The remaining amount is read after the command, so it includes the command's own spend. The routes call these, and their doc comments name both recommend commands. RecommendationView is the only caller of either route (grep), so wrapping the responses is internal to apps/web. Deduplicating against a concurrent first GET render is F03's operation-identity work.
- retry() keeps a busy flag; on success it posts the notice 'Now recommending X.' and moves focus to #proposal-title.
- Try again is also offered in the aside while rec is null and a problem is recorded, so a composed selection does not remove the only retry.
- 'Your choice' now appears only for an alternative the person picked.
- Examples: still owned here, mirrored to sessionSlot 'byway.examples.<intakeId>' (text {text}; image {name, artifactId}, since images are already stored artifacts). Loaded after hydration only if the current list is empty, and cleared in onStarted next to clearStartDraft(). Examples.tsx derives its next key from max(existing keys) + 1, so restored entries cannot collide with new ones.
- The run budget field is not kept: it is a suggestion derived from the estimate and the workspace figure, which a Settings change may have made obsolete.

10) Start attachments: startDraft.ts keeps 'byway.start-draft' as the plain string it is today (no format migration) and gains saveStartAttachments/loadStartAttachments on sessionSlot 'byway.start-attachments' ([{ name, text }], within the existing 5 x 200k bounds). clearStartDraft clears both. StartForm restores attachments after hydration with fresh keys and nextKey = count + 1.


**Steps**
1. 1. ADR at the next free product number when merged (0081 at b33f128 if no other cluster lands first), 'Web client state ownership'. It records R1-R3. (a) Checkpoint drafts are owned by the Run screen, keyed by checkpoint id, kept for the tab session (text kinds plus pick and select; Compare and Choose highlights in memory only, because of UX-1), and settled only by server state: a confirming snapshot, or a stored resolution equal to the draft. A 'sent' mark covers the window between the POST and that snapshot. Text left on a question that closed unanswered is recoverable read-only. Client-side owners have non-terminal lifecycles or are created per effect setup, because StrictMode runs setup-cleanup-setup in development. (b) Snapshots apply only from the latest-issued request: single-flight polls, actions supersede, the initial snapshot is re-read, one refresher instance per key is owned by a key-only effect, connection state follows the latest request only, and a lost connection is retried on any status. (c) After its navigation render, a screen's server state changes only through the latest poll or a command's result applied in one transition. A command returns everything it changes that the screen shows (for Recommendation, the workspace remaining amount too). router.refresh() is used only where the page's server render is a pure read; the Recommendation page's is not while no recommendation is stored (F03). POST /recommend {ensure:true} is the idempotent ensure command, and there are no client-invented defaults. (d) Answerability is derived from the whole snapshot. (e) Recommendation examples and Start attachments follow R1. (f) No server snapshot revision for now: request causality covers ordering, and R3 covers the one tear that can stick (a terminal status written before withdrawal). Revisit triggers: push/SSE, multi-tab shared state, or a tear R3 does not cover. Cite spec section 5, ADR-0042 and ADR-0071; supersede nothing.
2. SLICE 1 starts here. 2. F15 tests first. apps/web/test/refresh.test.ts drives createRefresher with controllable promises: stale-after-newer applies only the newer; a late failure after a newer success leaves 'ok'; poll() during an in-flight request makes no second fetch; now() aborts the older signal, and that aborted request never sets status; the newest request failing sets 'lost'; dispose() blocks applies; a new instance created after dispose() for the same run applies normally (StrictMode remount). Then implement view/refresh.ts and components/useRefresher.ts.
3. 3. F15 wiring. Replace refresh and the poll effect in RunScreen.tsx with useRefresher plus the separate delay-keyed timer effect (local cancelled flag, hidden-tab skip, re-arm after settle, delay = lost ? 3000 : pollDelay); resolve and control await now(). Move Nav.tsx onto the same hook. Add apps/web/e2e/state.spec.ts, run in demo. (a) page.route holds one GET /api/runs/<id>?after=... while the person answers a confirm or write turn; the post-answer GET goes through; then the held route is released with fulfill, and in a second case aborted after the run is Done (wrap route.fulfill/abort in try/catch, since the client may already have cancelled it). Assert that no answered 'Your turn' reappears, the status never moves back, and 5 s later there is no 'byway is not answering' banner. (b) The post-answer GET fails once: the banner appears, then clears, and the run still reaches Done. (c) The screen keeps applying snapshots across running->waiting->running (a step label appears after the first answer).
4. 4. F06 tests first. apps/web/test/drafts.test.ts: startingDraft (untouched on-screen copy is clean although serialize(parse(initialText)) differs from initialText; a blank directive row is clean); sanitize (other id or kind gives nothing; choice limited to option ids and to k); persisted() per kind; the full settle() table (keep; unlock when sent and still open; drop when sent and closed; drop when the stored resolution equals the draft; unsent when withdrawn, answered elsewhere, or the run ended with the question still listed open; drop when clean); decode tolerates garbage and an unknown version. apps/web/test/draft-store.test.ts with a stubbed Storage: per-checkpoint keys; prefix load; load() called twice reads once; a debounced write flushed by flush() and by the pagehide handler; put() after flush() and a re-attach still persists (StrictMode setup-cleanup-setup); a quota failure keeps memory only; put() does not notify; the constructor reads no storage. Then implement view/drafts.ts, components/sessionSlot.ts and components/run/draftStore.ts.
5. 5. F06 implementation. Add draft/onDraft to PanelProps and convert the eight answering panel components to seed-once plus write-through, keeping presentational state local. Add sent to TurnFooter and YourTurn. Wire RunScreen: the store via useState, useSyncExternalStore with getServerSnapshot, the [store] effect (load, attach; cleanup flush, detach), the settle effect, YourTurn gated on store.ready, markSent before now(), the checkpoint-keyed error, and the unsent block. Update the panels.test.ts render helper to pass draft = startingDraft(cp) and a no-op onDraft, so the existing starting-state assertions (nothing chosen, UX-1) still hold.
6. 6. F06 e2e in apps/web/e2e/state.spec.ts. Answer turns with the flow.ts helpers until a write turn is open, then type a sentinel. Open an earlier timeline step and click 'Back to your turn': the sentinel is still in the editor. Repeat via Esc, via clicking the current row twice, via page.reload(), and via History then browser Back. Send: the intercepted POST body text equals the sentinel; when the run moves on, sessionStorage has no 'byway.draft.<checkpointId>' key. Add the same inspection round trip for directive items and for a pick or select selection (also across reload), and for a compare highlight (kept across inspection, not across reload). The first POST answered with 500 keeps the draft and resending succeeds. A successful POST whose refresh is failed by page.route: the editor never shows the model's initialText, the button reads 'Sent' and is disabled, and the turn settles once the connection is back. Type, then cancel the run: a read-only 'Your unsent words' block shows the sentinel, with Copy and Discard and no send button. Run once by hand against `pnpm dev` (StrictMode): spec 3(c) (polling across running->waiting->running) and the draft round trip (type, inspect, back, reload, send); record both in the PR.
7. SLICE 2 starts here. 7. F14 tests first. apps/web/test/recommendation.test.ts: initialRecState with no recommendation and no library pick gives selection null (no 'c4'); recovered() selects the stored recipe, clears the problem and replaces remainingUsd; recovered() keeps a composed selection; composedReady() replaces remainingUsd and leaves rec and problem as they were; screen() is 'failed' only with no rec, no pick and no selection; retryFailed() keeps the panel with the new message; rerouted() after recovered() follows the new recipe. In api.test.ts: after a rate-limited first recommendationOrProblem, recommendCommand(deps, id, {ensure:true}) returns and stores the recommendation with remainingUsd, and a second call returns the stored one with the advisor spy called once in total; composeCommand during a failure calls advisor.recommend zero times, stores no recommendation and returns remainingUsd; workspaceRemaining reflects a raised cap; RecommendInput accepts { ensure: true } and { answers } and rejects {}.
8. 8. F14 implementation. Add RecommendInput, workspaceRemaining, recommendCommand and composeCommand, and point the two routes at them. Use workspaceRemaining in page.tsx and startRun. Add view/recommendation.ts; rework RecommendationView to one owned state with retry/flip/compose commands and no router.refresh(); key it in page.tsx by intakeId and chosenRecipeId; remove the 'c4' fallback; let the gate yield to a composed selection; add Try again to the aside while rec is null and a problem is recorded.
9. 9. F14 e2e in apps/web/e2e/recovery.spec.ts, in its own Playwright project. playwright.config.ts: the 'chromium' project gains testIgnore: /recovery\.spec\.ts/ (today it has no testMatch, so it would also run the spec early on the shared workspace), and a new 'recovery' project has testMatch: /recovery\.spec\.ts/ and dependencies: ['chromium'], so it runs last (and is skipped if chromium fails). The spec skips when BYWAY_E2E_DATA_DIR is unknown (external BYWAY_E2E_BASE_URL mode). It reads the original cap from the Settings page's budget field, appends one synthetic $1 spend line through the Ledger class (packages/gateway/src/ledger.ts, which holds the lock and head; never raw file writes) and sets a $0.01 cap through PATCH /api/settings. Scenario A: open a fresh intake and see the failure panel; click Try again with the cap still low (the panel stays, with the new message); raise the cap through PATCH /api/settings and click Try again. Then #proposal-title shows the stored recommendation, 'How byway decided' and 'Why this recipe' are visible, 'left in your workspace' shows the raised figure, flipping a chooser answer re-routes, and the intercepted Start POST (aborted after capture) carries the shown recipeId. Scenario B: set the cap low again, open a fresh intake (failure), raise the cap, click Build my own: the composed proposal is shown, Try again is still offered in the aside, and no RSC request for /recommend/<id> is issued (page.on('request') filtered on that path and the rsc header), so nothing asks the model behind the person's back; Try again then recovers while the composed selection stays, and 'Back to the recommendation' shows the stored recipe. Restore the original cap in finally.
10. 10. Same-pattern instances. Unit-test sessionSlot (envelope, garbage, quota failure) and the examples and attachments codecs. Implement the examples mirror in RecommendationView, max+1 keys in Examples.tsx, and Start attachments in startDraft.ts and StartForm.tsx. Add an e2e step in recovery.spec.ts or state.spec.ts: add a pasted-text example, go to Settings, come back: the example is still listed; starting the run clears it.
11. 11. Docs. Add docs/backlog.md 'Product follow-ups' rows for: a server snapshot revision and consistent view() reads (the ADR's triggers); concurrent first-recommendation dedupe and moving the first recommendation off the GET render (F03), after which the Recommendation page's render becomes a pure read; and per-poll re-reading and re-hashing of open-checkpoint artifacts (an efficiency item that also widens reorder windows). Add one line to spec section 5 (Run): your unsent answer is kept while you look at earlier steps and across a reload or Back in this tab, and words left on a question that closed are shown so you can copy them.


**Acceptance tests**
- e2e (fails today): a write turn's typed text survives opening an earlier step and 'Back to your turn', and also Esc, clicking the current row twice, a page reload, and History then browser Back. The sent POST body carries the person's text, never cp.initialText.
- e2e (fails today): directive items and a pick/select selection survive the timeline round trip and a reload; a compare highlight survives inspection but not a reload (UX-1).
- e2e (fails today): after a successful POST whose follow-up refresh fails, the turn shows the person's words locked as 'Sent', never the model's initialText, and settles when the connection returns; afterwards sessionStorage has no draft key for that checkpoint.
- e2e (fails today): after the run is cancelled with an unsent write draft, the Run screen shows that text read-only with Copy and Discard and no way to send it.
- e2e (regression, passes today and must keep passing): a draft survives polling, and a POST answered with 500 keeps the draft and shows the error.
- unit (new): drafts.ts never restores a saved draft into a different checkpoint id or kind and drops option ids the checkpoint does not offer; untouched on-screen copy is clean; a draft whose stored resolution matches is settled as sent, not 'unsent'; a terminal run with a question still listed open yields 'unsent', not 'keep'.
- unit (new): draftStore writes one key per checkpoint, debounced and flushed by flush() and on pagehide; load() is idempotent; the store keeps persisting after a flush-and-reattach cycle (StrictMode setup-cleanup-setup); a quota failure keeps memory only; put() does not notify.
- manual under `pnpm dev` (StrictMode), recorded in the PR: polling keeps applying across running->waiting->running, and the draft round trip (type, inspect, back, reload, send) works.
- e2e (fails today): with one GET held back and released after the post-answer refresh, the answered question never reappears and the status never moves from Done back to Your turn.
- e2e (fails today): an older poll failing after a newer success on a finished run leaves no 'byway is not answering' banner; a genuinely failed latest refresh shows the banner, and it clears once polls succeed, even on an ended run.
- unit (new): refresh.ts applies only the latest-issued response, makes one fetch for overlapping polls, sets connection state only from the latest-issued non-aborted request, and a fresh instance after dispose() works (StrictMode remount).
- e2e: the Run screen keeps applying snapshots across running->waiting->running.
- e2e (fails today): budget failure, raise the cap, Try again, without a reload: the stored recommendation's title, 'Why this recipe' and 'How byway decided' are shown, 'left in your workspace' shows the raised figure, a later chooser flip re-routes, and Start posts the shown recipeId (not 'c4').
- e2e (fails today): Build my own while the failure panel is shown displays the composed proposal with Try again still offered, and issues no RSC request for the /recommend page; a failed second Try again keeps the failure panel with the new message.
- unit/server (fails today; {} is a 400 and there is no ensure command at b33f128): recommendCommand {ensure:true} returns the stored recommendation and remainingUsd and calls the advisor at most once across repeated sequential calls; composeCommand during a failure makes zero advisor.recommend calls; {} is still rejected.
- e2e (fails today): a pasted example on the Recommendation screen survives a trip to Settings and back, and is cleared once the run starts.
- config: `playwright test --list` shows recovery.spec.ts only under the 'recovery' project.


**Compatibility.** - No @byway/contracts, store schema, migration, runner, workflow or recipe change, so Temporal replay of persisted histories (ADR-0078) and recipe hashes are unaffected.
- POST /api/intakes/:id/recommend accepts a second explicit body, { ensure: true }; an empty body is still a 400. Both recommend responses become { recommendation, remainingUsd }, and POST /api/intakes/:id/compose returns { composed, remainingUsd }. RecommendationView is the only caller of either route, so the change is internal to apps/web; no CLI or package uses them.
- RecommendationView no longer calls router.refresh(), so no action on the Recommendation screen re-runs its server render. The render still makes the first recommendation on navigation, as today (F03 owns moving that).
- The workspace remaining figure on the Recommendation screen now updates from each command's result and on navigation. A change made in another tab shows after the next command; startRun still checks the real figure on the server.
- page.tsx keys RecommendationView by intakeId and chosenRecipeId. Both are fixed while the screen is shown, so the key never changes during its life.
- PanelProps is internal to apps/web; the panels.test.ts helper needs updating.
- YourTurn now renders one effect tick after hydration, so the server HTML no longer contains the panel. Answering needs JS anyway.
- New sessionStorage keys: 'byway.draft.<checkpointId>', 'byway.examples.<intakeId>' and 'byway.start-attachments', all versioned, per tab, and read through guarded access. 'byway.start-draft' is unchanged (no migration).
- Environments without sessionStorage degrade to drafts kept for the life of the Run screen mount. That still covers inspection and stale unmounts, because the store sits above the slot.
- Development (StrictMode) and production behave the same: the refresher is created per effect setup, and the draft store has no terminal cleanup.
- The Playwright suite gains state.spec.ts and a last-running 'recovery' project (chromium gets a testIgnore for it). The project leaves one synthetic $1 ledger line in the suite's temp data dir and restores the cap.
- F03 compatibility: the retry already uses the ensure command. When F03 moves the first recommendation off the GET render, the page can render a pending state and call the same command on mount, and router.refresh() becomes safe there.

**ADR.** Yes: one new product ADR, 'Web client state ownership', numbered when merged (0081 at b33f128 unless another cluster's ADR lands first). It records R1-R3 and the following decisions. The draft lifetime and persistence policy: tab session; which kinds persist and why (UX-1); settled only by server state; the 'sent' window; read-only recovery when a question closes. The ordered-apply rule and refresher ownership: one instance per key, owned by a key-only effect, with client owners StrictMode-safe (created per setup, or non-terminal cleanup). The command rule for screen state: a command returns everything it changes that the screen shows; router.refresh() only where the server render is a pure read, which excludes the Recommendation page while F03 stands; no client-invented defaults. The same-pattern coverage of Recommendation examples and Start attachments. And the deliberate decision not to add a server snapshot revision yet, which must say honestly that view() can tear (a terminal status written before withdrawal), that R3 is the guard, and what the revisit triggers are. It supersedes nothing; it extends spec section 5 and the Recommendation screen of ADR-0042 and ADR-0071.


**Deliberately not doing**
- No server snapshot revision column, RunView.revision contract field or single-transaction view read. Request sequencing makes applied snapshots monotone, and R3 handles the one tear that can stick. Recorded in the ADR and backlog with revisit triggers.
- No server-side draft persistence or autosave endpoint. Drafts last for the tab session, like startDraft.ts. A closed tab or a crash loses unsent text, and the ADR says so.
- No persistence of Compare or Choose highlights across reload: moving or flipping sets them, and UX-1 forbids a stray Enter keeping a version the person only looked at.
- No persistence of the Recommendation run-budget field: it is a suggestion recomputed from the estimate, and the Settings detour may have changed what is affordable.
- No router.refresh() on the Recommendation screen, not even after a successful command: its server render asks the model while no recommendation is stored (page.tsx:48). Commands return what they change instead.
- No polling of workspace spend on the Recommendation screen: a change made elsewhere shows after the next command or navigation, and Start is checked on the server (startRun budgetProblem).
- No conditional 'refresh only when a recommendation is stored' rule: it would tie the client to the server render's side effects instead of removing the need to re-render.
- No beforeunload or 'discard changes?' prompts: drafts are kept, so there is nothing to warn about.
- No change to the single-view work-area layout (StepDetail still replaces Your turn visually), and no hidden-but-mounted panel, which would leak the global Mod+Enter.
- No fully controlled panels: a mounted panel seeds once and never re-reads the store, so nothing can change under the person.
- No status-specific guards in mergeRunData (for example 'never leave a terminal status'): that patches the symptom and leaves pause, question and error states exposed.
- No deduplication of a concurrent first GET render against the ensure command, and no move of the first recommendation off GET: both belong to F03's operation-identity design.
- No prop-sync effect on RecommendationView, and no key that changes during the screen's life: either would wipe examples, the composed selection or in-flight flips.
- Per-poll artifact re-hash cost: out of scope; it goes to the backlog as an efficiency item.
- No new DOM unit-test environment (jsdom or testing-library): pure modules in vitest plus Playwright, as the repo already does.


**How it resolves each finding**
- **F06:** Fixed at the root by slice 1, steps 4-6. Drafts move from panel useState to a Run-screen-owned external draft store keyed by checkpoint id (view/drafts.ts, draftStore.ts). The store's constructor has no side effects and its cleanup only flushes, so StrictMode cannot leave it dead. Persisted kinds (write, react, directive, pick, select) are mirrored per checkpoint to sessionStorage through the shared sessionSlot helper; Compare and Choose highlights stay in memory (UX-1). Panels are semi-controlled: they seed once from the store and write through, so a mounted panel never changes under the person and keystrokes do not re-render the screen. One startingDraft definition, aware of on-screen copy, decides what is dirty. Drafts are settled only by server state. A successful POST marks the entry 'sent' and locks the turn with the person's own words until the next applied snapshot; a closed question whose stored resolution equals the draft is settled silently. Text left on a question that closed unanswered, including a terminal run whose question is still listed open, is shown read-only with Copy and Discard and can never be sent. Inspection (row click, current-row toggle, Esc), reload, back navigation, run end and stale-snapshot unmount all restore the person's own draft, so the model's initialText can no longer stand in for discarded edits. The same rule and helper keep Start attachments (slice 2, step 10). Polling and failed-submit preservation stay as regression tests.
- **F14:** Fixed at the root by slice 2, steps 7-9. RecommendationView owns rec, problem, selection, composed and the workspace remaining amount in one state driven by pure transitions (view/recommendation.ts) and never re-seeds it from props. Try again becomes the explicit command POST /recommend {ensure: true}, served by currentRecommendation (idempotent when called in sequence). flip() and compose() are commands too. Every command returns what it changes, the recommendation or composed view plus remainingUsd read after the command, and is applied in one transition, as flip() already does for its recipe. The screen no longer calls router.refresh(), so no action re-runs the page's server render, which asks the model while no recommendation is stored. Compose during a failure therefore makes no hidden recommend call (probe: 0, against 1 with a refresh), and 'left in your workspace' shows the raised cap after recovery. The hard-coded 'c4' fallback is removed, so no default is ever labelled 'Your choice' or sent by Start. The failure gate yields to a composed selection, Try again stays available in the aside, and a deliberate composed choice survives recovery. The same screen's 'Examples you admire' are kept per intake for the tab session (step 10).
- **F15:** Fixed at the root, client-side, by slice 1, steps 2-3. A pure refresh sequencer (view/refresh.ts) makes timer and visibility polls single-flight, and lets answer and control refreshes supersede and abort older requests. Only the latest-issued, non-aborted request may apply a snapshot or set connection state. useRefresher owns one instance per run in a runId-keyed effect, so StrictMode and status-driven delay changes cannot dispose it. A separate delay-keyed timer effect re-arms after each poll settles and skips hidden tabs. The server-rendered initial snapshot is re-read through the same path. Polling continues while the connection is lost, even on ended runs, so a false-offline banner cannot stick. mergeRunData is unchanged; its 'latest snapshot wins' becomes true. Answerability is derived from the whole snapshot (R3), which covers the one within-response tear that can stick. Nav's waiting count uses the same hook. Spend was already monotone (meter.ts runSpend), and server fencing stays as it is. A server revision is recorded as a revisit trigger, not built.


**Changes forced by the adversarial rounds (last round)**
- ACCEPTED, with a different fix from the minimal one (final-check mustFix 1, BLOCKING): router.refresh() after compose during a failure makes an unrequested paid advisor.recommend call. Verified: page.tsx:48 calls recommendationOrProblem whenever no library recipe is chosen; currentRecommendation (api.ts:92-95) falls through to recommendIntake when nothing is stored; composeIntake stores only `composed` (api.ts:122-127). My own probe against the real api.ts (revise-D-r2/rec-commands-probe.out.json) shows the refresh adds 1 recommend call. The minimal fix (refresh only when rec or chosenRecipeId is set) would leave the client depending on the server render's side effects. Instead R2 now says that a command returns everything it changes that the screen shows, and that router.refresh() is used only where the page's render is a pure read (Settings' is; this page's is not while F03 stands). recommendCommand and composeCommand return remainingUsd, read after the command, alongside the recommendation or composed view. remainingUsd becomes owned state, updated in the same transition. RecommendationView never calls router.refresh(). The probe shows compose adds 0 recommend calls, the first ensure 1 (returning the raised remaining amount) and a second ensure 0. The R2, ADR, compatibility, option B and F14 text no longer claims that a refresh is free. Added: a server test that composeCommand during a failure calls advisor.recommend zero times, and an e2e assertion that Build my own during the failure issues no RSC request for the /recommend page. page.tsx keys RecommendationView by intakeId and chosenRecipeId, so the owned state's identity is explicit; the key is constant while the screen is shown.
- ACCEPTED (final-check mustFix 2): the draft store's lifecycle under StrictMode is now specified. The constructor has no side effects, so the instance StrictMode's double-invoked useState initializer discards is harmless. load() is idempotent. attach() registers pagehide and returns a detach. The [store] effect's cleanup is flush() plus detach(), never a terminal dispose, so setup-cleanup-setup leaves a working store. Scratch sim revise-D-r2/draftstore-lifecycle.out.json: a terminal cleanup loses every later write (null after debounce and pagehide); the flush-only cleanup keeps both. Added unit cases (load twice reads once; put after flush and re-attach persists; the constructor reads no storage) and extended the manual `pnpm dev` check to the draft round trip.
- ACCEPTED (final-check mustFix 3a): RunScreen is server-rendered, so useSyncExternalStore needs getServerSnapshot. Verified: 'Missing getServerSnapshot, which is required for server-rendered content' is in react-dom 19.3.0's server build. The design now passes store.version as both getSnapshot and getServerSnapshot. version is 0 until load() runs in an effect, so server HTML and hydration agree.
- ACCEPTED (final-check mustFix 3b): verified that playwright.config.ts has one 'chromium' project with no testMatch or testIgnore, so recovery.spec.ts would run inside it, early and on the shared workspace. Step 9 now adds testIgnore: /recovery\.spec\.ts/ to chromium and testMatch plus dependencies: ['chromium'] to the 'recovery' project, with a `playwright test --list` check. Noted that a chromium failure skips the recovery project. The spec reads the original cap from the Settings page's budget field, because PATCH /api/settings returns preferences without the budget (api.ts:233-244).
- REVISED (critic 1 mustFix 1; critic 2 shouldConsider): the stale remainingUsd after recovery is still fixed, but no longer by apply-then-router.refresh() (see the first entry; the earlier fix relied on a refresh being free, which it is not on this page). remainingUsd is owned state, updated from each command's result. The F14 e2e still asserts that 'left in your workspace' shows the raised figure after Try again.
- ACCEPTED (critic 1 mustFix 2): Recommendation 'Examples you admire' (RecommendationView.tsx:58) is a sibling instance of the same wrong assumption, on the Settings detour that budgetProblem itself recommends (history.ts:60). One shared guarded sessionSlot helper is used by checkpoint drafts, Start attachments and examples (per intakeId, cleared in onStarted). Examples.tsx derives its next key from max+1. Rebutted in part: the run-budget field is deliberately not kept, because it is a recomputed suggestion; the reason is recorded in notDoing and the ADR.
- ACCEPTED (critic 1 mustFix 3; critic 2 mustFix 2): the refresher is created, stored and disposed in one effect keyed only on runId. The delay-keyed timer effect has a local cancelled flag and never disposes, and the hidden-tab skip is kept. Verified StrictMode is on by default (Next define-env.js:150-151; next.config.ts sets no reactStrictMode). revise-D-r1/revise-probe.out.json: keepsApplying=true across running->waiting->running, normally and under StrictMode double setup.
- ACCEPTED (critic 2 mustFix 1): semi-controlled panels (seed once, write through; a mounted panel never re-reads the store) plus a 'sent' mark replace clear-on-ack. On POST success the turn is locked with the person's words, and the next applied snapshot settles it. YourTurn waits for the store's post-hydration load. The critic's acceptance test is included (the refresh after the answer fails; the editor never shows initialText; no storage key once the run moves on).
- ACCEPTED (critic 1 shouldConsider, torn reads): R3, answerable = open AND run not ended, is used for the turn, the settle rules and the unsent block (lifecycle.ts:131-141 and lost-runs.ts:27-36 write status before withdrawal; client.ts:127-131 reads run before checkpoints). The ADR's torn-read claim is corrected.
- ACCEPTED (critic 1 shouldConsider, acknowledgement): drafts are settled by server state. A closed question whose cp.resolution equals toResolution(cp, draft) is settled silently (a lost response, or a reload mid-POST).
- ACCEPTED (critic 1 shouldConsider): one on-screen-copy-aware startingDraft; isDirty compares through toResolution.
- ACCEPTED (critic 1 shouldConsider): the server-rendered initial snapshot is re-read through the ordered path (now() on refresher creation).
- ACCEPTED (critic 1 shouldConsider): Nav.tsx:31-49 moves onto the same hook.
- ACCEPTED (critic 1 shouldConsider): an external store whose put() does not notify, so a keystroke does not re-render; one storage key per checkpoint, debounced at 400 ms and flushed on pagehide and unmount.
- ACCEPTED (critic 1 shouldConsider): RunScreen's error is keyed to its checkpoint (or 'control') and shown only while that checkpoint is the turn.
- ACCEPTED (critic 1 shouldConsider): Directive keys are created once from the seed; Compare's mode, flip position and usePageScripts opt-in stay local to the mount.
- ACCEPTED (critic 1 shouldConsider): the ensure command is explicit ({ensure: true}); {} is still a 400; the route doc comments name both commands; concurrent dedupe is deferred to F03.
- ACCEPTED (both critics, F14 e2e feasibility): its own last Playwright project, skipped without BYWAY_E2E_DATA_DIR; synthetic spend appended through the Ledger class; the original cap restored in finally; server tests target server functions (recommendCommand, composeCommand), not route handlers; a flip-after-retry step is included.
- ACCEPTED (critic 2 shouldConsider): Try again is also offered in the aside while rec is null and a problem is recorded.
- ACCEPTED (critic 2 shouldConsider, UX-1): Compare and Choose highlights stay in memory only; pick and select toggles persist.
- ACCEPTED (critic 2 shouldConsider): effort L and risk medium; two slices under one ADR; eight answering panels; a separate 'byway.start-attachments' key with no migration. Partly rebutted: Start attachments stay in scope, because the review's F06 root fix asks for them and they cost a few lines with the shared helper.
- ACCEPTED (critic 2 shouldConsider): the ADR number is assigned when merged; the F15 e2e wraps route.fulfill/abort in try/catch.
- NO VERDICT CHANGES: no critique challenged the verdicts or severities (verdictChallenges empty in all three). F06 stays ACCEPT/P1, F14 ACCEPT/P2 and F15 ACCEPT_PARTLY/P3. F14's rationale and root cause now record the impure server render (page.tsx:48) as part of why router.refresh() cannot be the recovery or re-read path.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- NON-BLOCKING. The refresher has no per-request timeout. Polls are single-flight, the timer re-arms only after a poll settles, and visibilitychange calls poll(), which joins the in-flight request. So one GET that never settles stops all polling, and no 'byway is not answering' banner appears, because nothing errored. Today's loop re-arms whatever the request does, so later polls continue. A resolve or control call (now() aborts the stalled request) or a reload clears it.
- NON-BLOCKING. The design gives a wrong reason for not keeping the Recommendation run-budget field. notDoing says it is 'a suggestion derived from the estimate and the workspace figure, which a Settings change may have made obsolete'. In the repo, Proposal seeds it from suggestBudget(estimate) only (RecommendationView.tsx:306; format.ts:45-48). A Settings change does not alter the suggestion, and the amount someone typed before a budget refusal (history.ts:58-60) is exactly what they want back after raising the cap.
- NON-BLOCKING. The draftStore's debounce timers are not specified to be cancelled on drop. A put() schedules a 400 ms write. If markSent or a settle 'drop' (or discard()) runs while that write is still pending, nothing in the design stops it from firing afterwards and writing the dropped entry back to sessionStorage.
- NON-BLOCKING. The 'sent' lock is specified for kinds that have a draft. Confirm 'has no draft', and compare and choose keep theirs in memory only. It is unclear whether markSent(id) creates an entry for any kind. If it does not, a confirm, compare or choose turn whose post-answer refresh fails is re-enabled (busy goes back to false), and pressing it again gets a 409. That is today's behaviour, so it is not a regression.
- NON-BLOCKING. YourTurn renders only once store.ready, one effect tick after hydration, but the design does not say what the work slot shows in that tick. Under the current slot logic it would fall through to RunStatusPanel for one frame.
- NON-BLOCKING. The 'recovery' Playwright project has dependencies: ['chromium'], so the F14 acceptance e2e is skipped whenever any main spec fails. The suite only reports the skip.


## Cluster E: Exact human page-copy authority

**Root cause.** One wrong assumption. The person's copy may be written or rewritten by something other than an exact, total application of their edit, as long as the result passes a check weaker than the edit. That 'something' can be:
- a model;
- a lossy fallback;
- a reader that skips or misreads what it does not recognise, including a page tokenizer that is not the browser's;
- a later machine writer whose lock scope is guessed or fails open.

Where it lives:
- copy.ts: tokenize, pageVoiceProblems, lostVoiceLines, placePageCopy, copyLines, decodeEntities, parseOptionCopy and applyOnScreen.
- human.ts: the squashed 'unchanged' test, the trailing-line strip, the model-first web write-back and the model fallback for every other medium.
- writes.ts: keepsVoice.

The correction belongs at one boundary, the copy module, where each medium's deck becomes the contract:
1. A deck read the way the reader sees the artifact: a tokenizer that ends tags, raw text, RCDATA and foreign-content CDATA where browsers do; positional page units; one bracket notation on every page line; labelled fields.
2. A total reader: every answer line lands in exactly one place, or the answer is refused with that line named.
3. A deterministic apply.
4. Two exact checks on the same deck:
   - at VOICE, the deck read back from the written artifact equals what the person wrote. Non-web media use a round trip through one line-based layoutOf that is not the reader. Pages are read fresh, and placement's own list of removals is checked as a witness.
   - for every later machine write, the locked deck is unchanged.

The lock's scope comes from facts:
- a storyboard's voice-over is always written back once a voice exists;
- its on-screen copy is locked exactly when the late VOICE's own total reader reads the voice as this storyboard's complete on-screen deck, whatever the values.

Every VOICE answer problem, including a fault inside the pure copy code, goes back to the person (ENG-6). No model decides the person's words.

Not this root cause: in C5, the automatic gate retry re-enters D2 from the ports it started with. That is a deliberate workflow rule (RetryStage), not a weak check, so it is parked as VOICE-RETRY.


### F07: Human page-copy preservation is tested as loose string membership

- **Verdict:** ACCEPT · **Severity:** P1 (review: P1) · **Label:** correctness / human-authority (VOICE) data integrity

**Rationale.** Every technical claim reproduces at b33f1285.

The review's claims:
- copy.ts:145-151 (pageVoiceProblems) checks only that each non-empty edited line appears somewhere in the page's set of lines. It therefore accepts deleted text left on the page, a duplicated line replaced by other text, and swapped lines.
- skeleton() (copy.ts:109-114) drops every text token, so text inserted between tags passes.
- placePageCopy (copy.ts:120-142) writes a whole line into its first text token, which empties inline <a> and <strong>.
- decodeEntities (copy.ts:60-68) calls String.fromCodePoint on unbounded numbers, so a RangeError escapes.

Found in earlier rounds:
- human.ts:161 compares squashed text, so moves across lines, merges and prose paragraph splits are dropped silently.
- human.ts:191 strips the trailing empty line, so the last block cannot be emptied.
- copyLines glues side-by-side links together.
- Unknown named entities are shown raw, then double-escaped.
- Every other medium falls back to helper.voice.apply. Only substring membership checks that fallback, and nothing checks it when the voice is empty (writes.ts:20).
- keepsVoice (writes.ts:15-24, lostVoiceLines at copy.ts:291-301) uses the same substring check, and C5's script phase reaches it today.
- parseOptionCopy and applyOnScreen drop or shadow lines the person typed.
- The shared tokenizer (copy.ts:30) ends a tag at the first '>', even inside a quoted attribute value.

Verified this round:
- In canonical C5, every keepsVoice writer runs with the voice port holding the VO script. A failed launch gate re-enters D2 from the ports D2 started with (interpreter.ts:131-151, lines 139 and 147). No writer follows the late VOICE: c5.ts:132-144, and render produces only a view (parts.ts:134-135). Round 3's 'on-screen phase' therefore exists only in composed recipes.
- Round 3's equality lock signal failed open on layout drift in an answer the reader accepts (critic-E-root-cause-r3-1/probe-signal.out.json).
- The tokenizer offered CDATA bytes inside <svg> as copy, and fallback text inside <iframe> that browsers never show (critic probe-web.out.json k4, k4b, k5).

**Severity rationale.** P1 by the review's own definition: repair it before relying on the guarantee in paid use. The guarantee comes from three places:
- spec section 3.2: 'a human writes every reader-facing line';
- protocol 01 VOICE step 7 ('inserts the human copy exactly') and 02 port rule 6 ('No later block writes over voice');
- the artifact label 'Your words'.

Paths that break it with no model involved:
- the silent drop at human.ts:161;
- options and on-screen readers dropping typed lines;
- the glued nav line;
- attribute bytes shown as copy on a page with a quoted '>'.

Paths reached in canonical paid runs when a model deviates, where nothing catches it:
- C1: a helper.voice.apply page that keeps deleted text or adds a claim is stored as 'Your words'.
- C5 script phase: every D2 writer, apply-cut and apply-swaps is held by lostVoiceLines. Appended or reordered voice-over text passes it (critic-E-root-cause/probe-keeps.out.json; revise-E-r3-1b/probe-lock2.out.json s3 and s4, repoToday []). The late VOICE never shows the voice-over, so the person never sees the change.

Round 3's example of a caption rewritten after the late VOICE described a path canonical C5 never reaches, and is withdrawn. On its own the RangeError would be P3, because it is rare and fails closed; the last-line block on its own would be P2 UX.

**Root cause.** The runner never represents the person's decision exactly, so it can neither apply it exactly nor verify it exactly.

Each medium's copy deck is implicitly a positional or labelled list, but later steps lose that identity:
- 'unchanged' is a squashed comparison;
- the field readers skip text they do not recognise;
- the page deck is read by a tokenizer that is not the browser's. It ends tags at the first '>', treats CDATA in <svg> as text and offers <iframe> fallback. It also glues links together and decodes entities only partly.

Where the runner cannot map an answer, it hands the copy to a model and accepts any result that passes a predicate weaker than the edit. The same weak predicate (lostVoiceLines) is the only lock on later machine writes.

Round 3's replacement lock first guessed the storyboard's locked scope from the shape of the voice text. Its equality signal then switched the lock off whenever the answer's layout drifted from the deck. ADR-0073 recorded the weak page check as the design.


### Options


**A. One exact copy contract at the copy boundary, shipped in two activity-only stages. Browser-faithful reading, one bracket grammar, total readers, deterministic write-back, a round trip and a witness-checked verifier at VOICE, an exact lock after it. No model writes the person's copy.** (fixes root cause: yes; effort L; risk medium)

The copy module owns the person's copy for every medium: copy.ts, plus a new activity-side page-copy.ts.

Stage 1, non-web media and the locks:
- total labelled readers and one line-based layoutOf;
- a round trip at VOICE, and no model fallback;
- checkedWrite replaces lostVoiceLines. On a storyboard, the voice-over is written back and a step-finished note says so. The on-screen copy is locked when the late VOICE's reader reads the voice as this storyboard's complete deck. Every other locked deck is exact equality.
- claim-log is limited to prose;
- AnswerRejected only.

Stage 2, the page engine:
- a WHATWG tag-end, raw-text, RCDATA and foreign-CDATA tokenizer;
- parse-entities decoding;
- positional units, with one bracket grammar on every line;
- a link legend in the VOICE prompt instead of a relabel guard;
- deterministic placement that returns its removals as a witness;
- a linear verifier that checks the witness, then reads the written page fresh, with six invariants;
- a page lock on the deck plus each link's href.

Every stage is activity-only, so the workflow bundle hash does not change.


*Pros*
- Removes the wrong assumption everywhere it appears: the web write-back, the non-web model fallback, the lossy readers, the empty-voice bypass, keepsVoice, the squashed 'unchanged' test, the trailing-line strip, the non-browser tokenizer, and the guessed or fail-open storyboard lock scope.
- The lock scope cannot fail open on layout. It reuses the reader that accepted the late answer and ignores the values (probe-lock2 d_valueAfterBlankLine, d_indentedContinuation, d_lowercaseLabelsNextLine are locked). A VO script, which has no Headline: or Tagline: line, stays unlocked, so C5's first-pass cut and its second-pass cut after a retry are stored (s1, g1).
- The live C5 gap is closed without new paid-run failures. Appended or reordered voice-over text is written back (s3, s4). The obedient write is byte-identical (s6). A step-finished note says when anything was written back.
- Verification is independent of placement. Non-web answers round-trip through a layoutOf that is not the reader. Placement names its removals as a witness; the verifier checks each one against the shared removability and <br>-run rules, then compares markup token for token in linear time and reads the page fresh. A lying witness is refused (r4_witness_*). There is no search, no memo and no work cap.
- Link words are the person's explicit decision. The VOICE prompt names where every link goes, and the words are placed as written and verified per link part. No heuristic guard or confirmation bit is involved.
- One bracket grammar on every page line. A bracket typed on a line without a link is refused with the escape hint, not written as a literal. A whole-link line accepts one pair of brackets around it (r4_k1*, r4_plain_*). The C1 demo deck carries no marks or escapes.
- No model call in any VOICE write, so demo and paid runs behave the same and VOICE costs nothing.
- Scales linearly. In proto8, a 24,010-tag page reads in at most 52 ms, places in 82 ms and verifies in 131 ms. A 20,000-path SVG page verifies in 67 ms, and 1,000 identical deletable items in 16 ms.
- Validated in scratch at exact bytes. revise-E-r3-1b/proto8.mts and proto8.out.json hold 167 cases; 115 of the 125 shared with revise-E-r3/proto7 are identical, and compare8.out.txt explains every difference. probe-lock2.mts covers the storyboard lock. revise-E-r2/readers.mts covers the non-web readers.
- Staging lets C2, C4, C5 and C7 get exactness before the roughly 600-line page engine lands. The bundle hash is checked at each stage.

*Cons*
- The largest runner change of the options: page-copy.ts is about 600 lines, plus the tokenizer, readers, tests and call-site edits.
- Adds a small notation to page decks. Link words inside a line are shown in brackets, and a literal bracket, or a backslash before one, is shown escaped on every line. The C1 demo deck carries none.
- Formatting coverage follows a documented, unit-tested rule and is not verified (r4_v8_emphasis_coverage_not_verified returns no problem).
- Free-form answers that the model used to map are now asked again, with the exact problem.
- A model's change to the locked voice-over is undone rather than reported back to the model. A note tells the person. If that change was the step's only edit, the A/B compare is skipped as 'nothing to compare', and the note says why.
- Locked on-screen copy is refused on any change rather than restored. Only composed media recipes that put a writer after the late VOICE reach this; such a write fails its step after two model tries, as a detected change does today.
- Stated edge cases:
- A VO script that is literally this storyboard's complete labelled on-screen deck (Headline:, Tagline: and exactly Shot 1..n) locks the on-screen copy. A first-pass cut on it would then be refused (probe-lock2 c1); this is stricter and negligible.
- A paragraph whose link carries id, data-* or a similar hook cannot be deleted in VOICE, though it can be edited.
- In-flight composed runs whose old late answer omitted a field stay unlocked (o_inflight_oldAnswerWithoutTagline).
- Adds parse-entities@4.0.2 as a direct runner dependency. It is already in pnpm-lock.yaml.


**B. Review's full repair: segment identities end to end, with a structured editor** (fixes root cause: yes; effort XL; risk high)

The deck becomes structured segments with block and inline-run ids, carrying location, purpose and length as in the protocol copy deck. The web UI gets a per-segment editor, and the resolution carries {segmentId: text | deleted}. The runner applies it deterministically and verifies by id. keepsVoice and non-web media move to the same structured form.


*Pros*
- The person decides everything explicitly, including formatting coverage and which link goes where.
- Matches the protocol's copy deck (purpose and length budget).
- Exact verification by id.

*Cons*
- Changes contracts (checkpoint initialText and the resolution shape), store rows, the CLI/API answer format and the web UI. Open checkpoints need a migration.
- Touches workflow-side types, so the bundle hash changes and ADR-0078 ends every open run.
- Splitting runs into separate fields fragments sentences.
- Still needs every exactness rule in A: the tokenizer, total readers and the lock scope.


**C. Exact checks only; the model stays the web placer** (fixes root cause: partly; effort M; risk low)

Replace membership with A's exact checks (web verifier, non-web round trip, keepsVoice lock), the tokenizer and total readers. Web pages keep model-first placement (helper.voice.apply), judged by the exact verifier. The deck is unchanged.


*Pros*
- Smaller than A. No corrupted page or field is accepted any more, and keepsVoice is exact.
- Same compatibility profile as A.

*Cons*
- Link coverage is still the model's choice and cannot be verified.
- In demo mode the mock returns the page unchanged, so an edit to a line with inline markup is asked again with no way to succeed.
- The glued nav line stays, and the prompt still asks for removals that the verifier refuses.
- Every web VOICE edit costs a model call.


**D. Round-1 design: runner-first placement, with a model splice for undecided inline lines** (fixes root cause: partly; effort L; risk medium)

A's deck without bracket marks. Link coverage is assigned by heuristic, and lines where it is undecided go to a narrowed helper.voice.apply v3.


*Pros*
- The words are exact and no notation is needed.

*Cons*
- Link coverage is decided by a heuristic or a model and cannot be verified (critic cases x1 to x3).
- Keeps a model in the VOICE write, so demo and paid runs diverge.
- Non-web media and keepsVoice still need A's changes.


**E. Deterministic, with no model and no marks; undecided lines asked again with 'keep a word of …'** (fixes root cause: partly; effort M; risk medium)

D's deterministic placement without the model. A line where a link would lose all of its words is asked again.


*Pros*
- Smaller than A, with no notation and no model.

*Cons*
- Forces the person to keep words they wanted to change, which breaks VOICE authority in a new way.
- Bounded replacements are still given to the link by heuristic.
- Cannot express deleting a link while keeping its sentence.


### Recommendation: A

**Why.** A is the smallest design that removes the wrong assumption everywhere it appears. Every write of the person's copy is a deterministic application of an edit they stated in full. A total reader reads it the way the artifact's reader sees it. It is then checked against the medium's own deck: at VOICE against what the person wrote, afterwards against the locked deck as it stood before the write.

This round corrects the premise and closes the critics' items at their roots.

C5 flow. In canonical C5, every keepsVoice writer runs with voice equal to the VO script (interpreter.ts:131-151, 409; c5.ts:132-144; parts.ts:134-135). So the voice-over write-back is the live fix. The on-screen lock serves composed recipes only and becomes a plain exact refusal. The parked 'second-pass cut fails' row is withdrawn: that cut is stored today and under A (probe-lock2 g1).

Lock scope. Scope is the late VOICE's own reader accepting the voice as this storyboard's complete deck, values ignored. Layout drift can no longer switch it off, and a VO script stays unlocked.

One layoutOf. A single line-based layoutOf, never the reader, defines both the round trip and the no-op test.

Visible write-back. The voice-over write-back is reported in a step-finished note, and operators.ts's keepsVoice e2e is rewritten to expect it.

The page engine:
- it reads CDATA, raw text and RCDATA as browsers do;
- one bracket grammar holds on every line;
- the relabel guard and its confirmation bit are replaced by naming each link's address in the prompt. The root of that problem was that the deck hid addresses;
- the verifier checks placement's witness instead of searching, so the cap and its dead-end message are gone;
- invariant 5 is now in the verifier;
- the page lock includes hrefs.

ENG-6 boundaries. Refusals quote the offered text of each line they name, because after a re-ask the web UI's 'starting text' is the person's previous answer. Faults in openCheckpoint's deck read and in checkedWrite become a typed, non-retryable StepError instead of retried untyped errors.

The C5 gate retry dropping the late-VOICE copy is real. It comes from the workflow's stage re-entry, not from a weak check, so it is parked as VOICE-RETRY with an ADR sentence, a backlog row and a characterization assertion. This follows the scope discipline of parking off-path findings.

Why brackets and no model, and why not B: unchanged from round 3.

Evidence:
- revise-E-r3-1b/proto8.mts and proto8.out.json, with compare8.out.txt against revise-E-r3/proto7.out.json;
- revise-E-r3-1b/probe-lock2.mts and probe-lock2.out.json;
- revise-E-r2/readers.mts and readers.out.json;
- revise-E-r1/probe-nonweb.out.json and critic-E-root-cause/probe-keeps.out.json.

**Design.** Everything is activity-side.
- New: packages/runner/src/page-copy.ts, imported only by copy.ts.
- Changed: copy.ts, activities/human.ts and activities/writes.ts.
- One call-site change each: activities/model-step.ts (the default writer parser), relay.ts:92 and asset.ts:122 and :134. Each stores the text that checkedWrite returns and adds its note.

0. Tokenizer (copy.ts tokenize, shared by every page reader)
A hand-written linear scanner that follows the WHATWG tokenizer where it matters for copy:
- Tag ends: quotes delimit attribute values only; a stray quote in a name or an unquoted value is part of it; input that ends inside a tag is opaque.
- Comments end at '-->' or '--!>'; '<!-->' is empty; '</>' is dropped; '</' followed by a non-letter starts a bogus comment; '<' not followed by a letter, '!', '/' or '?' is text.
- Raw text, opaque up to '</name' followed by whitespace, '/' or '>': script, style, noscript, template, iframe, xmp, noembed, noframes, and textarea. textarea is RCDATA, but its default value is not offered.
- In HTML content a '/>' on these elements is ignored, as browsers do.
- plaintext is opaque to the end of the input.
- title is RCDATA: one text token, decoded and offered.
- Inside an open <svg> or <math>, '<![CDATA[' up to ']]>' is one opaque token. Outside them it stays a bogus comment that ends at the first '>'.
- Attribute values (href, and the hooks named in refusals) are read with the same attribute scanner.
The scanner does not rebuild the tree: there are no implied end tags. On the C1 demo page the tokens are identical to b33f1285's (r4_demoPage_sameTokens).

1. Decoding and whitespace
- decodeText is parseEntities from parse-entities@4.0.2: browser rules, total, never throws.
- Whitespace means HTML whitespace. A no-break space is part of the text.
- Changed text is written with & < > escaped; unchanged text keeps its raw bytes.
- parse-entities' dependency decode-named-character-reference switches to DOM decoding under the 'browser' export condition. copy.ts must therefore never be bundled for a browser or the workflow sandbox (ADR note).

2. Page deck: readPageCopy(html) returns { tokens, slots, elements, units, linkParts }
Built in one pass, with a void-aware element stack, slot ranges by token index and link membership from the stack of open closed-<a> elements.
- A unit is the visible text of a block. Head content is excluded except <title>, and <pre> is excluded.
- A block holding only links gives one unit per link. Link parts follow the element tree.
- One grammar on every line: '[' and ']', and a backslash immediately before '[', ']' or another backslash, are notation. Literal ones are shown escaped on every line, not only on marked lines.
- A marked unit shows its link parts in brackets.
- A unit that is exactly one link's words is shown plain and recorded as a whole-link unit.
- linkParts lists each link part by position: its line, its words and its href ('(no address)' when there is none).
pageCopy and extractCopy('web-page') are re-based on this deck.

3. Answer reading: readPageEdit(copy, answer, offered, firstOffer) returns Parsed<{ lines }>
firstOffer is defined exactly: store.getCheckpoint(resolution.checkpointId).initialText equals FinishHumanInput.initialText, the interpreter's first offer. A re-ask's initialText is the person's previous refused answer, which never equals the first offer, because an answer equal to the offer succeeds at step 1. If the checkpoint is missing, it is treated as a first offer, which is stricter.
These carry over from round 3:
- counts and the split-line hint;
- unchanged lines;
- in-flight alignment. Alignment compares words only: every bracket and backslash is dropped, so older decks that showed literal brackets unescaped still align.
- the first-offer rule;
- deletion by an empty line.
One grammar:
- every changed line is parsed for brackets and escapes;
- a marked unit must keep one pair per link, in order, and '[]' removes that link;
- a whole-link unit takes either plain words or one pair of brackets around the whole line. Any other bracket is refused: 'Line N is all one link's words: write them plain, or put the whole line in [brackets].'
- a unit with no link refuses any unescaped bracket: 'Line N has no link, so it cannot have [brackets]: links cannot be added in this step. To write a bracket as text, put a backslash before it.'
There is no relabel guard and no confirmation. Every refusal that names a line quotes how that line read when first offered, from input.initialText: at most 5 lines, 80 characters each.

4. Placement: placePageEdit(before, edit) returns { page, problems, witness: { removed, brs } }
Segments, formatting rules 4(a) to (f), exact whitespace, the removable predicate, the union-find no-join rule over all removals together, <br> runs taken by deleted lines, and control refusals that name the hook are all as in round 3.
The new output is the witness: the start token of each removed element (outermost only) and each removed <br>.
Placement never throws to its caller: an internal fault becomes a problem.

5. Verifier: pageEditProblems(before, after, edit, witness), six invariants, linear
It shares the reader, the removability predicate and the <br>-run rule with placement. It is independent of placement's alignment and removal choices; it is not independent of the reader, whose browser-faithfulness is tested on its own (steps 9 and 10).
(1) Markup. Each witnessed element must be removable, with all of its text in changed lines. Each witnessed <br> must belong to a run a deleted line takes. Before's non-text tokens, less exactly the witnessed removals, must equal after's token for token. No search, no memo and no cap.
(2) and (3) Text, by chains, as in round 3: unchanged slots keep their bytes, and a deleted line's slots hold only its edge whitespace. Each changed line's decoded text, trimmed at its ends, must equal the person's line.
(4) Each link part reads exactly its bracketed words; '[]' means the part is gone.
(5) No <a> or <button> holding a changed line's text is left without a name. It needs some text, or a visible embedded child plus aria-label, aria-labelledby or title. This is now checked in the verifier; round 3 checked it only in placement.
(6) Read fresh, the written page's blocks hold exactly the expected text, block by block, in order.
Not covered: formatting coverage, which follows rules 4(a) to (e), documented and tested. The verifier never throws.

6. Total readers for the other media (unchanged from round 3)
- Options: '### X', then Title:, Pitch: and Rationale: exactly once each, in order.
- Late storyboard VOICE: Headline:, Tagline: and one 'Shot N:' per shot, exactly once each, in order. A voice-over line is refused.
- Script: the trimmed text.
- Prose: refused when empty.
- Code-diff: the Why, refused when empty.
Any other line refuses the answer and is named. helper.voice.apply is never called. lockedVoiceover (human.ts:132-137) stays as the late VOICE's own check.

7. The checks (copy.ts)
(a) layoutOf(medium, text) is one line-based normalization. It keeps every line and never calls the reader. It normalizes CRLF, trailing spaces, blank lines before a label and at the ends, a value on the line after its label, and label case and spacing. It keeps everything inside a value.
The VOICE round trip is layoutOf(medium, extractCopy(medium, written, scope)) equal to layoutOf(medium, answer). The no-op test at step 1 is layoutOf(medium, answer) equal to layoutOf(medium, offered).
For pages, the no-op test is per line with HTML whitespace collapsed, since pages render collapsed and <pre> is not offered.

(b) checkedWrite(run, text, voice, before) returns { text, problems, restored }.
The locked deck of before is computed before the model call. Any internal fault becomes StepError('byway could not check this write against your words (…)'): plain and non-retryable, so no paid call is repeated.

Storyboards:
(i) The voice-over is written back from before whenever a voice exists, and 'voice-over' is added to restored. This is the live C5 path: the voice is the VO script from VOICE-early on, and it never refuses.
(ii) Scope. The on-screen copy is locked exactly when the late VOICE's total reader (6) accepts the voice against before's labels, whatever the values. Those labels are Headline, Tagline, then Shot n for each of before's shots, each once, in order.
- A VO script has no Headline: or Tagline: line, so it stays unlocked. This holds after a gate retry too, when D2 re-enters with voice equal to the script.
- Any late answer the reader accepted is locked, whatever its layout.
(iii) When locked, extractCopy(after, 'on-screen') must equal extractCopy(before, 'on-screen') exactly. That deck lists every shot, captioned or not. Otherwise the write is refused: 'The on-screen copy is the person's (headline, tagline and every shot's caption, which names every shot): keep it exactly as it is, with the same shots.' Nothing is restored on this branch, and only composed recipes reach it.
(iv) Then extractCopy(script) must equal before's. It does by construction; this is a guard against a runner fault.

Options, prose and code-diff: extractCopy of after must equal before's.
Pages: the deck as shown (marks included) and each link part's href, by position. Visibility (the hidden attribute, inline styles, classes) is not checked; this is stated.
With no before, the voice must pass the VOICE round trip on after. For a web page that is practically unsatisfiable, because the whole page deck would have to equal the handed-in deck; such recipes should place the deck with a VOICE step (ADR note).
An empty voice is checked. The seed check (PR3) is unchanged, and writeProblems stays as the seed-only wrapper.

8. human.ts
writeVoice runs in this order:
1. The no-op test (7a) writes nothing.
2. For pages, firstOffer is derived (3).
3. Read and apply: readPageEdit then placePageEdit, or the total readers then applyCopy.
4. Check: pageEditProblems with the witness, or the round trip; then lockedVoiceover and the seed check.
5. A result equal to the artifact's bytes writes nothing.
6. Otherwise the result is stored as 'Your words' with costUsd 0.
Steps 3 and 4 are pure and run inside one guard. Any exception becomes AnswerRejected: 'byway could not place this edit (…). Change those lines again, or leave them as they were offered:', quoting the offered text of the changed lines. Store reads and writes stay outside the guard, so Temporal retries transient store errors as today. Every problem raises AnswerRejected, and sending the offered copy back always succeeds through step 1.
Also:
- askModel and helper.voice.apply are removed from this path;
- the squash at :161 and the strip at :191 go;
- the claim-log path applies only to prose, and openCheckpoint maps from: 'claims' on any other medium to the copy deck.

openCheckpoint's suffix for a web-page VOICE step:
- 'One line per block of text; leave a line empty to remove its text.'
- When the deck has a marked line, the bracket rule.
- When it has link parts, the legend: 'Links stay where they are; only their words change. Where each one goes: line 2 "Terms of service" goes to /terms; …' At most 40 entries, with addresses cut to 60 characters.
The suffix is computed from the artifact (checkpoint.artifactIds[0], which VOICE always sets, or initial.artifactId), never from initialText. It is appended once to the incoming prompt, which never carries it, so re-asks get it once too.
An internal fault while reading the deck in openCheckpoint becomes StepError('byway could not read the copy of this work (…)'). It is non-retryable; no paid call is involved.

9. Notes. When checkedWrite restored a field, model-step.ts, relay.ts and asset.ts add a step-finished note: 'Your voice-over was kept exactly as you wrote it; this step's change to it was undone.' An obedient write is byte-identical and gets no note (probe-lock2 s6).

10. Prompts. helper.voice.apply is no longer called. Its templates and the 'voice.apply' id stay, because ids.ts is in the workflow bundle; a backlog row retires them.

11. VOICE-RETRY, parked and separate from F07. In C5, a failed launch gate re-enters D2 from D2's entry ports, so the copy the person wrote at the first late VOICE is not in the second pass, and the second late VOICE offers model copy without saying so. Recorded in:
- an ADR sentence;
- a backlog row with the owner's options: carry the person's on-screen answer across RetryStage in interpreter.ts (a bundle-hash change, after which ADR-0078 ends open runs), or as an interim, have openCheckpoint name the earlier answer when the current deck differs from it;
- a characterization assertion in c2-c5.ts.


**Steps**
1. Stage 1: non-web exactness and the locks (activity-only).
2. 1. Tests first, readers and locks. In formats.test.ts, add every case from revise-E-r2/readers.out.json. Add checkedWrite cases from revise-E-r3-1b/probe-lock2.out.json:
- script phase s1 to s6;
- second pass g1;
- the composed on-screen cases o_*;
- the drift cases d_*, each followed by a caption change that is refused;
- whitespace inside a value;
- an uncaptioned shot removed;
- the coincidences c1 and c2;
- the in-flight residual.
Also: options, prose and code-diff deck changes refused; an empty voice checked; a fault forced inside checkedWrite gives StepError.
3. 2. Tests first, activity (non-web). Drive finishHumanStep with a scripted fake gateway that records calls, plus an in-memory store. Assert:
- zero gateway calls in every non-web medium;
- AnswerRejected for every refused answer, with no artifact written and the offered text quoted;
- the round trip runs before the bytes-equal shortcut;
- a prose paragraph split is stored;
- a layout-only answer writes nothing, and a doubled space inside a caption is written;
- a forced store-write failure is retried, not re-asked;
- a claim-log VOICE on a non-prose run offers the copy deck.
Also: a keepsVoice writer whose checkedWrite faults makes exactly one gateway call and ends in a non-retryable step failure.
4. 3. copy.ts: the shared total labelled reader replaces parseOptionCopy and applyOnScreen. Add layoutOf, the round trip and checkedWrite. For pages in this stage, checkedWrite uses positional equality of today's pageCopy deck, inside its fault guard. Delete lostVoiceLines.
5. 4. writes.ts: add checkedWrite and keep writeProblems as the seed-only wrapper. In model-step.ts (parserFor's default writer), relay.ts:92 and asset.ts:122 and :134, store the text checkedWrite returns and add the restored-field note.
6. 5. human.ts, non-web: writeVoice without a model, with total readers, the round trip, the layoutOf no-op, the pure-code guard and AnswerRejected only. Limit claim-log to prose, and map from: 'claims' to the copy deck in openCheckpoint.
7. 6. e2e, stage 1:
- Rewrite operators.ts:162-182: expect one fix:media call; out.voiceover equals the script; the apply step's step-finished note matches /voice-over was kept exactly as you wrote it/.
- In c2-c5.ts, add the VOICE-RETRY characterization assertion, with a comment naming the backlog row: the second pass's late VOICE initialText does not contain the first pass's headline edit.
- Confirm the C2, C4, C5 and C7 e2e tests pass. In the demo the voice-over write-back is the identity, and no canonical step reaches the on-screen lock.
Run the whole runner suite and the prompts suite.
8. 7. Build the workflow bundle to a temp outfile and confirm the hash equals b33f1285's (e572716a…5d90e0).
9. 8. Docs, written once to cover both stages:
- the new ADR (see adrNeeded);
- spec section 3.2, lines 92, 100 and 104;
- the comment at advisor/profile.ts:175;
- the header comments of copy.ts, human.ts and writes.ts;
- backlog rows for the items in notDoing and for VOICE-RETRY.
10. Stage 2: the page engine (activity-only).
11. 9. Tests first, tokenizer. In formats.test.ts add the r3_tok_* and r4_tok_* cases at exact tokens:
- quoted '>';
- stray quotes;
- an unterminated tag;
- comment forms;
- '<3';
- end-tag attributes;
- CDATA inside and outside svg;
- textarea with '/>';
- title as RCDATA;
- plaintext.
Assert that the C1 demo page (renderPage seed 7) tokenizes identically, and confirm that the quoted-'>' cases fail at b33f1285.
12. 10. Tests first, page contract. Add packages/runner/test/page-copy.test.ts with every web case from revise-E-r3-1b/proto8.out.json at exact bytes:
- the round-1 to round-3 cases;
- r4_k1*, r4_plain_*, r4_k2*, r4_k3*, r4_k4*, r4_k5*, r4_xmp, r4_plaintext, r4_svg_style and r4_title;
- r4_witness_*, r4_emptyLinkKept_badPage and r4_v8;
- the legend outputs;
- r4_lock_*;
- the size cases (4,000-item list, 20,000-path SVG, 1,000 identical items), each with a 1 s bound;
- forced faults in placement and verification.
Port formats.test.ts 'VOICE copy' to the new API.
13. 11. Tests first, activity (web):
- zero gateway calls;
- a page with &#99999999; opens and finishes;
- a forced exception in the pure page code is asked again, quoting the offered lines, with no step-failed event;
- a forced fault in openCheckpoint's deck read is a non-retryable StepError;
- the firstOffer derivation with an in-flight old deck: a misaligned changed line is refused when answering the first checkpoint and applied when answering the re-ask, both read through store.getCheckpoint(resolution.checkpointId);
- the suffix and legend appear once on the first offer and once on a re-ask, computed from the artifact;
- a claim-log VOICE on a web-page run offers the page deck.
14. 12. Add parse-entities@4.0.2 to packages/runner/package.json and run pnpm install --offline; only the lockfile importer changes. Implement decodeText, HTML whitespace and the tokenizer of design 0 in copy.ts.
15. 13. Implement page-copy.ts:
- readPageCopy: one pass, stack-based link parts, linkParts, whole-link units, one-grammar display with escapes, <pre> excluded;
- readPageEdit: counts and hint, alignment by words, first offer, one grammar, offered-text quotes;
- the removal rule;
- placePageEdit, returning the witness; total;
- pageEditProblems: the witness check, chains and invariants 1 to 6; total.
Re-base pageCopy, extractCopy('web-page') and the page lock (deck plus hrefs). Delete placePageCopy and pageVoiceProblems.
16. 14. human.ts, web: writeVoice with the getCheckpoint lookup and the witness; the openCheckpoint suffix and legend. No model.
17. 15. e2e, stage 2:
- c1.ts: expect zero voice.apply calls; make the copy assertion positional; assert no <a> or <button> is left empty.
- operators.ts:357-361: keep the count regex and expect 0 voice.apply calls.
Run the whole runner suite and the prompts suite.
18. 16. Build the workflow bundle to a temp outfile and confirm the hash is unchanged.


**Acceptance tests**
- 1. Deletion. '<h1>Head</h1><p>Old middle</p><p>Tail</p>' answered with lines 'New head', '', 'Tail' gives exactly '<h1>New head</h1><p>Tail</p>'. A written page that keeps 'Old middle' is refused (invariant 1 or 'Line 3 must be empty', plus invariant 6).
- 2. Multiplicity and order. 'Repeated' twice gives two paragraphs. 'Beta' then 'Alpha' swaps them. An unchanged page is refused for the swap.
- 3. Text inserted between tags ('<h1>New head</h1>Now 50% off, guaranteed!<p>Sub</p>') is refused by invariants 2 and 6.
- 4. A move across blocks. 'Bread before' / 'seven Order by nine' gives '<h1>Bread before</h1><p>seven Order by nine</p>'.
- 5. A C4 prose paragraph split is stored.
- 6. Last line. Answering 'Head' followed by an empty line deletes line 2. Trailing blank lines past the count are read as unchanged.
- 7. A link inside a line. 'Please [read the terms] today.' gives exactly '<p>Please <a href="/terms">read the terms</a> today.</p>', including under pre-wrap and with indented source. Doubled spaces, a changed href or an emptied link are refused (v1, v2, v3).
- 8. The person chooses the link words. 'Please [come] today.', 'Review [the conditions] now.', 'Today, please [read terms].' and 'Please [] today.' each place exactly. An answer that drops the brackets on a marked line is asked again with the rule.
- 9. Emphasis follows whole words and pieces: r2_em_suffix_letter, r2_em_prefix_letter, r2_em_word_replaced_alone, r2_drop_cap, r2_punct_outside_em, k_strong and k3. Formatting coverage stays unverified (r4_v8_emphasis_coverage_not_verified returns no problem).
- 10. Backslashes. r2_backslash_in_marked, _shown, _edit_kept and _before_link round-trip.
- 11. Footer and nav. '[Terms] · [Privacy policy]' places exactly. The C1 demo deck has 25 lines with no marks or escapes, and 'Contact us' gives '<a href="#start">Contact us</a>'.
- 12. Links across a <br>. Each part is marked and verified per line. Adding words beside a part whose link continues is refused.
- 13. Removals:
- the CTA, the aria-label CTA and an all-deleted <li> are removed;
- a table cell, <h2 id>, <label for>, <div data-slot> and <dd> are kept empty;
- 'Alpha<p>Middle</p>Omega' keeps an empty <p>;
- a submit-button label and an unnamed svg link are refused, by placement and now by invariant 5 as well;
- named icon controls are kept.
No step-failed event in any case.
- 14. Entities and whitespace. &#99999999;, &#xD800; and &#x110000; show as U+FFFD with no throw. '&eacute;' shows as 'é'. Unchanged '&copy;' and '&copy 2026' keep their bytes. A typed '&amp;' is written literally. An edited line keeps U+00A0 as byte a0.
- 15. <pre>, xmp and plaintext content are not in the deck, and their bytes stay identical (x6_pre_notOffered, r4_xmp_not_offered, r4_plaintext_not_offered).
- 16. In-flight questions:
- an old 24-line demo answer is refused, naming line 3 as split;
- an old line now shown with brackets gets the bracket re-ask and is then applied;
- '&eacute;' lines are applied;
- on an equal-count shape change, a moved changed line is refused on the first offer and applied on the re-ask;
- an old deck that showed literal brackets unescaped still aligns: an unchanged line keeps its bytes, and a changed line with unescaped brackets gets the escape hint (r4_plain_literal_brackets_inflight_*).
- 17. Options and storyboard answers are refused, naming the line and quoting its offered text, with zero gateway calls and no artifact:
- a preamble;
- a line before 'Title:';
- a second 'Pitch:';
- a deleted block, a blanked Pitch, or reordered fields;
- a duplicate or dropped 'Shot N:', or a line before 'Headline:';
- a voice-over line;
- empty prose, or an empty Why.
- 18. These variants are stored and pass the round trip: continuation lines, a value on the next line, 'title:' with no space, CRLF with no blank line between blocks, a paragraph inside a rationale, a cleared headline, and a two-line caption. The web on-screen panel sends single-line fields, and falls back to the plain editor when a re-ask holds a two-line caption (apps/web/src/view/onscreen.ts).
- 19. keepsVoice on storyboards (probe-lock2):
- Script phase, the canonical C5 path. A shot-labelled VO script with a first-pass cut that removes shot 2 and renumbers is stored with 2 shots, nothing locked and no problem (s1). A caption swap is kept (s2). An appended or reordered voice-over is written back, with restored ['voice-over'] (s3, s4). An obedient clip attach is byte-identical, with no note (s6).
- After a gate retry, D2 runs with voice equal to the script, and a cut is stored (g1), as today.
- Composed recipes only, with voice equal to an accepted late answer: a changed caption or headline, a removed middle or last shot, an added shot, and an uncaptioned shot removed are each refused. A voice-over-only change is written back. A clip attach passes.
- Layout drift stays locked: a value after a blank line, an indented continuation, and lowercase labels with a value on the next line, each followed by a caption change, are refused.
- A VO script that is this storyboard's complete labelled deck locks (c1). One labelled for other shots does not (c2).
- The C5 demo e2e test finishes.
- 20. keepsVoice on pages. After VOICE, these writes are refused: one that adds a claim, retargets a link href (in a sentence or in the nav) or moves a link's span. A class change passes. Adding the hidden attribute is not checked; this is stated (r4_lock_*).
- 21. ENG-6 and the typed boundaries:
- a forced exception in pure VOICE code raises AnswerRejected naming it and quoting the offered text of the changed lines, with no step-failed event;
- sending the offered copy back succeeds;
- a forced store-write failure is retried;
- a forced fault in openCheckpoint's deck read is a non-retryable StepError with a plain message;
- a forced fault in checkedWrite on a keepsVoice writer gives a non-retryable StepError after exactly one gateway call.
- 22. Tokenizer:
- '<p>Price <a title="a > b" href="/x">Link</a> now</p>' shows 'Price [Link] now', and 'Price [Link] today' writes '<p>Price <a title="a > b" href="/x">Link</a> today</p>';
- single-quoted 'Next >', Alpine 'x-show="n > 0"' and an onclick with '>' place exactly;
- svg CDATA is opaque, so the deck has no 'b]]>' line and editing a neighbour keeps the CDATA bytes;
- CDATA outside svg is a bogus comment, as in browsers;
- iframe fallback and textarea default text are not offered;
- '<textarea/>' still opens raw text;
- title is RCDATA, so 'A <b>x</b> & y' is offered and 'Fresh & warm' writes '<title>Fresh &amp; warm</title>';
- the r3_tok_* and r4_tok_* token lists match;
- the C1 demo page's tokens are identical to b33f1285's.
- 23. Link words and addresses:
- the VOICE prompt for '[Terms of service] · [Privacy policy]' names 'line 2 "Terms of service" goes to /terms' and '/privacy';
- the answer '[Privacy] · [Terms]' writes '<a href="/terms">Privacy</a> · <a href="/privacy">Terms</a>' as written;
- a page with no links gets no legend;
- the suffix is appended exactly once on the first offer and once on each re-ask, computed from the artifact.
- 24. <br> runs:
- '<p>Line one<br>Line two</p>' gives '<p>Line two</p>' with line 1 deleted, and '<p>Line one</p>' with line 2 deleted;
- 'A<br>B<br>C' gives 'A<br>C' with B deleted, 'A' with B and C deleted, and 'B' with A and C deleted;
- 'A<br><br>B' gives 'A' with B deleted;
- 'See <a>our<br>menu</a> today' with line 1 deleted gives '<a href="/m">menu</a> today';
- '<br id="x">' stays.
The verifier returns no problem in every case.
- 25. Join across removals. 'Alpha<p>X</p><p>Y</p>Omega' with X and Y deleted gives '<div>Alpha<p></p>Omega</div>'.
- 26. A link with a hook. Deleting 'See [terms] here.' whose link has id="t" is refused with 'it carries id'. 'Read [the terms] first.' on that line is placed and keeps the id.
- 27. Size and witness:
- a 4,000-item list (24,010 tags) and a 20,000-path SVG page each open, place and verify in under 1 s (proto8: at most 131 ms);
- 1,000 identical items with every other one deleted verify;
- there is no work cap and no RangeError;
- a witness that claims an unchanged line's element, one the page did not remove, or one that hides a removal is refused (r4_witness_*).
- 28. Whitespace. On a page, a whitespace-only change writes nothing. In labelled decks, scripts and prose, layout-only differences write nothing: line endings, trailing spaces, blank lines between fields, a value on the next line. A change inside a value, such as a doubled space, is written (probe-lock2 d_whitespaceInValue, d_layoutOnly_isNoOp). No VOICE step in any e2e test calls voice.apply.
- 29. One bracket grammar:
- '[Contact us]' and 'Contact us' on a whole-link line both give '<a href="#start">Contact us</a>', and 'Contact [us]' is refused;
- 'Read [the terms] today.' on a line with no link is refused with the escape hint;
- the same words with escaped brackets on such a line are written as literal brackets;
- a page with literal brackets shows them escaped, and an unchanged line keeps its bytes.
- 30. The voice-over write-back is visible. In the rewritten operators.ts keepsVoice e2e there is one fix:media call, the output voice-over equals the script, and the step-finished note says the voice-over was kept exactly as written.
- 31. VOICE-RETRY characterization (parked). In the C5 e2e, the second pass's late VOICE initialText does not contain the first pass's headline edit.
- 32. The workflow bundle hash is unchanged from b33f1285 after each stage.


**Compatibility.** Temporal and ADR-0078:
- Only activity code changes, in both stages: page-copy.ts, copy.ts, human.ts, writes.ts, plus one call site each in model-step.ts, relay.ts and asset.ts.
- interpreter.ts, wording.ts, types.ts and prompts/src/ids.ts are untouched, so the bundle hash is unchanged and no open run is ended.
- Recorded activity results replay from history.
- The new lookup, store.getCheckpoint(resolution.checkpointId), is already in the Store contract.

Questions left open across the upgrade (web, stage 2):
- Lines left as offered keep their bytes.
- Alignment compares words only, so decks that changed only in marks or escapes still line up.
- Lines moved by an equal-count shape change are refused once, then read against the current deck.
- A count change is asked again, naming the split line.
- Pages with a quoted '>', svg CDATA or iframe fallback read differently now; the same in-flight rules apply.
- An old checkpoint has no link legend until a re-ask.
- Non-web answers that the model used to map are asked again.

C5 runs in flight:
- Every canonical keepsVoice write runs with voice equal to the VO script. From the upgrade on, a model's change to the voice-over is written back, with a note, instead of being accepted (when appended or reordered) or refused (when lines were lost).
- Nothing new is refused in canonical C5. The on-screen lock is reachable only by composed recipes with a writer after the late VOICE. There, an old late answer that the new reader would refuse (for example, one that left out Tagline:) leaves that run's on-screen copy unlocked. This is a stated residual.
- The gate retry behaves as today (VOICE-RETRY, parked).

Unchanged:
- store schema and CAS;
- checkpoint initialText and resolution formats;
- @byway/contracts;
- recipe hashes and research recipes (c1h and the baselines declare no keepsVoice and never import copy.ts);
- the web UI and the CLI/API answer format;
- prompt templates and versions;
- the advisor estimate (now an overestimate; backlog row).

Changed:
- A new direct dependency, parse-entities@4.0.2, already in the lockfile.
- The VOICE ledger has no voice.apply calls, at cost 0.
- Options labels are case-insensitive, and labelled decks must keep the order shown.
- Page decks may change for pages whose attributes hold a quoted '>', or that contain svg CDATA, iframe, xmp, noembed, noframes, plaintext, or literal brackets (now shown escaped). The C1 demo deck is unchanged.
- operators.ts's keepsVoice e2e now expects one fix call, the voice-over written back, and a note.
- The parked backlog row 'second-pass cut fails' is withdrawn before it is written.

**ADR.** Yes. A new ADR at the next free number: 'VOICE writes the person's copy exactly, without a model'. It supersedes the whole 'VOICE write-back' bullet of ADR-0073, including its keepsVoice sentence; ADR-0073 is not edited. It is written once, in stage 1, and describes both stages.

It records:
- the per-medium decks;
- the tokenizer: WHATWG tag ends, raw text, title as RCDATA, svg/math CDATA, plaintext, no tree rebuilding;
- page units, side-by-side links, one bracket grammar with minimal escapes on every line, <pre> not offered, HTML whitespace;
- the exclusions: attribute copy, script-generated copy, CSS content, textarea default text, svg CDATA text, xmp and plaintext content, and noscript content (not offered);
- total readers, with one line-based layoutOf for the round trip and the no-op test;
- the edit semantics: in-flight alignment by words, and the exact firstOffer definition;
- link words as the person's decision, with each link's address named in the VOICE prompt and no relabel guard;
- deterministic placement with a witness, and the formatting rule (documented and tested, not verified);
- conservative removal: the removable predicate, no join across all removals, <br> runs, and controls refused when invisible or nameless, naming the hook. A line whose link carries a hook cannot be deleted in VOICE;
- the six verifier invariants: linear, witness-checked, independent of placement but not of the reader;
- the keepsVoice lock:
  - the storyboard voice-over is written back whenever a voice exists, with a step-finished note;
  - the on-screen copy is locked when the late VOICE's reader accepts the voice as this storyboard's complete deck, and is then held by exact refusal (composed recipes only);
  - the coincidence where a VO script is a complete labelled deck;
  - every other medium is held by exact deck equality, and pages also by hrefs;
  - visibility is not checked;
  - with no before, the round trip is practically unsatisfiable for pages;
- that in canonical C5 every keepsVoice writer runs in the script phase;
- no model in VOICE;
- the ENG-6 boundary:
  - AnswerRejected for every VOICE answer problem, including faults in the pure copy code, quoting the offered text;
  - a non-retryable StepError for faults in openCheckpoint's deck read and in checkedWrite;
  - store faults are retried;
- that copy.ts must not be bundled under the 'browser' condition;
- the size bounds;
- the VOICE prompt suffix living in openCheckpoint until the next workflow change;
- a separate VOICE-RETRY paragraph: the C5 gate retry drops the late-VOICE copy. It is not fixed here; the owner's options are listed.

Also update spec section 3.2. Status: Proposed for the user's decision, or Delegated under ADR-0062 code-first mode.


**Deliberately not doing**
- No structured per-segment editor or new resolution format (option B). The protocol-style labelled copy deck is parked in the backlog.
- No marks for formatting elements; they follow the documented rule (backlog row).
- No attribute copy (alt, aria-label, title, placeholder, meta description), script-generated copy, CSS content, textarea default text, svg CDATA text, xmp or plaintext content, or noscript content in the deck. All are listed in the ADR and the backlog.
- No editing of <pre> content (backlog row).
- No full HTML tree builder. There are no implied end tags and no foster parenting, '/>' on non-void HTML elements is not reinterpreted for pairing, and an element without a closing tag is never removed.
- No change to workflow code (interpreter.ts, wording.ts, types.ts, prompts/src/ids.ts). The VOICE prompt suffix lives in openCheckpoint (backlog row).
- helper.voice.apply templates and ids are not deleted (backlog row).
- No change to the advisor cost estimate (backlog row). The advisor's per-role bar stays; only its comment is corrected.
- No relabel guard. The prompt names each link's address, and the runner does not infer intent from link words.
- No restoration of locked on-screen copy. That branch, reachable only by composed recipes, refuses any change. Writes to pages, options, prose and code-diff that change the deck are likewise refused, not restored.
- No visibility check (hidden attribute, inline style, classes) in the page lock (backlog row; no catalog web writer follows VOICE).
- No placement of a handed-in deck under keepsVoice when a before artifact exists: the writer is locked to the copy as it stands. With no before, the round trip applies, which a web page practically cannot meet (ADR note).
- VOICE-RETRY is not fixed here: C5's gate retry drops the copy written at the first late VOICE. Its root is RetryStage re-entering D2 from its entry ports, which is workflow code (bundle hash, ADR-0078). It is parked with an ADR sentence, a backlog row listing the owner's options, and a characterization assertion. This design does not claim the copy is kept across a gate retry.
- No way to delete a line whose link carries id, data-*, for, name, role or a referencing aria-* in VOICE. The refusal names the hook, and the line can still be edited.
- No recipe-level claim-log restriction (cluster A); the runtime dispatch is limited to prose.
- No change to the claim-log (ENG-2) apply. No general typing of untyped activity errors beyond the VOICE guard, openCheckpoint's deck read and checkedWrite.


**How it resolves each finding**
- **F07:** Resolved by option A in two activity-only stages. Evidence:
- web cases: revise-E-r3-1b/proto8.out.json (all earlier rounds' cases plus r4_*), with compare8.out.txt against revise-E-r3/proto7.out.json;
- storyboard lock: revise-E-r3-1b/probe-lock2.out.json;
- non-web readers: revise-E-r2/readers.out.json.

The review's sub-claims:
- (a) Deleted text left on the page: deleting is positional, and the witness check, invariants 2 and 3, and invariant 6 refuse a page that keeps it.
- (b) Duplicates and (c) reorder: lines are positional and checked one by one.
- Text inserted between tags: invariants 2 and 6.
- Inline flattening: link words are the person's brackets, verified per part, and formatting follows whole words or pieces.
- RangeError: parse-entities is total, and the pure-code guard turns any fault into a re-ask.

Found beyond the review:
- glued links are split;
- entities are decoded as browsers do;
- 'unchanged' is exact (one layoutOf);
- the last block can be emptied;
- the non-web model fallback and the empty-voice bypass are removed;
- the lossy options and on-screen readers are replaced by total readers and a round trip;
- keepsVoice is exact: the voice-over is written back with a note, and the on-screen lock is scoped by the late VOICE's reader and cannot fail open;
- the tokenizer ends tags and handles raw text, RCDATA and svg CDATA as browsers do;
- page reading and verification are linear;
- link addresses are named in the prompt;
- <br> runs go with deleted lines;
- there is no join across removals;
- the verifier accounts for merged text chain by chain and now checks invariant 5.

This meets the review's acceptance line: no repair or model step silently adds back or alters protected human copy. It is not claimed for C5's gate retry (VOICE-RETRY, parked), which drops the late-VOICE answer by a different mechanism.


**Changes forced by the adversarial rounds (last round)**
- Root-cause MUST-FIX 1 and regression MUST-FIX 1 (the C5 flow premise). ACCEPTED and verified:
- interpreter.ts:131-151 re-enters a stage from its entry ports (lines 139 and 147);
- a failed gate throws RetryStage (interpreter.ts:679);
- c5.ts:132-144 has no writer after the late VOICE, and render produces only a view (parts.ts:134-135);
- the voice port is the answer text (interpreter.ts:409).
In canonical C5, therefore, every keepsVoice writer runs with voice equal to the VO script.
Corrected:
- severityRationale, which now cites the live script-phase gap: appended or reordered voice-over accepted today (probe-keeps; probe-lock2 s3, s4 repoToday []);
- cons, notDoing, compatibility, the ADR text and acceptance test 19.
The parked 'second-pass cut fails the step' row is withdrawn, because that cut is stored today and under A (probe-lock2 g1).
As the regression critic asked, the on-screen branch is now a plain exact refusal: no restoration by position and no special shot message. It is composed-only.
The retry loss is decided explicitly. It is a separate root cause (stage re-entry in workflow code, not a weak check), so it is parked as VOICE-RETRY with:
- an ADR sentence;
- a backlog row listing both the workflow fix and the interim openCheckpoint disclosure;
- the characterization assertion in c2-c5.ts.
The cluster no longer claims the copy is kept across a gate retry.
- Root-cause MUST-FIX 2 (the lock fails open). ACCEPTED and fixed at the root with the critic's first suggestion. The scope is now the late VOICE's own total reader accepting the voice as this storyboard's complete deck, whatever the values. It no longer compares a layout with the deck. Results in probe-lock2:
- the value after a blank line, the indented continuation and the lowercase labels with a value on the next line are each locked, and a caption change after them is refused;
- the whitespace-only caption change is written at VOICE (layoutOf keeps value whitespace) and locked after;
- a shot-labelled VO script (s1) and the second pass after a retry (g1) stay unlocked.
One layoutOf, line-based and never the reader (as in revise-E-r2/readers.mts), now defines both the round trip and the no-op test; the lock no longer uses any layout. The critic's tests are added, asserting that the caption cannot change. They assert refusal rather than restoration, per the regression critic's simpler rule.
- Regression MUST-FIX 2 (operators.ts e2e; the write-back was silent). ACCEPTED and verified: operators.ts:162-182 expects two fix:media calls, and the second must carry 'own words must stay exactly as written'. probe-lock2 s5 shows the design writes the voice-over back after one call (today's check: repoToday lists both lines).
- Step 6 rewrites that test: one call, out.voiceover equal to the script, and a note.
- checkedWrite returns the restored fields, and model-step.ts, relay.ts and asset.ts add a step-finished note.
- An obedient write stays byte-identical with no note (s6).
- The ADR records it, and the compare-skip case is explained by the note.
- Regression shouldConsider (search to witness) and root-cause shouldConsider (cap message leads nowhere). ACCEPTED. Placement returns its removals. The verifier checks each one against the removability and <br>-run rules, compares before (less the removals) with after token for token in linear time, then does chain accounting and the fresh read. The search, the memo, the cap and the cap message are gone.
- A lying witness is refused (r4_witness_claims_unchanged_line_removed, _claims_removal_page_kept, _hides_removal).
- Timings: the 24,010-tag list verifies in at most 131 ms, the 20,000-path SVG in 67 ms, and 1,000 identical items in 16 ms.
- Four simulated bad pages now fail at the markup step instead of a later invariant; all are still refused (compare8.out.txt).
- Root-cause shouldConsider (confirmation bit), root-cause shouldConsider (guard catches only verbatim swaps) and regression shouldConsider (guard confirmation). ACCEPTED at the root: the deck hid where links go. The relabel guard and its confirmation are removed, and the VOICE prompt suffix now names each link part's address (r4_legend_footer, r4_legend_nav, r4_demoPage_legend). Reworded and verbatim swaps are placed as the person wrote them (r4_k2_reworded_swap, r3_footer_links_swapped), and the k3 case no longer depends on a confirmation bit (r4_k3_first_offer, r4_k3_reask).
- Root-cause shouldConsider (one bracket grammar). ACCEPTED. Brackets and escaping backslashes are notation on every page line, and literal ones are shown escaped on every line.
- A line with no link refuses an unescaped bracket with the escape hint (r4_k1b).
- A whole-link line takes plain words or one pair around the whole line (r4_k1, r4_k1x).
- Escapes on plain lines write literal brackets (r4_k1c, r4_plain_*).
- In-flight alignment compares words only, so old unescaped decks still align (r4_plain_literal_brackets_inflight_*).
- The demo deck has no escapes.
- Root-cause shouldConsider (CDATA in foreign content, raw-text elements). ACCEPTED. Inside svg or math, '<![CDATA[' up to ']]>' is opaque. iframe, xmp, noembed and noframes are raw text, plaintext is opaque to the end, '<textarea/>' still opens raw text, and title is RCDATA and offered. Cases: r4_k4*, r4_k5*, r4_xmp, r4_plaintext, r4_svg_style, r4_title_rcdata_full and r4_tok_*. The demo page's tokens are still identical to the repo's.
- Root-cause shouldConsider (verification shares the reader). ACCEPTED: the claim is corrected to 'independent of placement, not of the reader'. The reader's browser-faithfulness is tested on its own (steps 9 and 10).
- Root-cause shouldConsider (the web lock ignores hrefs and visibility). ACCEPTED in part. The page lock now compares each link part's href by position as well as the deck: retargeting in a sentence or in the nav, and a changed link span, are refused (r4_lock_*). Visibility is not checked; this is stated, and acceptance test 20 is corrected. The path is latent: COMP-1 bounds writers after VOICE by the nearest canonical recipe, and only C5 has any.
- Root-cause shouldConsider (define firstOffer). ACCEPTED: firstOffer means the answered checkpoint's initialText equals FinishHumanInput.initialText, never 'equals the current deck'. A missing checkpoint counts as a first offer, which is stricter. An activity test with an in-flight old deck is added (step 11).
- Root-cause shouldConsider (omitted reader-facing copy). ACCEPTED: textarea default text, svg CDATA text, xmp and plaintext content, and noscript content are listed with the other exclusions. Title RCDATA is fixed rather than listed.
- Root-cause shouldConsider (silent restore discards a CUT directive on locked copy). ACCEPTED: the step-finished note names the written-back voice-over. Locked on-screen copy is no longer restored; it is refused.
- Root-cause verdict challenge. ACCEPTED in part. The severity example is replaced by the live C5 script-phase gap. fixesRootCause stays 'yes' for F07's root cause, since the fail-open scope is fixed. The gate-retry discard is carved out explicitly as VOICE-RETRY and not claimed, and the cluster headline is narrowed to match.
- Regression shouldConsider (the escape hatch is unreachable from the web UI after a re-ask). ACCEPTED and verified: interpreter.ts:396 re-asks with initialText equal to the person's answer, and TextPanels.tsx:132-135 'Go back to the starting text' restores that answer. Every refusal that names a line or field now quotes its offered text from input.initialText (at most 5 quotes of 80 characters), and so does the pure-code fault message.
- Regression shouldConsider (the guard covered only writeVoice). ACCEPTED. A fault in openCheckpoint's deck read becomes a non-retryable StepError with a plain message. checkedWrite computes before's locked deck before the model call and turns any internal fault into a non-retryable StepError, so no paid call is repeated (acts.ts would otherwise retry an untyped error 3 to 5 times). The boundary is stated in the design and the ADR instead of the broader claim.
- Regression shouldConsider (proportionality). ACCEPTED. Every lock branch except the canonical voice-over write-back is a plain exact refusal, and tests are weighted to the script phase. The ADR notes that the no-before round trip is practically unsatisfiable for web pages.
- Regression shouldConsider (staging). ACCEPTED. Stage 1 covers non-web exactness and every lock; stage 2 is the page engine. Each is activity-only with its own bundle-hash check, so C2, C4, C5 and C7 do not wait for the page work.
- Regression shouldConsider (checked and holding). Noted. The ADR adds that copy.ts must not be bundled under the 'browser' export condition.
- Regression smaller items. ACCEPTED. The on-screen panel's fallback to the plain editor for two-line captions is stated in acceptance test 18. The suffix is computed from the artifact and appended once per checkpoint, including re-asks (acceptance test 23).
- Found while revising: round 3's verifier never implemented invariant 5; only placement refused nameless controls. It is now in the verifier (r4_emptyLinkKept_badPage), so three placement-refused cases are flagged by both (compare8.out.txt).
- Found while revising: in HTML content, '/>' on a raw-text element is ignored by browsers, so '<textarea/>' still opens raw text (r4_tok_textarea_selfclosing).
- Kept from earlier rounds, all still holding (115 of the 125 cases shared with proto7 are identical, and compare8.out.txt explains the other 10):
- total non-web readers and the round trip before the bytes-equal shortcut;
- piece-aligned formatting;
- minimal escapes;
- in-flight alignment and the first-offer rule;
- the positional deck;
- the aria-label CTA rule;
- links across <br>;
- <br> runs and the union-find no-join;
- chain accounting;
- no model, and AnswerRejected only for VOICE answers;
- the claim-log limited to prose;
- <pre> excluded;
- parse-entities;
- the compatibility profile;
- P1 severity.
- Process note. A temporary dump of earlier critiques was first written to the round3 folder root, which is neither the repo nor the review folder, then moved into revise-E-r3-1b. All probes ran from that folder with pnpm exec tsx, importing the repo read-only, and git status stays clean at b33f1285.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- Both critics' must-fix 1 (the C5 flow premise) is closed, and I checked it against the repo. runStages re-enters a stage from its entry ports (interpreter.ts:131-151, lines 139 and 147). The late voice('voice') in c5.ts:136 is followed only by render (parts.ts:134-135, which produces a view only) and the gate, whose retry goes to D2. distill(...,true) puts apply-cut and apply-swaps before the late VOICE. The validator's PR6 and COMP-1 (advisor/profile.ts:150-189) leave C5 as the only canonical recipe with model writers after VOICE. So every canonical keepsVoice write runs with voice equal to the VO script. The design now says this everywhere, drops the false 'second-pass cut fails' row, and makes the on-screen branch, which only composed recipes reach, a plain exact refusal. Both critics allowed parking the retry loss (VOICE-RETRY). Remaining nit: the activity-only interim (openCheckpoint names or pre-fills the earlier late answer) is cheap. The backlog row should be rated like F07, because a person who sends the second offer back unchanged ships model copy.
- Root-cause must-fix 2 (the lock fails open) is closed. The scope now comes from the late VOICE's own total reader, read against before's labels, whatever the values. revise-E-r3-1b/probe-lock2.out.json shows:
- d_valueAfterBlankLine, d_indentedContinuation, d_lowercaseLabelsNextLine and d_whitespaceInValue are each locked, and a caption change after them is refused;
- s1 and g1, where the voice is the VO script, stay unlocked;
- one line-based layoutOf now defines both the round trip and the no-op test.
A voice port that was a no-op answer (offered layout, unchanged) parses under the same reader, so it locks too. PR6 requires every model writer after VOICE to declare keepsVoice, so no unlocked writer can change the shot set between the late VOICE and a locked writer. Regression must-fix 2 is also closed: operators.ts:162-182 is rewritten in step 6, checkedWrite returns the fields it wrote back, and model-step, relay and asset add a step-finished note. All of that is activity-side: stepFinished already takes a note, and applyModel ignores it.
- New edge case: the total on-screen reader keys shots by number, and StoryboardSchema (formats.ts:115-132) does not require shot numbers to be unique. On a storyboard whose shots read [1,2,2], every changed late-VOICE answer is refused. Keeping both 'Shot 2' lines gives 'Shot 2 appears twice'; dropping one gives 'Shot 2 is missing'. Only sending the copy back unchanged gets through, so the ad ships with model captions. Today applyOnScreen accepts the answer, though it loses copy. Probe: check-E-r3-1/probe-dupshot.mts and probe-dupshot.out.json.
- Residual coincidence c1: a VO script that is exactly this storyboard's complete labelled deck (Headline:, Tagline:, Shot 1..n) locks the on-screen copy during the script phase. A CUT that removes a shot is then refused twice, which gives ContractMissed and fails a paid run after D2's video spend. The design calls this negligible. A cheap refinement would close it: count the voice as the on-screen deck only when it does not equal before's voice-over. In the script phase the voice is the voice-over.
- Wording and inventory gaps:
(a) The cluster headline and the ADR say the copy is 'held exactly against every later machine write, in every medium'. But the page lock skips visibility (hidden, style, class). And with a handed-in voice and a before artifact, the lock keeps before's copy, which may be the model's, and the note would wrongly say 'as you wrote it'.
(b) The ADR is written in stage 1 but describes stage-2 web guarantees. Until stage 2 ships, mark the web parts as pending.
(c) Step 3 deletes lostVoiceLines, but formats.test.ts:163-174, which tests it, is not in the step list. That includes :173's 'not in before is not required' semantics, which the design reverses.
- Tokenizer residual in the same family as quoted '>' and CDATA. Script-data escaped states are not modelled: a '<script>' holding '<!--' and an inner '<script>…</script>' string closes early at the first '</script'. The design's scanner would then offer script bytes as a deck line, and the shared-reader verifier would accept an edit to them.


## Cluster F: Medium-specific execution contracts (C7 brief, C5 video evidence, optional illustration, media slots)

**Root cause.** The runtime does not execute what each step's declaration, prompt and product copy promise. Where they differ, it either fills the gap with an ad hoc generic rule or has no honest degraded outcome. A shortfall against a promise is then accepted silently, turned into a fatal ContractMissed, or turned into futile paid repairs.

- **Inputs (F09).** The recipe IR can only declare required inputs, so a port that only an optional branch produces cannot reach a later step. The human step that answers the interview also replaces the questions it answers instead of revising them.
- **Evidence (F10).** Render is never told which relay link it renders, and the clip's frames are never bound to its shot. A generic whole-storyboard view of pre-chain stills stands in for the clip. With no 'could not observe' outcome, missing evidence becomes 'No defects.' or futile regenerations.
- **Outputs (F11, F12).** How many images an ASSET step may return is decided by medium in checkBriefs, while each prompt states its own count. Slot identity is re-derived differently at each use. A short answer, too few images or a missing shot, has no outcome between 'accept silently' and 'fail the run'.

All four share one test blind spot: mocks and e2e operators always return the happy shape, and scripted check answers ignore their input. No test compares what a step is promised with what it receives or accepts.

The wrong assumptions sit at four concrete boundaries:
- recipe IR port typing;
- the human checkpoint for a step that revises a port;
- the RENDER view inside a relay link;
- the ASSET brief contract (declared count, slot identity, short-answer outcome).

The fix is one correction at each, plus tests that compare prompts with the runtime. A single framework spanning them would be speculative.


### F09: C7 collects clarification that its implementer does not consume

- **Verdict:** ACCEPT_PARTLY · **Severity:** P2 (review: P2) · **Label:** correctness / human direction dropped (IR cannot express an optional read; the human step replaces the questions it answers)

**Rationale.** The core defect is real, and both verifiers reproduced it end to end.
- c7.ts:46-50 runs the optional spec interview: modelVision 'interview' (brief), then humanVision 'spec' (consumes brief, produces brief, variant VISION-lite).
- c7.ts:55 is build('c7','implement',['intent']). buildPrompt (prompting.ts) fills slots only for consumed ports, so the {{#if brief}} block in product.c7.implement.md never renders.
- The presentation still says 'Your turn: answer them in a short spec' (presentation.ts:426).

The defect is wider than the review says. Even once the port is wired, the person's direction arrives in a form that cannot be used:
- interpreter.ts:416 (`if (s.produces.includes('brief')) out.brief = text`) replaces the interview's numbered questions and defaults with whatever the person types.
- The checkpoint asks the generic VISION-lite question ('what is this for, and what is the one point it must land?', wording.ts:30-31) and does not ask them to answer the questions.
- So implement would receive answers like '3: keep the CSV header' with no question 3, and none of the defaults the person accepted by leaving them alone.

I accept it only partly, for three reasons:
(1) The review names the symptom as the root cause. The blocker is in the IR and validator: scope.ts:80-82 (ST5) lets a step consume only `must` ports, and an `optional` is typed as the intersection (scope.ts:131-133). The catalog could not wire the brief without failing validation.
(2) 'Requiring a port an optional may never produce would introduce another bug' is wrong. The validator rejects it before it ships, and at runtime an absent brief already renders cleanly (buildPrompt fills '', and syntax.ts `present` treats '' as absent).
(3) Narrowed after the critique. The demand that the brief reach 'subsequent revisions' was not reproduced, but a plausible path exists. product.c7.scope-cut sees only the diff and its 'Why:', so it could list behaviour the brief asked for as unneeded, and apply-scope-cut would remove it. The 'Trim the scope' explainer (presentation.ts:436) also claims the reviewer 'lists what the task did not ask for', which it cannot know. The remedy is not to feed the brief into the deliberately blind passes (C7-DR7). It is to have the implementer's 'Why:' name the brief's requirements, which is the channel scope-cut already reads.

The repo already tracked the wiring half as prior work (docs/backlog.md 'Product follow-ups' row 1, template frontmatter, coverage.test.ts:46-48 exemption). Nothing has fixed it.

**Severity rationale.** P2, at the low end.

Why not lower:
- The path is ordinary: confirm 'the requirements are vague', pay for the interview, write the spec.
- The person's direction is then silently discarded. That breaks VISION ('the person's answers lead') and ADR-0069/CR11 honesty, and nothing on screen says so.

Why not P1:
- Only one optional branch of one recipe is affected.
- There is no money, data or security exposure beyond one wasted mid-tier call.
- The output is a diff the person reviews, and putting the clarification into the original request works around it.

**Root cause.** Two wrong assumptions, at two boundaries.

(1) Recipe IR. Steps have only hard inputs (`consumes`, which must be in scope on every path). There is no way to say 'read this port when an optional branch produced it', so ST5 forbids exactly the wiring C7 needs. The catalog therefore dropped `brief` from implement's inputs.

(2) Human checkpoint. A human step that consumes and produces the same text port is treated as writing that port from blank: no initial text, a generic question, and the answer replaces the port. 'Consumes P and produces P' should mean the person revises P. Because it does not, the interview's questions and defaults are lost even when the port is wired.

A test gap hid both:
- The C7 e2e declines the interview.
- No test asserts that the brief reaches implement (C4 has that assertion at text-media.ts:49; C7 has none), or that the brief is self-contained.


### F10: C5's shot critic observes the storyboard/still instead of the actual clip

- **Verdict:** ACCEPT · **Severity:** P2 (review: P2) · **Label:** correctness / evidence observation (the check never observes its subject)

**Rationale.** Confirmed by both verifiers and by my own reading.

What the check sees:
- c5.ts:76-113 runs, per relay link: clip, then loop(render 'shot-render', check 'shot-check', regenerate) until check-clean.
- render.ts:61-67 builds the media view from the whole storyboard's text and the ASSET stills only (s.imageArtifactId). It never reads clipArtifactId.
- relay.ts:176 stores only clipArtifactId on the shot. The clip's last frame goes only to the anchor port. storyboardText (formats.ts:275-279) deliberately omits clips (BLIND-1).
- The interpreter passes only artifactIds to renderView (interpreter.ts:271), so the view is never scoped to ports.shot.

Consequences:
- The checker gets byte-identical input for a clean clip and a defective one, and for shot 1 and shot 2. The verifiers saw identical prompt hashes and request fingerprints.
- The loop exits only on the exact 'No defects.' (interpreter.ts:579). A flaw in any still therefore drives paid regenerations that cannot change the checker's input, up to the cap question (interpreter.ts:602). The reproducer measured 9 video calls instead of 3.
- With no video provider the check still runs on the stills and reports 'No defects.' for clips that were never made.

The wording promises more:
- product.c5.shot-check.md (system: 'the shot's frames'; bullets on motion, flicker and drift between frames);
- product.c5.regenerate.md ('defects in the clip');
- the Motion explainer (presentation.ts:292-295).

No ADR or backlog row accepts the gap. ADR-0079 says 'What the critic is told it sees is what it is shown', and commit ddb269f applied that principle only to the launch gate. The review understates the impact: the check is not scoped to the shot, regenerations are futile, and the no-video case reports clean. Its line references are accurate.

**Severity rationale.** P2, for these reasons:
- In every live C5 run with a video key, the paid per-shot QA the product advertises is inert for clip defects.
- It wastes money: defects in the stills drive regenerations that cannot change the checker's input.
- It labels clips that were never made 'No defects.'.

Not P1: no data, security or human-edit guarantee is at stake. C5 is labelled Untested, clips are shown on the timeline, and the launch gate already discloses that it judges the storyboard only. Urgency grows with live C5 use.

**Root cause.** Render is never told which relay link it is rendering, and the clip's own frames are never bound to its shot. The media view was defined once, generically (spec §3.2 and render.ts), as 'the whole storyboard as text plus each shot's frame', where the frame is the pre-chain ASSET still.

When the relay chain added clips, nothing changed in the view:
- relayLink records the clip on the shot but not its last frame, although the gateway already returns and stores that frame (relay.ts:174, 181).
- The interpreter knows ports.shot and ports.linkStart but does not pass them to render.

The check-clean loop also has no 'could not observe' outcome. Missing evidence therefore becomes either 'No defects.' or futile repairs, never 'not checked'.

Corrected after the critique: the image-only gateway contract is not part of the cause. The clip's last frame already reaches ports.anchor on every link.

The shot-check, regenerate and Motion wording follow the protocol's intent (03 C5 per-shot defect check), which the runtime never built.


### F11: C3 prompt allows no illustration while runtime requires one

- **Verdict:** ACCEPT_PARTLY · **Severity:** P3 (review: P2) · **Label:** prompt/runtime contract mismatch (image cardinality) and a fatal outcome for a short answer

**Rationale.** The mismatch is real:
- product.c3.asset.md and helper.asset.briefs@prose.md permit an empty list.
- checkBriefs (asset.ts:176-178) forces at least one brief through Math.max(1, cap) and 'Write at least one image brief.'.

Both verifiers reproduced the outcomes with the real C3 step:
- Empty, then one brief: an extra call, then an image is bought.
- Empty twice: askModel (call.ts:84) throws ContractMissed, which becomes a non-retryable StepFailed and a RunFailure. The run fails after the D1/D2 human work.

I accept it only partly:
(1) ContractMissed requires the model to return empty again after explicit corrective feedback. The typical outcome is one extra mid-tier call followed by the image.
(2) helper@prose is not reached by canonical or composed recipes. Every canonical ASSET step names a product or article prompt (asset.ts:63 uses it whenever it exists), and composed recipes must reuse catalog prompts (advisor/src/profile.ts:124-131).
(3) 'Unwanted image purchase' is overstated for C3. The step sits behind optional('asset-if-wanted', 'you want a header image…') (c3.ts:54), so the person has already said yes. The prompt's empty-list line is a model veto over that decision, and protocol 03 C3 has no such veto.

The critique also showed that a 'zero allowed on prose and web-page' rule would be wrong. The reachable prompts on those media (product.c3.asset after its v2, article.ASSET in C1/C1-H, helper@web-page) all ask for at least one image. Only helper@prose offers zero. Cardinality therefore belongs to the prompt, not the medium.

There is no backlog entry, ADR or test for this, and the demo mock always returns at least one brief.

**Severity rationale.** The worst case is serious: the run fails late and cannot be resumed. It needs all of the following:
- a live image key;
- the person's opt-in;
- a model that ignores explicit corrective feedback and returns empty a second time.

The realistic consequence is one extra cheap call, plus the model's 'no image' overridden in favour of what the person asked for. No money, security or human-edit guarantee is broken. That makes it P3, borderline P2 only if you weigh the worst case alone.

**Root cause.** Two wrong assumptions.

(1) The runtime decides how many images an ASSET step may return from the medium (checkBriefs: 'at least one, at most the slots knob' for every medium without expected slots). Meanwhile each prompt states its own count: C3 'up to 1' (with a veto), article.ASSET and web-page 'up to 3', helper@prose '0 to 3'. Two definitions, and they disagree.

(2) A short answer, one that is well formed but has fewer images than asked, has no honest degraded outcome. askModel's one repair retry turns it into feedback, and a second short answer into a fatal ContractMissed. Yet assetStep already has an honest pass-through for 'no image could be made' (asset.ts:97-99) that this case could use.

Separately, the C3 prompt gives the model a veto over a decision the person already made at the optional gate.


### F12: Media slots validate one representation and attach using another

- **Verdict:** ACCEPT_PARTLY · **Severity:** P2 (review: P2) · **Label:** correctness / slot identity, coverage and relay-anchor binding

**Rationale.** All three mechanics reproduce with the canonical C5 anchor-frames and C2 mood-boards specs.

Whitespace and alias slots:
- checkBriefs filters on trim/upper (asset.ts:173) but deduplicates on the raw string (:174).
- Media attach matches the raw string (:193-194). Options attach uppercases without trimming (:188). Announce uses Number(raw) (:88).
- So ' 1 ' buys an image that never attaches to shot 1, and '1' plus ' 1' buys 4 images for 3 shots.

Coverage and anchor:
- checkBriefs accepts any non-empty subset.
- Per-slot gateway failures that survive the gateway's own retries (refused, provider-error, invalid-request) are swallowed (asset.ts:93). C5's anchor-frames runs with tries=1 (asset.ts:56).
- The anchor is the lowest-numbered image that was made (asset.ts:140-143), not shot 1's frame.
- So a missing or failed shot-1 image silently makes shot 2's still the start frame of shot 1's paid clip (relay.ts:130, interpreter.ts:694). Regenerations reuse that start, because linkStart is fixed per link.
- This contradicts ADR-0069 and spec §3.2 ('the first link starts from shot 1's frame') and spec §3.3 ('one image per storyboard shot').
- With no anchor at all, relayLink calls video with no start frame, and fal throws invalid-request (fal.ts:142), which fails the run.

I accept it only partly:
(1) The review's one-line root cause ('validate one representation, attach another') covers only the whitespace and alias half. The consequential half is the missing coverage rule and the anchor taken from whichever image was made.
(2) In the whitespace case the image is not wasted: it is announced as shot 1 and is still the right anchor. Only the storyboard's stored still is missing.
(3) Whitespace and alias slots are improbable from real models, given the explicit format examples. The realistic trigger is a non-retryable failure on shot 1, or a model that omits shot 1.

Nothing in the backlog or the ADRs covers this, and the tests exercise only the mock's exact, complete slots.

**Severity rationale.** The low end of P2, driven by the anchor substitution. When shot 1's brief is missing, or its image fails after the gateway's retries, a paid opening clip and its paid regenerations are generated from the wrong frame. There is no note, against a documented contract.

The whitespace, alias and duplicate-purchase parts are P3 on their own: one or two image calls, under improbable model output.

Not P1: clips are visible on the timeline with their shot numbers, and no human work is lost.

**Root cause.** assetStep has no single typed slot identity, no declared coverage rule, and no honest outcome when coverage falls short.
- Parse keeps the raw string. Validate, deduplicate, attach, announce and the anchor sort each use a different form of it (trimmed or uppercased, raw, untrimmed uppercase, Number()).
- Coverage is 'at least one matches', not 'every expected shot or option, else say which are missing'.
- Per-slot failures are swallowed; only total failure is reported.
- The relay anchor is taken from whichever image was made, not from the storyboard's first shot.
- The relay has no honest outcome for 'no start frame', so the only alternatives are substituting another shot's still or failing the run on fal's invalid-request.


### Options


**A. Make the promises match today's runtime (narrow and disclose only)** (fixes root cause: no; effort S; risk low)

Change words and catalog wiring, not mechanisms:
- **C7:** remove the optional spec interview, or tell the person that the spec is not passed to the build.
- **C5:** rename shot-check to an 'anchor still check', reword the shot-check, regenerate and Motion copy, and end the loop when the link made no clip.
- **Prose prompts:** delete the 'return an empty list' lines.
- **F12:** pick the anchor only from shot 1's image.


*Pros*
- Small, low-risk edits to prompts and catalog only.
- Stops the false claims at once.

*Cons*
- Removes the value instead of delivering it: the C7 interview becomes pointless, and C5 still has no per-clip QA.
- Keeps two definitions of image count and the raw-slot identity bugs.
- Keeps the fatal ContractMissed for a short answer.
- Leaves the IR unable to express 'read if present'.
- Partial coverage is still silent.


**B. The review's suggested repair, as written** (fixes root cause: partly; effort XL; risk medium)

Follow the review's root fixes literally:
- **F09:** produce a brief on both paths (a pass-through brief on the skip path) and pass it to implement and every later revision.
- **F10:** a full video-evidence view with timestamps, frame sampling and preceding-shot evidence, or direct video input to the model.
- **F11:** accept an empty list on prose as success everywhere, keeping C3's model veto.
- **F12:** normalize once, check coverage before buying images, and take the anchor from shot identity.


*Pros*
- Satisfies the review's acceptance list literally.
- F12's part is essentially right.

*Cons*
- F09: the IR has no else-branch for `optional`. A skip-path brief needs a new pass-through executor or a paid model step, and routes around the IR gap instead of closing it. It also leaves the interview's questions overwritten by the answer.
- Pushing the brief into C7's blind revision passes breaks C7-DR7.
- F10: direct video input needs contracts and provider changes (ContentPart and MediaType are image-only). Frame sampling inside the paid video call adds a new billed-but-fatal failure point (gateway.ts:394-399).
- F11: 'empty is success on prose' is keyed on the medium, which contradicts the reachable prompts (C3 v2, article.ASSET) and silently drops the image the person asked for. It also keeps the model's veto over the person's yes.
- F12 as written makes coverage a hard parse problem, so a model that misses a slot twice fails the run late, the same harm F11 reports.


**C. Correct each boundary where its assumption lives (revised)** (fixes root cause: yes; effort L; risk medium)

Four focused corrections, plus tests that compare prompts with the runtime.

(1) **IR, optional reads.** Model steps gain `reads`: ports read when present, never required, validated against `may`, and held to the port rules through inputsOf(step). C7 implement reads `brief`. This is the backlog's own proposal.

(2) **Human revise-in-place.** A human react step that consumes and produces the same text port opens with that port's text as its initial text. Its question asks the person to answer or change it in place. The answer replaces the port, so C7's brief carries the questions, answers and defaults together. product.c7.implement v3 asks the 'Why:' to name the brief's requirements, so the blind scope-cut can see them.

(3) **Link view from frames that already exist.** relayLink records the clip's last frame on its shot. Inside a link, render shows only that shot's line, the frame the clip started from and the clip's last frame, under captions. With no clip, the view cannot be observed, so the check is skipped and the loop ends 'not checked'. shot-check v2 reports only defects the clip introduced. No contracts or gateway change.

(4) **ASSET brief contract.**
- Each image-briefs template declares its count in frontmatter (`images: each | min-max`), and the runtime reads that declaration. One slot plan owns identity, coverage, attach and the anchor (shot 1's frame or none).
- A short answer gets the one feedback retry and then degrades honestly (partial or no images, named in the note), never a run failure. Only malformed answers stay fatal.
- A relay link with no start frame is skipped plainly. C3 v2 drops the model's veto.


*Pros*
- Each fix sits where its wrong assumption lives, and each closes it for every recipe, not only the reported case.
- Cardinality has one source per prompt: no per-medium rule that contradicts reachable prompts. C1 and C1-H are unchanged on every normal path.
- Removes the fatal outcome for short answers (F11's real harm) without adding new late-failure paths (F12 as written).
- F10 needs no contracts, gateway, ledger or estimate change. The checker's input now depends on the clip and the shot. Futile regenerations from other shots' stills, and from defects inherited from the start frame, are removed.
- Reuses existing mechanisms:
  - `may` typing;
  - buildPrompt's empty-slot handling and {{#if}};
  - CheckpointSpec.initialText and ReactPanel's prefill (checkpoints.ts emptyDraft);
  - RENDER-1 captioned image groups;
  - the pass-through convention at asset.ts:97-99;
  - ADR-0069's honest skip notes.
- Preserves C7's blind revision passes (C7-DR7) and the BLIND-1 storyboard text.

*Cons*
- Additive recipe schema change, and c7's hash changes. Needs an IR ADR.
- Additive contract change: RenderedPrompt.images. askModel gains a 'usable shortfall' path, which is runner-internal.
- The interpreter changes (toStepSpec copies reads, revise-in-place prefill, link context on render, the unobservable skip and LoopExit 'unchecked'). Per ADR-0078, runs waiting for a person under the old bundle end plainly. Ship as one release so this happens once.
- The clip is observed through two still frames (first and last), not its motion. The wording says so, and middle-frame sampling is parked.
- Touches about four areas: recipe/validator, the human checkpoint, render and the interpreter loop, and asset/relay with prompts. Honest effort is L.


**D. A generic declarative step-contract framework** (fixes root cause: yes; effort XL; risk high)

Template frontmatter, or a new recipe field, would declare every step's required and optional inputs, the evidence it needs and its output cardinality. The validator, runner, mock and presentation would all be generated from those declarations.


*Pros*
- One source of truth for every step's input, evidence and output contract.
- Would catch future mismatches of this kind mechanically.

*Cons*
- Speculative: four findings at four boundaries do not justify a new metadata language. Option C's single `images:` field is the only declaration the evidence calls for.
- Touches every template, the IR, the validator and the mock at once, with every recipe hash changing.
- Against the 'smallest design that removes the wrong assumption' standard.


### Recommendation: C

**Why.** Option C removes each wrong assumption at the boundary where it lives, using mechanisms the repo already has.

**F09.** The blocker is the IR. `reads` is the backlog's own proposal. buildPrompt already fills an absent port with '' and the template's {{#if brief}} omits the section, so only typing and wiring are missing. The second half is the human checkpoint. CheckpointSpec.initialText exists, and ReactPanel already prefills from it. Making 'consumes and produces P' mean 'revise P in place' keeps the interview's questions and defaults in the brief, with no new port and no C7 special case.

**F10.** The smallest correction that makes the checker observe its subject is to tell render which link it is in and to bind to the shot the last frame the gateway already returns. That makes the checker's input depend on the clip, scoped to its shot. A 'not checked' outcome replaces 'No defects.' when there is no clip. This follows ADR-0079 RENDER-1. The critics showed that middle-frame sampling inside the billed video call would add a new fatal failure point, so it is parked as an optional, best-effort follow-up.

**F11 and F12.** Both live in the same few lines of asset.ts, and both critics showed that the first design moved the image count to the wrong boundary (the medium) and added a late-failure path. The count is now declared by the prompt that states it. A short answer gets the one feedback retry and then degrades honestly instead of failing the run. Slot identity, coverage and the anchor are owned by one plan.

The other options:
- A removes features the person pays for.
- B adds a pass-through brief executor, breaks C7-DR7, and adds new late failures.
- D is a speculative framework.

**Design.** Four changes, each at its own boundary. Both interpreter changes (A2 and C) ship in one release.

**A. Recipe IR: optional reads (F09)**
- @byway/recipe schema.ts
  - Step gains `reads?: PortType[]`; StepSchema adds `reads: z.array(Port).optional()`.
  - Export `inputsOf(step) = [...consumes, ...(reads ?? [])]`.
  - recipeHash strips undefined fields (hash.ts stripUndefined), so recipes without reads keep their hashes.
- validator/src/scope.ts, case 'step'
  - Each read port must be in `st.may`, else ST5 ('step X reads P, which no path produces before it').
  - A port in both consumes and reads is ST5.
  - `reads` on a non-model step is a structural error, because only model prompts read it today.
  - `reads` never adds to `must`.
  - Documented limitation: loops and relays are typed once (scope.ts:128-130, 142-146), so reading a port first produced later in the same loop body is rejected. The IR ADR records this and a test pins it.
- validator checks/ports.ts and defaults.ts: PR1 (judge extra ports), PR2, PR3, PR5 (briefs never to critics) and PR7.1 use inputsOf.
- runner
  - types.ts toStepSpec copies `reads`, and StepSpec includes it.
  - prompting.ts buildPrompt iterates inputsOf(step). An absent read fills '' exactly as an absent consume does, and the templates use {{#if}}.
- catalog/src/c7.ts: `build('c7','implement',['intent'], { reads: ['brief'] })`. Regenerate recipes/c7.json; c7's hash changes.
- prompts and advisor
  - coverage.test.ts: allowed slots come from inputsOf, and the C7 exemption (:46-48) is deleted.
  - advisor blocks.ts wiring signature shows reads; the compose prompt's recipe-shape notes mention reads.
- docs: engine spec 'Scope typing', product spec 'Prompt slots by port', and close backlog row 1.

**A2. Human revise-in-place (F09)**
- interpreter.ts human()
  - For a react step (humanKind 'react') with a text port P in brief or taste that the step both consumes and produces, and ports[P] non-empty, set checkpoint.initialText = ports[P].
  - The answer replaces P as today (:416). The text is in workflow state, so this is deterministic.
- wording.ts humanPrompt takes `consumes` as well. A vision step that consumes and produces brief asks: 'Answer the questions below in place, or change their defaults; anything you leave as it is keeps its default. What you send is the brief the next step works from.'
- Only C7 'spec' has this shape in the catalog. C4 vision-lite consumes intent, and C6 react produces taste from brief, so both are unchanged.
- product.c7.implement v3
  - Remove the 'does not consume it yet' frontmatter note.
  - Answer format: the 'Why:' paragraph names the requirements from the brief that shaped the change, when a brief is given. This is the only channel scope-cut reads, and it keeps C7-DR7 blindness.
- presentation.ts
  - 'Your direction' becomes 'Your turn: answer the questions or change their defaults; that becomes the spec.'
  - 'Trim the scope' becomes 'A fresh reviewer, who sees only the change and its "why", lists what the change does not need, and the AI removes what it lists.'

**B. ASSET brief contract (F11, F12)**

B1. Declared count, contracts first:
- contracts/src/prompts.ts: RenderedPrompt gains `images?: 'each' | { min: number; max: number }`. This is additive.
- @byway/prompts template.ts: the frontmatter gains optional `images:` matching /^(each|\d+-\d+)$/, and the renderer returns it. Declarations:
  - product.c5.anchor-frames, product.c2.mood-boards, helper@media, helper@options: `each`;
  - product.c3.asset v2: `1-1`;
  - article.ASSET and helper@web-page: `1-3`;
  - helper@prose: `0-3`.
- Prompt tests:
  - every image-briefs template declares `images`;
  - `each` appears exactly on the media and options templates;
  - a template's text offers an empty list exactly when its minimum is 0.

B2. Short-answer outcome (runner-internal):
- formats.ts `Parsed` failure variant gains optional `usable?: T`.
- askModel (call.ts):
  - passes the RenderedPrompt to parse as a second argument;
  - a miss that carries `usable` is retried once with the problem, as today;
  - if the retry still misses, it returns the latest usable value as `{ value, costUsd, shortfall: problem }` instead of throwing.
- Malformed answers (no usable value) still throw ContractMissed, so the general rule is unchanged.

B3. Slot plan: new runner/src/activities/slot-plan.ts.
```ts
type SlotPlan =
  | { kind: 'each'; medium: 'media' | 'options'; expected: readonly string[]; first?: string }
  | { kind: 'free'; min: number; max: number };
```
- `planSlots(medium, artifact, declared, knobs)` runs before any call.
  - media: expected = shot numbers ascending; first = the lowest.
  - options: expected = labels A, B, C….
  - If the storyboard or options do not parse, it raises a StepError before any model or image call.
  - prose and web-page: free, min = declared.min ?? 1, max = min(declared.max ?? 3, knobs.slots ?? ∞).
- `slotId(plan, raw)` is the one canonical identity.
  - Trim.
  - media: /^(?:shot\s*)?(\d+)$/i becomes String(Number(n)).
  - options: an optional 'option ' prefix is stripped, then uppercased.
  - free: the trimmed text.
  - An id outside `expected` (each plans) is unknown.
- `checkBriefs(parsed, plan)`
  - Rewrites each slot to its id, drops unknown slots, and collapses duplicates by id (last wins).
  - each: if any expected slot is missing or any slot was unknown, it is a miss naming both, with usable = the covered briefs.
  - free: slice to max; fewer than min is a miss ('Write at least N image brief(s).') with usable = the briefs.
  - A miss with usable triggers the one retry before any purchase, then degrades.

B4. assetStep
- Zero briefs:
  - free plan with min 0, answered without shortfall: no image or integrate call, the work is unchanged, and step-finished is not skipped, with NO_IMAGE_CHOSEN_NOTE ('The text asks for no illustration, so no image was made.').
  - Otherwise (a shortfall): skipped, with NO_BRIEF_NOTE ('The AI wrote no usable image brief even when asked again, so no image was made; the work passes through unchanged.').
- Images are bought per canonical brief. The plan's `first` slot gets max(triesPerSlot, 2) attempts, on top of the gateway's own retries of transient errors. Failed slots are recorded.
- The all-failed skip is unchanged.
- attach() and announce use canonical ids only.
- Media anchor = the image whose id is plan.first, else none.
- A partial result (missing briefs, failed slots or dropped unknown slots) finishes not skipped, with one note naming them. When the anchor is missing it adds 'No frame was made for shot N, so the video chain has no start frame.'

B5. relay.ts relayLink: if `ports.linkStart ?? ports.anchor` is not an image, finish skipped with NO_START_FRAME_NOTE ('Shot N has no frame to start from, so no clip was made.') before any model or video call. This applies after the existing NO_VIDEO check and replaces fal's invalid-request failure (fal.ts:142).

B6. product.c3.asset v2: drop 'If the piece is better with no image at all, return an empty list', and say the writer asked for a header image. helper@prose is unchanged (spec §3.3).

**C. Per-link clip evidence (F10), with no contracts or gateway change**
- formats.ts: ShotSchema gains `lastFrameArtifactId?: string`, added by the runner with the clip. storyboardText is unchanged (BLIND-1).
- relay.ts: writes clipArtifactId and lastFrameArtifactId onto the shot together. The regenerate step overwrites both.
- types.ts
  - RenderInput gains `link?: { shot: number; startFrame?: string }`.
  - ViewRef gains `groups?: { caption: string; imageArtifactIds: string[] }[]` and `unobservable?: string`.
  - imageArtifactIds stays the union of the groups in order, so checkpoints, critic.ts, lifecycle.ts and snapshots keep seeing the images.
- interpreter.ts
  - Render dispatch (:271) passes `link: { shot: ports.shot, startFrame: ports.linkStart }` only when ports.shot !== undefined.
  - A judging model step (check or critic) runs only when ports.shot !== undefined and at least one ports.view item is observable. Otherwise it is not called: it finishes through quick.skipStep with the view's reason, and afterGateStep throws LoopExit(id, 'unchecked').
  - The loop treats 'unchecked' like 'clean' (:518), returning current ports, but emits no loop-iteration, runs no regenerate and asks no cap question.
  - relay() already strips shot and linkStart on exit (:695), so the rule cannot fire outside a link.
- render.ts, media with link
  - Text = that shot's line only (length, description, on-screen caption, in storyboardText's format).
  - If the shot has clipArtifactId and lastFrameArtifactId, the groups are:
    - 'The frame this clip starts from:' [startFrame];
    - 'The last frame of the generated clip:' [lastFrameArtifactId].
  - Otherwise unobservable = 'No clip was made for shot N, so there is nothing to check.'
  - Views outside a link are unchanged, so the launch gate and BLIND-1 lineups are untouched.
- prompting.ts surfaceGroups emits `groups` with their captions (the RENDER-1 pattern).
- product.c5.shot-check v2
  - Says exactly what is shown: the shot's line, its start frame and the clip's last frame.
  - Asks for defects the clip introduced that are visible in the last frame: warping, garbled lettering, identity drift against the start frame, broken physics visible in a frame.
  - Reports nothing already visible in the start frame, because a regeneration from the same start frame cannot remove it.
  - Says that motion between the two frames (flicker, smearing, jumps) cannot be seen.
- Wording: the Motion explainer says each clip's last frame is checked against the frame it started from, and that without video nothing is checked. Spec §3.2 'Views by medium' gains the link view.


**Steps**
1. 1. Write the failing tests for B (packages/runner/test/slot-plan.test.ts and activities tests), using the canonical C5 anchor-frames, C2 mood-boards, C3 asset and C1 article.ASSET specs from CATALOG and the real prompt library:
- slots ' 1 ',2,3 attach all three;
- '1',' 1',2,3 buy 3; 'a','A','B','C' buy 3;
- 'Shot 1','2','3' attach shot 1;
- '2','3' then '2','3' again: 2 image calls after one retry, a note naming shot 1, no anchor, and the run continues;
- options 'A','B','Z' twice: 2 images, a note naming C and Z;
- shot 1's image() refused on both tries: no anchor, and the note names shot 1;
- 3,1,2 give anchor = shot 1;
- C3 {"images":[]} then one brief: 1 image (today's behaviour kept);
- C3 empty twice: 2 model calls, 0 image calls, skipped with NO_BRIEF_NOTE, no ContractMissed;
- helper@prose empty: 1 model call, 0 image or integrate calls, not skipped, NO_IMAGE_CHOSEN_NOTE;
- C1 article.ASSET empty once: a retry, exactly as today;
- malformed JSON twice: ContractMissed still;
- an unparseable storyboard: StepError before any call;
- relayLink with no start image: skipped, gateway.video never called.
2. 2. Contracts first (ADR-0068): RenderedPrompt.images. Then @byway/prompts frontmatter `images:` and the renderer, and the declarations on every image-briefs template, with prompt tests (declared, each-only-on-media/options, empty-list wording iff min 0). Then product.c3.asset v2.
3. 3. Runner: Parsed.usable and askModel's shortfall return (parse receives the RenderedPrompt). Then slot-plan.ts, assetStep rewired (canonical ids, coverage before purchase, anchor by id, two tries for the first slot, partial, zero and no-brief notes), and relayLink's NO_START_FRAME skip. Steps 1-3 make the B tests green. Update spec §3.3 (declared count, short-answer outcome, anchor rule).
4. 4. Write the failing tests for A and A2:
- validator: c7 with implement.reads=['brief'] validates; a read of a port no path produces gives ST5; a check reading brief gives PR5 or PR1; a port in both consumes and reads gives ST5; reads on a human step is rejected; a read of a port first produced later in a loop body gives ST5 (the pinned, documented limitation);
- prompting: a read port with and without a value;
- interpreter/e2e (text-media.ts): C7 with the interview accepted. The 'spec' checkpoint's initialText equals the interview's text. The operator changes only item 2. product.c7.implement's slots.brief holds item 1's 'Default:' line and the new item 2 answer, and the provider request contains both;
- C7 with the interview declined: no <brief> section, and the run finishes 'done'.
5. 5. Implement A: recipe reads and inputsOf; validator scope and port rules; toStepSpec and buildPrompt; c7 catalog with recipes/c7.json regenerated; coverage test (exemption removed); advisor blocks and compose notes. Implement A2: interpreter prefill and humanPrompt; product.c7.implement v3 ('Why:' names the brief's requirements); presentation 'Your direction' and 'Trim the scope' copy. Update the engine and product specs and close backlog row 1.
6. 6. Write the failing tests for C. Run the canonical C5 shot-render and shot-check through renderView and modelStep with a recording gateway:
- two links whose clips have different last frames send different shot-check requests;
- the shot-2 check attaches only shot 2's start frame (shot 1's last frame) and shot 2's last frame;
- a shot with no clip gives an unobservable view.
Interpreter-level:
- no video key: zero shot-check model calls, each shot-check step skipped with the reason, no regenerate, no 'Use the best version so far?';
- a defect only in shot 2's or shot 3's still with clean clips: 0 regenerations and 3 video calls;
- the unobservable rule never fires outside a relay (a composed recipe with a judge after the chain still calls it).
7. 7. Implement C: ShotSchema.lastFrameArtifactId and relayLink writing it; RenderInput.link; ViewRef.groups and unobservable (imageArtifactIds kept as the union); the render.ts link view; surfaceGroups captions; interpreter link context, the restricted skip and LoopExit 'unchecked'.
8. 8. Bump product.c5.shot-check to v2 (what is shown; only defects the clip introduced; motion not visible). Update the Motion explainer and spec §3.2. Add a test comparing the frame captions with the template wording. Update the e2e c2-c5 assertions: in the demo, the shot-check request carries the link's start frame and that clip's last-frame placeholder.
9. 9. Write the ADRs, append-only: an IR ADR (optional reads) and a product ADR (media and human execution contracts). Add backlog rows for the parked items. Run the full suite (pnpm vitest run) and the e2e gate, and release A2 and C together.


**Acceptance tests**
- F09: in the C7 e2e with the interview accepted, the 'spec' checkpoint opens with initialText equal to the interview's numbered questions and defaults.
- F09: the person changes only question 2. product.c7.implement's slots.brief contains question 1 with its 'Default:' and question 2 with the new answer, and the provider request contains both. Today implement's slots are [medium, problem] and nothing of the spec reaches it.
- F09: with the interview declined, the implement render has no <brief> section and the run finishes 'done'. This passes today and must keep passing.
- F09: validate(c7) is ok with implement.reads=['brief']. A check step reading 'brief' raises PR5. A read of a port no path produces raises ST5. A read on a human step is rejected.
- F09: coverage.test.ts passes with no product.c7.implement exemption.
- F09: product.c7.implement v3's answer format asks the 'Why:' to name the brief's requirements. The 'Trim the scope' explainer no longer claims the reviewer knows the task.
- F10: two otherwise identical shot-check calls whose clips have different last frames send different requests. Today both send the same fingerprint.
- F10: the shot-2 check attaches exactly two images: shot 2's start frame (shot 1's last frame) and shot 2's clip's last frame. Today every check attaches every shot's still.
- F10: with video unavailable, the C5 chain makes zero shot-check model calls. Each shot-check finishes skipped with 'No clip was made for shot N…', with no regenerate and no cap question. Today there are 3 or more check calls answering 'No defects.'.
- F10: with a defect only in shot 2's or shot 3's ASSET still (not a start frame) and clean clips, there are 0 regenerations and 3 video calls. Today there are 9 video calls and 3 cap questions.
- F10: the shot-check v2 text and the Motion explainer name exactly the frames the view attaches, and v2 says to leave out defects already visible in the start frame (template test).
- F10: a composed media recipe with a judging step after the relay chain still calls that judge (the unobservable rule does not fire outside a link).
- F11: canonical C3 asset with {"images":[]} then one brief makes 2 model calls and 1 image (unchanged).
- F11: canonical C3 asset with {"images":[]} twice makes 2 model calls, 0 gateway.image calls and no integrate call. The artifact is unchanged, step-finished is skipped with NO_BRIEF_NOTE, and the run continues. Today it ends in ContractMissed and a run failure.
- F11: helper@prose with {"images":[]} makes 1 model call, 0 image calls and is not skipped, with NO_IMAGE_CHOSEN_NOTE.
- F11: C1/C1-H article.ASSET behaves as today on every non-failure path. An empty first answer is retried with 'Write at least one image brief.'.
- F11: every image-briefs template declares `images`. A template offers an empty list exactly when its minimum is 0. product.c3.asset v2 declares 1-1 and has no veto line.
- F12: slots ' 1 ','2','3' give storyboard {1:I1, 2:I2, 3:I3}. Today shot 1 is null.
- F12: '1',' 1','2','3' buy 3 images, and options 'a','A','B','C' buy 3. Today they buy 4.
- F12: '2','3' on a 3-shot storyboard make 0 image calls before the feedback retry naming shot 1. If the retry still omits shot 1, 2 images are bought, the note names shot 1, there is no anchor, and the run continues.
- F12: when shot 1's image() is refused on both tries, the anchor is undefined and the asset note names shot 1. The first relay link finishes skipped with NO_START_FRAME_NOTE, and gateway.video is never called with shot 2's frame. Today the paid clip starts from shot 2's frame with no note.
- F12: out-of-order slots 3,1,2 give anchor = shot 1's image (regression).
- F12: an unparseable storyboard on an ASSET step fails with a StepError before any model or image call.


**Compatibility.** **Temporal and replay.** The interpreter changes: toStepSpec copies reads, the revise-in-place prefill and question, link context on render, the restricted unobservable skip and LoopExit 'unchecked'. That changes the workflow bundle once, if A2 and C ship in one release. Under ADR-0078, open runs started by the older bundle end plainly with 'started by an older version of byway… Start it again', so no patched() is needed. New activity input fields (StepSpec.reads, RenderInput.link) are optional.

**Stored data.** No SQLite or CAS migration.
- Storyboards without lastFrameArtifactId still parse. A shot whose clip predates the change has no recorded last frame, so a link view built from it is unobservable and the check is skipped, never falsely clean. In practice only runs retired under ADR-0078 hold such shots.
- Old run records, ledgers and artifacts are untouched.

**Recipe schema and hashes.**
- `reads` extends byway.recipe/1 without a version bump (recorded in the IR ADR). Recipes without it hash and validate identically (hash.ts stripUndefined).
- c7's hash changes, so regenerate recipes/c7.json and its conformance expectations. STUDY_REGISTRY is empty (registry.ts:23), so no evidence label is orphaned.
- An older strict StepSchema rejects the regenerated c7.json, which is acceptable for a local single-version app.
- Research-frozen recipes (c1h*) must not use reads.
- c1, c1h, c2, c3 and c5 hashes are unchanged.

**Prompts.** These bump: product.c3.asset v2, product.c5.shot-check v2, product.c7.implement v3. Frontmatter `images:` changes the file hashes of the other image-briefs templates (article.ASSET, product.c5.anchor-frames, product.c2.mood-boards, the helper variants); version bumps follow the repo's template convention. Ledger provenance records the new hashes per call.

**Contracts.** RenderedPrompt.images is additive (contracts first, then prompts, then runner). VideoResult, ContentPart and MediaType are unchanged. No gateway, fal or reservation change. The advisor's extraUsd stays at one extraction.

**Cost.** No new provider calls per clip. Fewer futile video regenerations. Without a video key the advisor still counts the shot-check calls per link, an overestimate accepted knowingly and logged in the backlog.

**Behaviour changes users can see.**
- A twice-empty or twice-short brief answer no longer fails the run. The ASSET step finishes with a plain note (skipped when nothing was made, partial otherwise).
- helper@prose may make no image and say why.
- C5 with no video key no longer reports per-shot 'No defects.'.
- A missing shot-1 frame skips the video chain with a plain note instead of failing on fal's invalid-request or starting from the wrong frame.
- The C7 spec checkpoint opens with the interview's questions to answer in place.
- C1-H: the recipe hash is unchanged, and so is the behaviour on every path except a twice-empty brief answer. That answer used to fail the run and now finishes the ASSET step skipped with NO_BRIEF_NOTE, which the Study 1 analysis must count as an arm deviation.

**ADR.** Yes, two new append-only ADRs.

(1) **IR: optional reads.**
- The `reads` field on model steps, typed against `may`, never adding to `must`, under the port rules through inputsOf. buildPrompt treats a read like a consume.
- It extends byway.recipe/1 without a version bump, and research-frozen recipes must not use it.
- The documented loop and relay back-edge limitation.
- C6's angles/react → author write is named as another instance, with wiring deferred because it needs human-step read semantics.
- It closes backlog row 1 and amends the engine spec 'Scope typing'.

(2) **Product: execution contracts for revising humans and media steps.**
- A human react step that consumes and produces a text port revises it in place (initial text plus question).
- An ASSET step's image count is declared by its prompt (`images:` frontmatter).
- A short answer gets one feedback retry, then degrades with a named note. Only malformed answers fail the run.
- The slot plan: canonical identity, coverage before purchase, attach and anchor by identity, two tries for the first media slot.
- The relay anchor is shot 1's frame or none, and a link with no start frame is skipped. This amends ADR-0069's relay clause and spec §3.2/§3.3.
- C3's model veto is removed in favour of the person's opt-in. This is delegated and reversible; flag it for the owner.
- The per-link view (start frame and the clip's last frame, scoped to the shot) and 'not checked' for unobservable views, applying ADR-0079 RENDER-1 to the shot-check. Middle-frame sampling is deferred, and must be best-effort if ever added.
- The C1-H deviation note.

Record honest provenance: Claude decided, delegated, not explicitly approved.


**Deliberately not doing**
- No synthetic brief on C7's skip path and no pass-through brief executor. An absent brief stays absent; `reads` handles it.
- The brief does not go to C7's fix, scope-cut, review or bloat passes. They are deliberately blind (C7-DR7). Brief requirements reach scope-cut only through the implementer's 'Why:'.
- No middle-frame (or other) sampling of clips now, and no direct video input. If middle frames are added later: fal's client types support frame_type 'middle' (@fal-ai/client 1.10.1 endpoints.d.ts:11182); extraction must be best-effort (a failure never fails the billed video call); and two extractions must be counted in videoExtras and the advisor's estimate.
- No change to the C5 launch gate's storyboard-only scope, which is already disclosed.
- No change to the general parse discipline for other model steps. Only an ASSET brief answer that is well formed but short degrades; malformed answers still fail the run.
- Parked, not in F09-F12: asset.integrate's 'Place every image' miss after purchase still fails the run and loses paid images (asset.ts:106-126). It is the same 'optional enhancement fails late' class; logged in the backlog as a candidate for the pass-through convention.
- Parked, C2 copy: the mood-boards trigger says 'for the chosen option', but spec §3.3 and the prompt say one image per option (up to 12). The coverage retry follows the spec and prompt, and fires only when a model deviates from its prompt. Which is meant is an owner decision, logged in the backlog.
- Parked, F10/F12 follow-ups:
- C5 anchor-frames' `slots: 3` knob is ignored on media, so every shot gets a paid still although only shot 1's starts the chain: cost and knob honesty.
- The anchor-frames prompt says every still is its clip's start frame: prompt wording.
- Whether an anchor-frame check belongs before the chain (inherited defects are now left out of the per-link check): a protocol question.
- No back-edge typing of reads inside loops; documented in the IR ADR instead.
- No change to the advisor estimate's count of shot-check calls without a video key (a conservative overestimate, logged in the backlog).
- No generic step-contract framework (option D). The single `images:` frontmatter field is the only new declaration.


**How it resolves each finding**
- **F09:** Fixed at two boundaries.

(A) IR: model steps gain optional `reads`, validated against `may` and held to PR1/PR2/PR3/PR5/PR7.1 through inputsOf. C7's implement reads `brief`, and buildPrompt fills it ('' when absent, so {{#if brief}} omits the section).

(A2) Human checkpoint: a react step that consumes and produces the same text port opens with that port's text and asks the person to answer or change it in place. C7's brief therefore reaches implement as the interview's questions with the person's answers and the defaults they kept, a self-contained spec.

Also:
- product.c7.implement v3 asks the 'Why:' to name the brief's requirements, so the blind scope-cut (C7-DR7) can see them.
- The 'Your direction' and 'Trim the scope' explainers are corrected.
- The coverage-test exemption and the 'does not consume it yet' note are removed, and backlog row 1 is closed.
- The e2e asserts the self-contained brief, not just a marker.

Not done: a synthetic skip-path brief, and feeding the brief to the blind revision passes. C6's taste is named in the IR ADR as a deferred `reads` instance.
- **F10:** Fixed by step C, without contracts or gateway changes.
- relayLink records the clip's last frame on its shot, a frame the gateway already returns.
- Render inside a relay link is told its shot. The view shows that shot's line, the frame the clip started from and the clip's last frame, under captions. The checker's input now depends on the clip and only on its shot.
- A link with no clip has an unobservable view. The check is skipped with the reason, and the check-clean loop ends 'not checked': no 'No defects.', no regeneration, no cap question. The rule fires only inside a relay link.
- Other shots' stills are no longer shown, and shot-check v2 leaves out defects already visible in the start frame, so futile regenerations from both sources disappear.
- shot-check v2 and the Motion explainer state exactly which frames are seen, and that motion between them is not (RENDER-1).

Not done: middle-frame sampling and direct video input. Middle frames are parked as a best-effort follow-up.
- **F11:** Fixed by step B. The prompt each step actually uses now declares how many images it may return (`images:` frontmatter, read through RenderedPrompt), so the runtime and the prompt share one definition:
- C3 v2 declares 1-1, without the model's veto, because the person's yes at the optional gate decides;
- article.ASSET and helper@web-page declare 1-3, so C1 and C1-H are unchanged on normal paths;
- only helper@prose declares 0-3 and may finish with a deliberate 'no image' note.

An empty answer where at least one image is due still gets the one feedback retry, which usually yields the image. If it is empty again, the step finishes skipped with NO_BRIEF_NOTE and the work unchanged, never ContractMissed and never a forced purchase.

A prompt test holds the empty-list wording to the declared minimum.
- **F12:** Fixed by step B.
- slotId() normalizes each slot once: trimmed, numeric for media (accepting 'Shot N'), uppercase labels for options, trimmed text for free plans. Deduplicating, attaching and announcing all use that one id, so whitespace and alias duplicates can neither buy extra images nor leave one unattached.
- On media and options a missing or unknown slot triggers the cheap feedback retry before any purchase. If the retry still falls short, the covered slots are bought and the missing ones are named in the note. The run never fails for it.
- Per-slot image failures are reported as partial, and the first media slot gets two tries.
- The relay anchor is exactly the storyboard's first shot's frame, or none. relayLink skips a link with no start frame with a plain note, instead of starting a paid clip from a later shot's still or failing on fal's invalid-request.
- An unparseable storyboard or option map fails before any purchase.


**Changes forced by the adversarial rounds (last round)**
- F11 mustFix (both critics): ACCEPTED. The first design keyed the image count on the medium ('free' prose and web-page plans accepting zero), which contradicted the reachable prompts and would have silently dropped the image the person asked for in C3, C1 and C1-H. Verified: asset.ts:63 uses the step's own prompt whenever it exists. article.ASSET and helper@web-page say 'up to 3' with no empty-list line, and only helper@prose offers zero.

The count is now declared by each image-briefs template (`images: each | min-max` frontmatter, surfaced as the additive RenderedPrompt.images). C3 v2 is 1-1, article.ASSET and web-page are 1-3, and helper@prose is 0-3. Minimum-1 steps keep the feedback retry. C1 and C1-H are unchanged except for the twice-empty path, which is disclosed in the ADR.

I chose frontmatter over critic 2's new output id: the output id is held equal to outputForStep/outputForPurpose by coverage.test.ts:33 and :62, so a new id would ripple through those tests. I chose it over a step knob because a knob changes recipe hashes and misses the helper path.
- F11/F12 short-answer outcome (both critics, F12 mustFix): ACCEPTED. Coverage and count problems are no longer hard parse failures. Verified: askModel throws ContractMissed after one retry (call.ts:65-84), and the interpreter turns that into a RunFailure.

The new outcome is a generic, runner-internal 'usable shortfall' in askModel: a miss carrying a usable value is retried once, then the usable value is returned with the problem. So a twice-short answer degrades (covered slots bought, missing and unknown ones named; or no image with NO_BRIEF_NOTE), and only malformed answers stay fatal.

The critics differed on whether 'no usable slot' should be fatal. I followed critic 2 (only malformed JSON is fatal), because an empty or entirely unknown list is the F11 harm itself, and on media it already degrades honestly to 'no anchor, chain skipped'.

I departed from critic 2's 'not skipped' for a twice-empty answer on a minimum-1 step: it finishes skipped, because nothing the person asked for was made, consistent with the existing all-failed skip (asset.ts:97-99). A deliberate zero on helper@prose finishes not skipped.
- F12 free-plan identity (critic 2): ACCEPTED. slotId is now total. Free plans use the trimmed text as identity and only collapse duplicates. Media accepts 'Shot N' (critic 1's acceptance case), and options strip an 'option ' prefix.
- F12 parse-before-purchase (critic 2, shouldConsider): ACCEPTED. planSlots runs before any call, and an unparseable storyboard or option map is a StepError before any model or image call. Today the generic path buys images and then attach() throws (asset.ts:150-160, 191-192).
- F09 mustFix (both critics): ACCEPTED, and the vision-wording item is un-parked. Verified:
- interpreter.ts:416 replaces the brief with the person's text;
- wording.ts:30-31 asks the generic VISION-lite question;
- product.c7.interview asks for questions with defaults.

New step A2: a human react step that consumes and produces the same text port opens with that port as CheckpointSpec.initialText (types.ts:266). ReactPanel already prefills from it (apps/web checkpoints.ts emptyDraft). It also gets its own question ('Answer the questions below in place, or change their defaults…'). The brief is therefore self-contained.

The e2e acceptance test now changes only question 2 and checks that the other questions' defaults reach implement. The rule is keyed on step shape, not on C7; only C7 'spec' has that shape in the catalog.
- F09 verdict challenge (critic 1): ACCEPTED, narrowed. Point (3) now says the revision-pass risk was not reproduced but is plausible. product.c7.scope-cut reads only the change and its 'Why:', so brief-mandated behaviour could be cut.

The mitigation keeps C7-DR7: product.c7.implement v3 asks the 'Why:' to name the brief's requirements, and the 'Trim the scope' explainer (presentation.ts:436), which claimed the reviewer knows 'what the task did not ask for', is corrected (RENDER-1 honesty). The verdict (ACCEPT_PARTLY, P2) stands.
- F10 mustFix (both critics): ACCEPTED via critic 2's narrower alternative. Verified: gateway.ts:394-399 throws a non-retryable billed failure whenever extraction fails (fal.ts:154-168 sets out.failure), so a required middle frame would add a fatal point to every clip and regeneration.

The design no longer samples frames and makes no contracts, gateway, fal, reservation or estimate change. relayLink records the clip's last frame, which already exists (relay.ts:174, 181), on the shot, and the link view shows the start frame and the clip's last frame. Middle frames are parked. If ever added they must be best-effort, with two extractions counted in videoExtras and estimate.ts.

The critic's fal hedge is resolved: I verified frame_type 'first' | 'middle' | 'last' in @fal-ai/client 1.10.1 endpoints.d.ts:11182, which is moot now.
- F10 root-cause wording (critic 2): ACCEPTED. I removed 'the gateway contract carries images only' from F10's root cause. The cause is that render is not told its link and the clip's frames are not bound to its shot.
- F10 inherited defects (critic 1, shouldConsider): ACCEPTED. Every link N starts from link N-1's last frame (interpreter.ts:694), so shot-check v2 now reports only defects not already visible in the start frame. Regenerating from the same start frame cannot remove those, so they would only drive futile regenerations.

The acceptance test is restated (critic 2) to a defect only in shot 2's or shot 3's still, which are no longer start frames or shown at all. Whether the model obeys the inherited-defect instruction is model behaviour, so the test checks the request and template, not the answer.
- F10 ViewRef shape (critic 2): ACCEPTED. imageArtifactIds stays the union of the captioned groups, so interpreter viewIds, critic.ts, lifecycle.ts and snapshot reranks keep seeing the images. The captions travel as `groups` through surfaceGroups, the RENDER-1 pattern.
- F10 skip scope (critic 2): ACCEPTED. The 'skip a judging step on an unobservable view' rule fires only when ports.shot !== undefined, and render gets link context only then. relay() strips shot and linkStart on exit (interpreter.ts:695), so composed recipes with a judge after the chain are unaffected. An acceptance test covers this.
- F12 anchor retries (critics 1 and 2): ACCEPTED PARTLY. The premise that one transient rate-limited or provider-error on shot 1 now skips the chain is overstated: the gateway already retries retryable errors (429, 5xx, timeouts) up to 4 times with backoff (retry.ts DEFAULT_RETRY), so what reaches assetStep is non-retryable or exhausted. Still, the first media slot is load-bearing, so it now gets max(triesPerSlot, 2) attempts. 'Refused' is retried once too, because a refused image is typically unbilled and image refusals are not always deterministic.
- F09 C6 instance (critic 1): ACCEPTED. The IR ADR names C6's angles/react → author write as another `reads` instance with wiring deferred. Its consumer is a human step, so the validator restricts `reads` to model steps until human-step read semantics are designed.
- F09 loop back-edge (critic 1): ACCEPTED as documentation, not machinery. scope.ts types loops and relays once (:128-130, :142-146). The IR ADR records that a read of a port first produced later in the same loop body is rejected, and a test pins it. No canonical recipe needs it, so threading back-edge scope through typeNode would be speculative.
- Workflow bundle (critic 2): ACCEPTED. toStepSpec lives in runner/src/types.ts, imported by the interpreter, so F09 changes the bundle too. A2 and C ship in one release so waiting runs are retired once (ADR-0078), as the compatibility notes now say.
- IR ADR details (critic 2): ACCEPTED. `reads` extends byway.recipe/1 without a version bump; recipes without it hash identically (verified: hash.ts stripUndefined). c1h* must not use it. An older strict StepSchema rejects the regenerated c7.json. STUDY_REGISTRY is empty (verified: advisor/src/registry.ts:23), so c7's hash change orphans nothing.
- Advisor estimate without video (critic 2): ACCEPTED knowingly. The estimate keeps counting shot-check calls per link without a video key, a conservative overestimate. It is logged as a backlog row rather than changed here.
- Effort (critic 2): ACCEPTED. With frame sampling dropped and web-page kept at a minimum of 1, option C is an honest L. Option C's cons now list the four areas it touches.
- Contracts bundling (critic 2): MOOT. VideoResult no longer changes, so there is nothing to bundle with the pending mediaType widening. The only contract change is the additive RenderedPrompt.images.
- asset.integrate miss after purchase (critic 1, shouldConsider): CONSIDERED, PARKED. It is the same 'optional enhancement fails late' class, but it is not among F09-F12 and touches the general parse discipline for an artifact-writing call. Logged in notDoing and the backlog as a candidate for the pass-through convention.
- C2 trigger versus prompt (critic 1, shouldConsider): PARKED with a flag. Spec §3.3 and product.c2.mood-boards say one image per option; the optional's trigger says 'for the chosen option'. Coverage is no longer fatal, and the retry follows the spec and prompt, firing only when a model deviates from its prompt. Which is meant is an owner decision, logged in the backlog.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- F10 design text: the interpreter rule is worded backwards. It says 'A judging model step (check or critic) runs only when ports.shot !== undefined and at least one ports.view item is observable. Otherwise it is not called.' Read literally, that skips every judge outside a relay link, including the C5 launch-gate critic, every C1-C7 critic loop and the C7 reviewer.
- F11/F12 ordering detail. B3 says planSlots(medium, artifact, declared, knobs) 'runs before any call'. But for free plans the declared min/max come from RenderedPrompt.images, and askModel only renders that inside the call (call.ts:44). The PromptRenderer contract has only has() and render().
- F09 A2 question wording. The new question ('Answer the questions below in place, or change their defaults…') is keyed only on step shape: a vision step that consumes and produces brief. In the catalog that shape matches only C7 'spec'. A composed recipe could put that human step after a model step whose brief is not a question list, for example a sharpened brief, and the question would then be wrong.
- F11: the claim 'C1 and C1-H are unchanged on every normal path' is slightly too strong. Free plans now collapse duplicate slots by trimmed text, last one wins. Today checkBriefs (asset.ts:177) buys every brief up to the cap, so an article.ASSET answer that repeats a slot name (or leaves slot as '', which parse.ts Briefs allows) buys fewer images than today. Separately, a twice-empty answer in C1-H now becomes a skipped ASSET where it used to be a run failure. The design discloses this as an arm deviation.


## Cluster G: Gateway outward trust boundary (secret sanitation, media fetch)

**Root cause.** The gateway is byway's single provider boundary: 'the only path out' (gateway.ts class doc; ADR-0030). It enforces its guarantees only on its own diagnostic records (redacted wire evidence, error strings) and through advisory checks (an https regex, a Content-Length header). It does not check the values that actually cross the boundary in either direction.

- **Outbound:** request text, including a key the person pasted, is sent as-is.
- **Inbound:** completion text, metadata, media URLs and every redirect hop after them, and the media bodies are all handed to the runner, advisor, memos and store as trusted.

Both findings rest on the same wrong assumption: once a value has reached the gateway, it is treated as benign. Comments and docs then state guarantees as if they were enforced: 'applied to every outbound string', 'Only fal's HTTPS media URLs are fetched', 'not read into memory', 'keys never enter … prompts'.

The correction is to check every value at the point where it crosses, with one exact rule per kind of value, applied to every instance of that crossing and never rewriting legitimate content:
- **One held-key detector**, applied to requests going out, completion text coming in, and browser request bodies coming in. Provider metadata, which is a label and not content, is scrubbed instead.
- **One media admission predicate** for every URL fal names and every redirect hop: fal's media domain only, verified HTTPS on the default port. It is followed by a streamed byte cap, byte-level typing, and media-specific status mapping.

Shape-based redaction stays where it belongs, on diagnostic copies.


### F16: Secret sanitation protects evidence copies but not outgoing results

- **Verdict:** ACCEPT_PARTLY · **Severity:** P3 (review: P2) · **Label:** security-hardening / secret-boundary enforcement (doc-code consistency)

**Rationale.** Confirmed in code at b33f1285, and both verifiers reproduced it with the real gateway and the real memoGateway:
- gateway.ts:241 returns `text: out.text` unchanged.
- record() (gateway.ts:569-571) redacts only the stored request and response bodies.
- The ledger draft's servedModel and upstreamProvider (gateway.ts:227-232) are written unredacted.
- memo.ts:36-41 persists the whole CompletionResult, inline or as an artifact.

The verdict is partial for four reasons.
(1) The review places the breach at the gateway's success return, but that is not where it starts. The only realistic way a configured key reaches model output is the person's own material. That material is stored unredacted before any call (api.ts:58-66 createIntake, refs.ts:25-28 storeRef) and then sent to the provider as-is (gateway.ts:205-212 passes `messages` through), which breaks spec §2's 'never enter … prompts'. The review does not mention this. A filter on the gateway's output alone cannot make ADR-0074 or spec §2 true.
(2) Error paths are already redacted: errors.ts:70 and gateway.ts:239, 300 and 607.
(3) The repair must match exact configured values only. makeRedactor's KEY_SHAPES (redact.ts:9-16) would rewrite legitimate product text: verifier case C turned a quoted 'sk-proj-…' placeholder into '[redacted]'.
(4) record() already documents that evidence is stored redacted (gateway.ts:563), so the 'pretending byte-exact' point is mostly moot.
No backlog item or ADR decides to leave returned text unredacted.

**Severity rationale.** The precondition is a key the person pasted themselves, or a provider that echoes back the key it was authenticated with. No prompt or activity code reads process.env, so prompt injection cannot reach keys held in the environment. By the time a model echoes a pasted key, that key is already in SQLite, CAS, the browser and the outbound prompt. The echo adds more copies of it (memos, artifacts, possibly an export), not a new kind of exposure. The data stays in the single owner's %LOCALAPPDATA%/byway, outside git and OneDrive, on the same machine as .env.agents, and error paths are already covered. What is actually wrong is that a documented promise is not enforced where keys can cross a boundary: a bounded standards defect (P3), not material hardening (P2).

**Root cause.** Nothing enforces the key promise where a key can actually cross a boundary. The only secret mechanism is makeRedactor, and it is applied only to the gateway's own diagnostic copies (wire-evidence bodies and error strings). Four crossings go unchecked:
- outbound request text, before dispatch;
- the inbound completion text, before it is returned to the runner and advisor and memoized;
- inbound provider metadata (servedModel, upstreamProvider), before it reaches the ledger and results;
- user material at the browser-to-server boundary, before it is stored and displayed.
redact.ts:22-23 claims the redactor is 'applied to every outbound string', and ADR-0074 and spec §2 promise more than the code does.


### F17: Provider media fetch trusts destinations and buffers before checking size

- **Verdict:** ACCEPT_PARTLY · **Severity:** P3 (review: P2) · **Label:** security-hardening / provider media trust boundary (SSRF, unbounded buffering)

**Rationale.** The core defect is confirmed in code and stands in full:
- fal.ts:89 is the only destination check, a case-insensitive https scheme regex.
- fal.ts:90 calls fetch with the default redirect: 'follow'. Both verifiers reproduced, with Node 24's real fetch, an https→http://127.0.0.1 downgrade whose body was stored and returned as a billed video/mp4 clip (reproducer T2b, through createGateway).
- fal.ts:92-95 enforce the 200 MiB ceiling only through the advisory Content-Length header and a check after `res.arrayBuffer()`. Chunked bodies (230-260 MiB) and gzip bodies (611 KB on the wire, 600 MiB decoded) were fully buffered before being rejected.
- The clip's type comes from headers or fal's content_type (fal.ts:157), never from the bytes.
- The comments at fal.ts:81 ('not read into memory') and fal.ts:88 ('Only fal's HTTPS media URLs are fetched') state rules the code does not enforce.
No ADR (0069, 0074, 0079, 0080), backlog item or test covers it; video.test.ts:218 covers only the http:// refusal and a 404.

Partial, by the same standard applied to F16, because three of the review's claims are corrected or rejected:
(a) The review's 'reproduced' https://127.0.0.1 destination used a fake fetch that only recorded the URL. Under real fetch it fails TLS (refuter: DEPTH_ZERO_SELF_SIGNED_CERT). The practical private-network vector is the redirect downgrade, which reaches more than the review says: plain-HTTP loopback and LAN.
(b) 'False Content-Length' works only through Content-Encoding. An understated length just truncates the body (T5).
(c) The review's required DNS-to-connect race check is not adopted. Once every URL fetched, each redirect hop included, must be TLS-verified HTTPS on fal's media domain, a private service cannot answer for that name.
An additional defect found while checking, in the same function: download() reports a media HTTP status as a provider-API status. A CDN 401 becomes 'no-credentials', so relay.ts:83 skips the link with 'No video provider key is configured' after the clip was billed (critic probe401). A 404 becomes 'invalid-request'.

**Severity rationale.** The attacker must be fal, its CDN, or a man-in-the-middle holding a certificate Node trusts. The URL comes only from fal's authenticated queue.result (fal.ts:109-114). The relay:media contract carries only {clipPrompt, durationSec}, so neither prompts nor model output can steer it. The path is live-only (the C5 relay with FAL_KEY); demo mode never reaches it. The SSRF is a blind GET with no response channel back to the attacker. The one exception is a target that returns an image: that body becomes the last frame, which is uploaded back to fal. The worst realistic effect is a memory DoS of the serve process that hosts the worker. The defect is real, cheap to fix and contradicts the code's own comments, so it sits at the top of P3. It is not material P2 hardening for a local single-user app whose attacker would be its own paid provider.

**Root cause.** download() in packages/gateway/src/providers/fal.ts:87-98 trusts any URL fal names once its scheme is https. It leaves where it connects, how much it reads and how it reports failure to fetch's defaults and the provider-API conventions:
- no host, port or userinfo policy, and redirects followed by default to any host, including a downgrade to http;
- a size ceiling enforced only through the optional, encoded-length Content-Length header and a check after full buffering, instead of a count of decoded bytes while streaming;
- the clip typed from headers rather than its bytes;
- CDN HTTP statuses classified as provider-API statuses (401 read as a missing key).
The intent stated in the comments was never implemented, and no ADR records how far provider-returned media is trusted.


### Options


**A. Review's repair as written** (fixes root cause: partly; effort L; risk medium)

F16: run the redactor (or a dedicated output sanitizer) over every successful CompletionResult, ImageResult and VideoResult value, all metadata and all errors before return. Reject structured content where substitution could corrupt meaning, still ledger the paid call, and mark stored evidence as sanitized.

F17: an approved host and port allowlist; manual redirect validation; a connect-time private-address check without a DNS-to-connect race (a custom undici dispatcher or a pinned lookup); a streaming byte cap with cancellation; decoded-size limits; an MP4 signature check; caps on redirect count and time.


*Pros*
- Closes the model-echo copies at the gateway: memos, artifacts and the ledger's servedModel.
- Fully closes the SSRF and memory-exhaustion paths, and matches the review's acceptance list.
- Accounts for the paid call when a result is rejected.

*Cons*
- Filtering only the output leaves the actual source of the leak open. A pasted key is still stored in intakes, runs and CAS, shown in the browser, and sent unredacted to third-party providers (verifier case A), so ADR-0074 and spec §2 stay false.
- Reusing makeRedactor's KEY_SHAPES on product text rewrites legitimate content: a code review quoting an 'sk-proj-…' fixture (case C), or the person's verbatim VOICE copy.
- A connect-time IP-pinning dispatcher needs a new undici dependency or a hand-written https client. It adds nothing once every hop must be TLS-verified HTTPS on fal's own domain.
- Rejecting image and video results over metadata adds billed-failure paths that asset.ts:93 retries by buying again.
- Does not fix the CDN-status misclassification: a 401 still reads as 'No video provider key is configured'.


**B. Enforce the provider boundary at each crossing: exact held-key checks, plus one media admission predicate for every URL and hop (recommended)** (fixes root cause: yes; effort M; risk medium)

F16: a small held-key detector in @byway/gateway, findHeldKey(env, values). It matches exact configured KEY_VARS values of 16 or more characters, and each ':'-separated part of 16 or more characters (FAL_KEY's secret half). It returns the variable name, never the value. It is applied at every crossing:
(1) The gateway refuses complete(), image() and video() requests whose text or prompt holds a key, before any reservation, exposure record or dispatch.
(2) The gateway rejects a billed completion whose text holds a key. The call is ledgered first, the rejection is non-retryable, and the text is never returned or memoized.
(3) servedModel and upstreamProvider are diagnostic labels. record() scrubs them with the existing redactor for the ledger, and the results carry the same scrubbed value, so image() and video() gain no new billed-failure path.
(4) The web's parseBody takes a required heldKeyIn (from Deps, not Services) and refuses any JSON body holding a key, property names included, before anything is stored.
Held-key errors carry a heldKey marker. asset.ts rethrows them under its existing 'key problems stop the step' rule, and modelProblem shows the gateway's own message.

F17: one admitMediaUrl predicate (https, no userinfo, default port, hostname fal.media or a subdomain of it) is applied to the initial URL and to every resolved Location. Redirects are followed manually: at most 3 hops, and a 3xx without a Location is refused. One deadline covers the whole download. Decoded bytes are counted while streaming and the read is cancelled at the cap. The clip is typed from its bytes. Media HTTP statuses map to 'provider-error' (retryable only for 408, 429 and 5xx). The response evidence records the origins each download used.

A new ADR (the next free number) records the key-promise scope and the media trust policy, and the misleading comments are corrected.


*Pros*
- The documented promise becomes true on every realistic path for text. A pasted key is refused at submission, so it never enters the DB, CAS or browser. It is never sent to a provider, even by the CLI or a future caller, because the gateway backstops every caller. A provider's echo is never handed on.
- Exact matching and refusal, never rewriting product content: legitimate text is not altered, request hashes and memo keys stay stable, and nothing new depends on a heuristic. Metadata is scrubbed, not refused, because it is a label, so no new paid-retry path is added.
- One detector shared by the gateway and the web, with no new error code and no contracts change ('invalid-request' and 'provider-error' are reused, plus a duck-typed heldKey marker like the existing retryAfterMs).
- The same media rule applies to every URL that is fetched, so there is no weaker hop rule. Trailing-dot names (localhost., v3.fal.media.), decimal or hex IPv4 (normalised by WHATWG parsing), bracketed IPv6, nip.io, suffix tricks, other ports, userinfo and plain http all fail one hostname pattern (probed on Node 24.13.1). With TLS on every hop to fal's own domain, DNS rebinding and private-address reach need no pinning machinery.
- The streamed cap bounds chunked bodies and gzip bombs alike, because the reader yields decoded bytes (probed on Node 24 by this designer and by critic-G-regression-scope: a manual redirect exposes the 302 and its Location, and the capped reader stops at about 10 MiB).
- A CDN 401 or 404 can no longer be reported as a missing key or an invalid request.
- The overclaiming comments and docs are corrected, and the ADR log stays append-only.

*Cons*
- Touches the gateway, the fal adapter, the web (parseBody, Deps, ServiceHost, 7 POST routes, modelProblem) and one line in runner/asset.ts.
- fal's real media host set cannot be confirmed offline. Evidence for *.fal.media is the client's fal-cdn-v3 uploads and v3b.fal.media example URLs in its endpoint types, not live output. If fal serves or redirects a clip outside fal.media, that relay link fails after it was billed, with a message naming the host. The relay step then fails non-retryably, so the loss is one clip per attempt, and the fix is to add that exact host.
- A run started before the upgrade whose material holds a key now fails on its next new model call, with a message naming the variable (in the spirit of ADR-0078).
- Keys inside images (a screenshot of a key) are not detected on the way out; the inbound text check still stops an echo. Existing SQLite, CAS and Temporal data is not scanned.


**C. Narrow the promise and patch the two leaks** (fixes root cause: partly; effort S; risk low)

Reword ADR-0074 and spec §2 to say that byway never writes the keys it holds through its own records, and that material the person pastes is stored as typed. In gateway.complete, replace exact configured key values in text and servedModel with '[redacted]'. In fal download(), set redirect: 'error' and read through a byte-counted stream that cancels at the cap. Fix the comments.


*Pros*
- The smallest change: no web changes and no new refusal UX.
- Removes the memo and artifact echo copies and the memory blow-up.
- Makes the docs honest by narrowing them.

*Cons*
- A pasted key is still stored in SQLite and CAS, shown in the browser, and sent unredacted to third-party providers. The real exposure is documented away, not removed.
- Silently changes returned text: rare with exact values, but it alters a paid answer with no signal.
- redirect: 'error' leaves the destination unconstrained (any https host fal names is still fetched), and it may break a legitimate fal CDN redirect.
- The CDN-status misclassification remains.
- The cluster's wrong assumption stays in place everywhere except the two patched lines.


**D. Option B with a deny-list media rule and a record-only host allowlist (critic-G-regression-scope's proposal)** (fixes root cause: partly; effort M; risk low)

The same as B for keys. For media, one rule for every URL: https, default port, no userinfo, and a DNS-name host that is not an IP literal (net.isIP), not localhost or *.localhost, and not a single label. Redirects are manual, at most 3 hops, with the same streamed cap and byte sniff. A fal.media allowlist is only recorded in the evidence and the ledger response, not enforced, until one live relay link confirms the host set; it would be enforced in a follow-up.


*Pros*
- No risk that an unverified host set fails a billed live link.
- Closes the demonstrated vectors: the downgrade to http, IP literals and plain localhost.

*Cons*
- It keeps the wrong assumption 'any verified-HTTPS name is safe to fetch'. Deny-lists are bypassable: 'localhost.' passes the hop rules and, with a locally trusted localhost certificate (mkcert plus NODE_EXTRA_CA_CERTS), fetch returned 200 from a loopback service (critic-G-root-cause probe). Split-horizon or tailnet names with publicly trusted certificates (*.ts.net, home-lab Let's Encrypt) and any public non-fal host also stay reachable.
- The allowlist that actually states the trust boundary ships switched off, so F17's root cause stays open until a follow-up that depends on a paid live check.
- It needs a second change later to enforce what the code's own comment already claims.


### Recommendation: B

**Why.** B is the only option that removes the wrong assumption ('values crossing the provider boundary are benign once they arrive') at every place where it is made, with one rule per kind of value and no weaker special case.

For keys, one exact-value detector covers each crossing where outside text enters or leaves byway: browser to server, gateway to provider, and provider to gateway. A key is never stored, sent or handed on. Product text is refused, never rewritten. Provider metadata, which is a label, is scrubbed. This follows the verifiers' point that the leak starts at input, keeps memo keys stable, needs no contracts change, and adds no new paid-retry path.

For media, a single admission predicate is applied to the first URL and to every redirect hop. That is exactly the rule the fal.ts comment already claims. TLS to fal's own domain on every hop is what makes IP pinning unnecessary, and the claim only holds because the allowlist covers every hop. Option D's deny-list was shown to be bypassable ('localhost.' with a locally trusted certificate), and it leaves the trust boundary switched off.

The cost of an unconfirmed host set is bounded and visible: one billed clip per relay attempt, a message naming the host, and a one-line fix. It can be confirmed at no cost from any earlier live link's stored evidence before relying on it.

Option A adds machinery, corrupts text and leaves the input path open. Option C documents the exposure away.

**Design.** Principle (new ADR, the next free number at merge, provisionally ADR-0081): the gateway's guarantees are enforced by code on values as they cross. Product values (request text, completion text, browser bodies) are never rewritten; they are refused when an exact held key appears in them. Diagnostic copies and provider metadata keep the broader, lossy shape redaction. Provider media is fetched only from fal's media domain, on every hop, under a streamed decoded-byte cap.

1. Held-key detector (packages/gateway/src/redact.ts, exported from src/index.ts)
- `findHeldKey(env: Env, values: Iterable<string | undefined>): string | undefined`.
- For each provider in KEY_VARS it takes keyFor(env, provider). The candidates are the whole trimmed value, plus, when the value contains ':', each ':'-separated part. Only candidates of 16 or more characters are used, so a FAL_KEY '<key id>:<secret>' is caught by its secret half alone.
- It returns the variable name of the first held key found in any value, and never returns or logs the value. It reads env at call time, so a key added later is covered.
- Marker: `type HeldKeyError = GatewayError & { heldKey: string }`, built by `heldKeyError(code, message, name)`, and `isHeldKeyError(err)`. isHeldKeyError is duck-typed (name 'GatewayError' and a string heldKey) like the existing RetryHintedError, so it works across server bundles. GatewayErrorCode and @byway/contracts are unchanged.
- makeRedactor's behaviour is unchanged. Its comment is corrected: it scrubs diagnostic copies (stored wire bodies, ledger metadata, error messages), and product values are checked with findHeldKey, never rewritten.
- The ADR names both secret sets and says why they differ. Scrubbing uses SECRET_NAME, values of 8 or more characters plus KEY_SHAPES, because a false positive in a diagnostic copy costs nothing. Refusal uses KEY_VARS only, values of 16 or more characters, because a false positive blocks the person's submission.

2. Gateway crossings (packages/gateway/src/gateway.ts)
- Out. Right after request validation, before profile resolution, reserve(), exposure.record() or any dispatch:
  - complete() scans req.system and every text part of req.messages;
  - image() and video() scan req.prompt.
  On a hit: heldKeyError('invalid-request', 'This request contains your <NAME>. byway never sends a key to a model; remove it from the material and try again.'), non-retryable.
- In (completion text only). After record() has ledgered the call and stored the redacted evidence, complete() runs findHeldKey([out.text]). On a hit: heldKeyError('provider-error', '<provider> answered and billed this call (<purpose>), but its answer contained your <NAME>, so byway did not use it. It is not retried, because a retry would pay again.'), non-retryable. The text never reaches CompletionResult, memos, artifacts or events. The paid answer is kept only as its redacted evidence copy, which the ADR states against ADR-0080's paid-answers-kept rule.
- Metadata (all three methods). record() passes draft.servedModel and draft.upstreamProvider through `redact`, one place for every kind of call. complete(), image() and video() return the scrubbed servedModel the ledger recorded. Metadata is never a reason to reject, so image() and video() gain no billed-failure path.
- The gateway.ts:403 message is not wrapped: once the clip is typed from its bytes (step 5), it no longer carries provider text.

3. Callers that classify gateway errors
- packages/runner/src/activities/asset.ts:93 also rethrows when isHeldKeyError(e), matching its stated rule that 'key problems stop the step'. Other invalid-request and refused images keep today's try-again-then-skip behaviour. Adding all invalid-request errors would turn a provider's content-policy 400 into a step failure.
- apps/web/src/server/model-errors.ts modelProblem: a GatewayError-named error with a string heldKey returns the gateway's own message (it names the variable, never the value): 400 for invalid-request and 502 for provider-error. It no longer falls through to the generic 500 or to 'did not answer, try again'.
- Runner askModel paths need no change: toFailure (failures.ts:46) turns a non-retryable GatewayError into a non-retryable step failure carrying the message.

4. Web request boundary (apps/web)
- ServiceHost (src/services/create.ts) gains `heldKeyIn(value: unknown): string | undefined`. It walks every string of a parsed JSON value, object property names included (StartInput.routes is a record whose 64-character keys can hold a key), and calls engine.gateway.findHeldKey(opts.env, strings).
- Context (src/services/index.ts) and Deps (src/server/api.ts) carry heldKeyIn. Services keeps its documented seam: the four contracts plus mode.
- `parseBody(request, schema, heldKeyIn)` in src/server/http.ts takes heldKeyIn as a required third parameter and runs it on the schema's output, after unknown keys are stripped. On a hit it returns 400: 'This text contains your <NAME>. Remove it and try again — byway never stores or sends its keys.'
- The 7 POST routes call getDeps() first and pass deps.heldKeyIn. Because the parameter is required, a future route that skips the check fails typecheck.
- The check applies in demo mode too: a pasted key would still be stored.

5. Provider media admission (packages/gateway/src/providers/fal.ts)
- `admitMediaUrl(u: URL): boolean` requires:
  - u.protocol 'https:', with no username or password;
  - u.port '' (the default);
  - u.hostname matching /^(?:[a-z0-9-]+[.])*fal[.]media$/.
  WHATWG parsing lowercases the host and normalises decimal and hex IPv4. Trailing dots, IP literals, localhost, nip.io and suffix tricks all fail the pattern.
- `download(fetchImpl, url, what)`:
  a. Parse the URL. If admitMediaUrl fails, throw GatewayError('provider-error', 'fal returned a <what> URL outside its media host (<protocol>//<host>)'); fetch is never called.
  b. One `AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)` covers the whole download, every hop included.
  c. Call `fetchImpl(href, { redirect: 'manual', signal })`.
  d. On a 3xx: cancel the body. Refuse if there is no Location. Resolve Location against the current URL and apply admitMediaUrl to the result; refuse with the origin named if it fails. Allow at most MAX_REDIRECTS = 3 hops.
  e. Any other non-ok status throws GatewayError('provider-error', 'downloading the <what> failed with HTTP <status>', retryable only for 408, 429 and 5xx). A media CDN status is not a provider-API status, so a 401 or 404 can no longer become 'no-credentials' or 'invalid-request'. toGatewayError passes a GatewayError through unchanged, so withRetries honours the retryable flag.
  f. A declared Content-Length over the cap is refused before reading (fast path).
  g. `readCapped(res.body, MAX_DOWNLOAD_BYTES, declared)` counts the decoded bytes the reader yields. It preallocates when the declared length is within the cap and otherwise gathers chunks; for an in-cap body the peak is about what arrayBuffer() costs today. Past the cap it calls reader.cancel() and refuses. An empty body is refused.
  h. It returns `{ bytes, contentType, via }`, where via lists the origins of each hop.
- `sniffVideoType(bytes)` returns:
  - 'video/mp4' for an ISO-BMFF 'ftyp' box at offset 4;
  - 'video/webm' for the EBML magic 1A45DFA3;
  - undefined otherwise.
  The clip is stored under its sniffed type, as the frame already is. A body that is neither sets out.failure ('the clip fal returned is not a video'); it is not kept, and the gateway still ledgers the billed call. WebM still meets the existing 'not MP4' contract refusal.
- The response evidence records `media: { clip: via, frame: via }`, so any successful live link shows which hosts fal used.
- MAX_DOWNLOAD_BYTES stays at 200 MiB.
- The comments at fal.ts:81 and :88 are rewritten to describe what is now enforced.

Data flow after the change:
- browser JSON → parseBody (schema, then held-key refusal) → store, advisor or runner;
- runner or advisor → gateway out-check → provider → gateway (ledger with redacted evidence and scrubbed metadata) → completion-text in-check → CompletionResult → memo and artifacts;
- fal queue.result URL → admitMediaUrl → manual hops, each admitted → capped stream → sniffed type → artifacts.put.

Replay constraint (binding): no change to @byway/contracts, @byway/recipe, @byway/prompts/pure, @byway/store/resolution or packages/runner/src/workflow. The workflow bundle imports only those (checked), so its hash and the runs waiting for a person survive the update (ADR-0078). asset.ts is activity code.


**Steps**
1. Red: in packages/gateway/test (a new keys.test.ts), unit-test findHeldKey.
- It returns 'ANTHROPIC_API_KEY' for an exact match inside text, and 'FAL_KEY' for the secret half of a '<id>:<secret>' FAL_KEY on its own.
- It ignores variables outside KEY_VARS (GITHUB_TOKEN), values under 16 characters, and key-shaped strings that are not held.
- Its return never contains the value.
Also test isHeldKeyError on a plain object with the same name and heldKey, to cover the cross-bundle case. Then implement findHeldKey, heldKeyError and isHeldKeyError in redact.ts, export them from index.ts, and correct the makeRedactor comment.
2. Red: in gateway.test.ts, add outbound tests. complete() with the key in a user text part or in system, and image() and video() with the key in the prompt, each reject with invalid-request naming the variable and carrying heldKey. For each, assert:
- the fake client recorded 0 calls;
- there is no ledger entry;
- the exposure register was not written;
- a following clean call is not blocked by a leftover reservation.
Then implement the checks before profile resolution and reserve() in all three methods.
3. Rewrite gateway.test.ts:242 ('never writes a key to the ledger or the stored bodies, even when a prompt contains one') to the refusal contract. Keep the evidence-redaction assertions through a path that echoes the key: a provider error message, or a refusal's stop_details.
4. Red: add inbound and metadata tests.
- A fake Anthropic answer 'Echo <KEY>', with no key in the prompt, rejects non-retryable with provider-error and heldKey. The message names the variable and not the value. The ledger has exactly one entry with costUsd > 0 that does not contain the value, and the stored bodies show '[redacted]'.
- A fake servedModel, or an OpenRouter upstreamProvider, containing the key: the call succeeds; ledger.jsonl and the returned servedModel show '[redacted]', never the value.
- An image whose servedModel holds the key succeeds with the scrubbed servedModel, and nothing is bought twice.
Then implement the after-record text check and the metadata scrub in record(), and return the recorded servedModel.
5. Red: in the runner memo tests, wrap the real gateway (with the echoing fake) in memoGateway. Assert that setMemo is never called with the key and that the non-retryable error propagates. In the asset tests, assert that an image() held-key refusal fails the step (rethrown) instead of ending 'skipped', while a plain invalid-request image is still tried again and skipped as today. Then add isHeldKeyError to asset.ts:93.
6. Red: in packages/gateway/test/video.test.ts and fakes.ts.
- Fixtures: clip bytes carry a real ftyp box and the webm fixture real EBML magic. fakeFetch records init.redirect and can be configured to return a 3xx with or without a Location.
- Initial-URL matrix: https://127.0.0.1/…, https://[::1]/…, https://2130706433/…, https://169.254.169.254/…, https://10.0.0.1/…, https://localhost./…, https://127.0.0.1.nip.io/…, https://v3.fal.media./…, https://v3.fal.media:8443/…, https://user:pw@v3.fal.media/…, https://v3.fal.media.attacker.example/…, https://example.com/clip.mp4 and http://v3.fal.media/…. Each is refused with zero fetch calls, the clip is ledgered at its billed cost, and the message names the origin.
- Hop matrix: a 302 from https://v3.fal.media to each of the above (plus http://127.0.0.1:1234/admin) is refused and the second URL is never fetched. A 302 with no Location is refused. A hop to https://v3b.fal.media/files/b/x.mp4 is followed. 4 hops are refused. Every call passes redirect: 'manual'.
- Status mapping: CDN 401 and 404 on the clip give code 'provider-error' (not 'no-credentials' or 'invalid-request'), and the relay activity does not skip with NO_VIDEO_NOTE. A 503 is retried. Update the existing assertion at video.test.ts:222-223.
- Cap: a counting synthetic ReadableStream with no content-length, 201 MiB generated lazily in 1 MiB chunks, is rejected with pulls at most cap + 1 chunk, and cancel() is observed. Use a synthetic stream, not a real-fetch gzip test that exits the worker at once (Windows libuv assertion seen by critic-G-regression-scope).
- Signature: a body 'INTERNAL-SERVICE-RESPONSE-BODY' served as video/mp4 is ledgered, not kept, and fails as 'not a video'.
- Evidence: the stored response records media.clip and media.frame origins.
Then rewrite download(), and add admitMediaUrl, readCapped and sniffVideoType, and fix the comments.
7. Red: in apps/web/test.
(a) A new http.test.ts unit-tests parseBody directly with `new Request(...)` and a heldKeyIn built from a stub. A body with the key in a value, in a nested attachment and in a record property name returns 400 naming the variable. A non-held key-shaped string is accepted. A body that fails the schema still returns the schema's message.
(b) services.test.ts uses testHost({ env: { ANTHROPIC_API_KEY: '<16+ chars>', FAL_KEY: '<id>:<secret>' } }) and asserts that host.heldKeyIn finds both the whole key and the FAL secret half.
(c) The model-errors test asserts that held-key invalid-request and provider-error errors map to 400 and 502 with the gateway's message.
Then implement ServiceHost.heldKeyIn, Context and Deps.heldKeyIn, the required parseBody parameter, getDeps-before-parseBody in the 7 POST routes, and the modelProblem branch. Update the fixtures that build Deps.
8. E2E (demo): add one paste test. Submit a problem containing E2E_KEYS.ANTHROPIC_API_KEY, expect the 400 message on screen, and expect no new intake. Exempt that one request body from watchForKeys (apps/web/e2e/flow.ts), and keep every response and every other request checked.
9. Docs:
- Write the new ADR (the next free number at merge): 'Provider boundary: held keys refused at every crossing; provider media fetched only from fal's media domain on every hop, under a streamed cap'. It states:
  - that it amends ADR-0074's Keys bullet and extends ADR-0069 with the download policy, including the gateway-README pointer at ADR-0069:36, since no such README exists;
  - the two secret sets;
  - that existing SQLite, CAS and Temporal data is not scanned, and that images are sent unchecked, so the 'never enters prompts' promise holds for text submitted after the change;
  - the bounded live-host risk;
  - honest provenance: Delegated, from the external-review triage.
  ADR-0074 and ADR-0069 are not edited. docs/adr/README.md gets the index row and the updated record count, following the ADR-0080 precedent.
- Reword spec §2's Keys sentence to match, citing the new ADR. Correct redact.ts:23 and fal.ts:81 and :88.
- Backlog ('Product follow-ups'):
  (1) Confirm fal's media host set. First, at no cost, read the stored response body of any earlier live relay link (its video.url and, after this change, media.via). Otherwise run one live relay link, at the user's choice.
  (2) The page renderer's RENDER_ALLOWLIST is checked only on a request's first URL. Playwright does not call the route handler for redirect hops (pages.ts:131), so a redirect from an allowlisted CDN would be followed unchecked. It is the same class of defect, at a different boundary.
  (3) asset.ts retries billed non-retryable image failures ('could not be stored') by buying again.
- Run `pnpm typecheck`, the full `pnpm test`, the demo e2e, and the guard-boundaries test (the web still reaches gateway values only through EngineModules).


**Acceptance tests**
- gateway: complete() whose user message contains the configured ANTHROPIC_API_KEY is refused with invalid-request naming 'ANTHROPIC_API_KEY' and carrying heldKey. The fake provider received 0 calls, and no ledger or exposure entry exists. Today the call is sent and succeeds.
- gateway: image() and video() whose prompt contains a held key are refused before any provider call or reservation.
- gateway: a FAL_KEY '<id>:<secret>' is detected when only its secret half appears in a prompt.
- gateway: a provider answer 'Echo <KEY>' (no key in the prompt) rejects with a non-retryable provider-error that names the variable and does not contain the value. The ledger holds one billed entry and the stored bodies are redacted. Today CompletionResult.text contains the key (verifier case B).
- gateway: a servedModel or OpenRouter upstreamProvider containing the key never appears in ledger.jsonl or in the returned result, and the call is not rejected or re-bought. Today ledgerContainsKey is true (verifier case D).
- runner: memoGateway over the gateway with an echoing provider writes no memo and no artifact containing the key. Today memoValuesContainKey and memoArtifactTextContainsKey are both true (verifier case F).
- runner: an image() held-key refusal fails the ASSET step with the gateway's message instead of ending 'skipped'. A plain invalid-request image is still tried again and skipped as today.
- gateway: a clean answer quoting 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX' (not a held key) is returned byte-identical, before and after the change.
- web: parseBody given a held key in a value, a nested attachment or a record property name returns 400 naming the variable, and a non-held key-shaped string passes. ServiceHost.heldKeyIn from testHost({ env }) finds the key and the FAL secret half.
- web: modelProblem maps held-key invalid-request to 400 and held-key provider-error to 502, each with the gateway's own message. Today they map to the generic 500 and to 'did not answer, try again'.
- e2e (demo): pasting a stand-in key into Start shows the refusal and stores no intake. Every other request and response passes watchForKeys. Today intakeProblemStoredWithKey and refArtifactStoredWithKey are both true.
- fal: initial clip and frame URLs on 127.0.0.1, [::1], 2130706433, 169.254.169.254, 10.0.0.1, localhost., 127.0.0.1.nip.io, v3.fal.media., a non-default port, userinfo, a suffix-trick host, example.com or http:// are refused with no fetch call, and the billed clip is ledgered. Today every https one is fetched (reproducer T1).
- fal: a v3.fal.media URL answering 302 to any of those targets, including http://127.0.0.1:<port>/admin and https://localhost./, is refused without requesting the second URL. A 302 with no Location is refused, and a fourth hop is refused. Today the downgrade is followed and the internal body is stored as a successful video/mp4 clip (T2b).
- fal: a CDN 401 on the clip gives a provider-error that names the HTTP status, and the relay does not report 'No video provider key is configured'. Today it gives 'no-credentials' (critic probe401).
- fal: a 201 MiB body with no Content-Length is rejected after at most cap + one chunk is read, and the stream is cancelled. Today the whole body is buffered (T3). Real fetch yields decoded bytes, so a gzip body is bounded the same way.
- fal: a non-video body served with content-type video/mp4 is not kept, and the link fails as 'not a video' after ledgering. Today it is stored as video/mp4.
- fal: legitimate https://v3.fal.media/files/clip.mp4 and https://v3b.fal.media/files/b/… URLs (with real ftyp and PNG bytes), and a v3.fal.media → v3b.fal.media redirect, still produce a clip and a last frame end to end, and the stored response records their origins. A declared Content-Length over the cap is still refused before reading.


**Compatibility.** Temporal: no workflow code changes, and no change to the packages the workflow bundle imports (@byway/contracts, recipe, prompts/pure, store/resolution; checked). The bundle hash and the runs waiting for a person survive the update (ADR-0078). The gateway and asset.ts run only inside activities, and replay takes activity results from history. A run in flight whose stored material holds a key fails on its next new model call with a non-retryable step failure naming the variable. Memo hits for calls already paid return as before.

Memo keys: requests are refused, never rewritten, so request hashes and memo keys are unchanged.

Stored data: no migration. Existing intakes, runs, memos, CAS objects and ledger lines are not touched or scanned. The ledger format and hash chain are unchanged; future servedModel and upstreamProvider values are scrubbed, and future fal response evidence gains a media field.

Contracts and recipes: no contracts bump. GatewayErrorCode already has 'invalid-request' and 'provider-error'. The heldKey marker is an extra property, like retryAfterMs. Recipe hashes, prompts and the catalog are untouched.

What the person sees: on Start, Refs or a checkpoint, a 400 naming the variable. In the advisor, a 400 or 502 with the gateway's message. In a run, a failed step with the gateway's message; an ASSET step stops instead of skipping. Download failures read as provider errors naming the HTTP status, never as a missing key.

Tests: fal fixtures change from 'mp4-bytes' and 'webm-bytes' to real magic bytes. fakeFetch gains redirect support. gateway.test.ts:242 and video.test.ts:222-223 are rewritten to the new contracts. The fixtures that build Deps gain heldKeyIn.

Live behaviour: the fal.media host set is unconfirmed offline. If fal serves or redirects a clip or frame outside fal.media, that relay link fails after it was billed, with a message naming the host, and the step fails non-retryably. That is one clip per attempt; the fix is to add that exact host to the pattern. The backlog item says how to confirm the set at no cost from stored evidence, or with one live link at the user's choice.

ADR numbering: several clusters from the same triage may each claim ADR-0081, so the number is assigned at merge.

**ADR.** Yes. One new ADR, numbered at merge (provisionally ADR-0081). Status Accepted; Decided by: Delegated (external-review triage). It states:
- The key promise's precise scope. A configured provider key (KEY_VARS, whole value or a ':'-part of 16 or more characters) is:
  - refused at submission, browser to server, in parseBody;
  - never sent to a provider: the gateway's out-check covers every caller;
  - never handed on from a completion answer: the gateway's in-check, after ledgering.
  Provider metadata and diagnostic copies are scrubbed by makeRedactor (SECRET_NAME of 8 or more characters plus KEY_SHAPES), and evidence is stored redacted. Both secret sets are named, with the reason they differ.
- What is not covered: existing SQLite, CAS and Temporal data is not scanned, and images are sent unchecked. The promise holds for text submitted after the change.
- That it amends the Keys bullet of ADR-0074 and extends ADR-0069 with the provider-media trust policy that ADR-0069 left undecided. ADR-0069's pointer to a gateway README that does not exist is superseded by this record. Neither ADR is edited (docs/adr/README.md: 'A changed decision is not edited in place'; the ADR-0080 precedent). Only the README index row and record count change.
- The media policy:
  - every fetched URL and hop is admitted by one predicate: https, default port, no userinfo, fal.media or a subdomain of it;
  - at most 3 manual hops;
  - one deadline;
  - a streamed decoded-byte cap;
  - typing from the bytes;
  - media statuses mapped as media failures, not provider-API ones.
- Rejected alternatives: shape redaction of product text; refusing calls over metadata; connect-time IP pinning; a deny-list hop rule (bypassable, e.g. 'localhost.'); a record-only allowlist; narrowing the docs instead of enforcing them.
- The bounded live-host risk and how to confirm the set.


**Deliberately not doing**
- No KEY_SHAPES or pattern substitution on product values (completion text, VOICE copy, page copy). It would corrupt legitimate content (verifier case C). Shape redaction stays on diagnostic copies and provider metadata only.
- No rewriting of the person's material or of outbound prompts. Requests are refused, which keeps memo keys and request hashes stable and never silently alters human text.
- No rejection of image or video results over metadata. servedModel and upstreamProvider are scrubbed, not refused, so no new billed-failure path reaches asset.ts's paid retries.
- No deny-list hop rule (IP-literal, localhost, single-label checks) and no record-only allowlist. One enforced allowlist applies to every URL and hop.
- No connect-time DNS or IP pinning dispatcher and no new undici dependency. Verified TLS to fal's own domain on every hop makes them unnecessary.
- No change to how asset.ts treats other invalid-request or refused images. A provider content-policy 400 keeps today's try-again-then-skip behaviour.
- No fix in this cluster for asset.ts re-buying images after a billed non-retryable failure, or for the page renderer's redirect gap. Both are pre-existing and at different boundaries, so they go to the backlog.
- No scanning of images (OCR) for keys. The inbound text check is the backstop.
- No migration or scrubbing of existing SQLite, CAS or ledger data, and no change to the ledger format.
- No new GatewayErrorCode, no contracts bump, and no change to the packages the workflow bundle imports.
- No edits to ADR-0074 or ADR-0069. The new ADR amends them, and only the ADR README index changes.
- No configurable media-host list or general URL-fetch framework. fal is the only provider that downloads by URL, and the policy lives in its download().
- No change to MAX_DOWNLOAD_BYTES, and no accept-encoding override. Counting decoded bytes already bounds compressed bodies.
- No multi-user secret vault or separate key-holding process: out of scope for a local single-user app.


**How it resolves each finding**
- **F16:** Fixed at the root by enforcing exact held-key checks at every crossing, instead of only on the gateway's own records.
(1) The web's parseBody takes a required heldKeyIn (from Deps and ServiceHost, so the Services seam is unchanged). It refuses any request body holding a configured provider key, property names included, before anything is stored. This closes the intake, refs and checkpoint storage paths, and with them the browser display path.
(2) The gateway refuses any complete(), image() or video() request whose text or prompt holds one, before reservation, exposure or dispatch. This closes the 'never enter prompts' breach for every caller.
(3) The gateway rejects a billed completion whose text holds one. The call is ledgered first and the rejection is non-retryable, so the value never reaches CompletionResult, memos, artifacts or events.
(4) servedModel and upstreamProvider are scrubbed in the ledger and in the results, never refused.
A FAL_KEY's secret half is detected on its own. Held-key errors carry a marker: asset.ts stops the step on it, and modelProblem shows the gateway's message, so the failure is plain on every path. Error paths were already redacted. makeRedactor's shape patterns stay on diagnostic copies, so clean and human text is never altered. The redact.ts comment, spec §2 and a new append-only ADR state exactly what is enforced and what is not (existing data, images). Severity: P3, adjusted from the review's P2. Verdict: ACCEPT_PARTLY.
- **F17:** Fixed at the root inside fal's download() with one admission predicate applied to every URL fetched, the initial URL and every resolved redirect Location alike: https, default port, no userinfo, and a hostname of fal.media or a subdomain of it. Trailing-dot names, decimal or hex IPv4, bracketed IPv6, nip.io, suffix tricks, other ports, userinfo and plain http all fail it.
- Redirects are followed manually: at most 3 hops, and a 3xx with no Location is refused.
- One deadline covers the whole download.
- Decoded bytes are counted while streaming and the read is cancelled at the 200 MiB cap. This bounds chunked bodies and gzip bombs without relying on Content-Length, which stays only as a fast pre-check.
- The clip is typed from its bytes (ftyp or EBML), so an internal service's response can no longer be stored as video/mp4.
- Media HTTP statuses map to provider-error (retryable only for 408, 429 and 5xx), so a CDN 401 can no longer be reported as a missing video key.
- The response evidence records the origins each download used.
The comments are rewritten to match. The new ADR records the trust policy that ADR-0069 never decided, and the bounded risk of an unconfirmed live host set, with a no-cost way to confirm it. The review's DNS-to-connect race requirement is deliberately not implemented, because verified TLS to fal's own domain on every hop makes it moot. Verdict: ACCEPT_PARTLY (three of the review's claims are corrected or rejected). Severity: top of P3, adjusted from the review's P2.


**Changes forced by the adversarial rounds (last round)**
- MUST-FIX accepted (critic-G-root-cause, F17 hop rule): verified. My design admitted only the initial URL against fal.media, while hops needed only 'https, default port, DNS-name host', so 'localhost.' (hostname 'localhost.', confirmed on Node 24.13.1), public non-fal hosts and split-DNS or tailnet names passed. The notDoing claim that the allowlist made pinning unnecessary was therefore false for hops. Fix: one admitMediaUrl predicate (https, no userinfo, default port, hostname /^(?:[a-z0-9-]+[.])*fal[.]media$/) for the initial URL and every resolved Location, a refusal for a 3xx without Location, and the 3-hop cap kept. I probed the matrix: localhost., 2130706433 (normalises to 127.0.0.1), 0x7f000001, [::1], 127.0.0.1.nip.io, v3.fal.media., example.com, :8443, userinfo and http are all refused; v3.fal.media, v3b.fal.media and fal.media are admitted. The hand-rolled IP, localhost and single-label checks are dropped as redundant. The critic's hop cases were added to the tests, and notDoing was restated so the claim matches the rule.
- MUST-FIX accepted in part (critic-G-regression-scope, F17 allowlist). Agreed: a first-URL-only allowlist added nothing, and the host set cannot be checked offline. I checked the fal client: the only evidence is the fal-cdn-v3 upload setting and v3b.fal.media example URLs in its endpoint types, with one storage.googleapis.com example input. Rejected: dropping enforcement in favour of a deny-list rule plus a record-only allowlist. The deny-list keeps the wrong assumption and was shown bypassable by the other critic ('localhost.' with a locally trusted certificate returned 200), and a record-only allowlist leaves F17's root cause open behind a paid follow-up. Instead, the allowlist is enforced on every hop, and the cost of an unconfirmed set is stated honestly. It fails after billing, but non-retryably (failures.ts:46 → nonRetryable), so it costs one clip per relay attempt, with a message naming the host. Option B's risk was raised from low to medium. Taken from the critic's proposal: the response evidence now records each download's hop origins, and the backlog note gives a no-cost confirmation path (an earlier live link's stored response body) before any paid live check. The critic's proposal is listed as Option D, 'partly'.
- MUST-FIX accepted (append-only ADRs): verified. docs/adr/README.md says 'A changed decision is not edited in place', ADR-0080 corrected ADR-0074 without editing it, and git shows ADR-0074 changed only once (5546b61). Removed the cross-reference edit. ADR-0074 and ADR-0069 stay untouched, the new ADR states what it amends or extends, and only the README index row and record count change.
- VERDICT CHALLENGE accepted (both critics, F17 ACCEPT → ACCEPT_PARTLY). By the standard I applied to F16, three corrected or rejected sub-claims make the acceptance partial: the fake-fetch 127.0.0.1 'reproduction', 'false Content-Length' working only through Content-Encoding, and the DNS-race repair not adopted. The defect and P3 stand.
- SHOULD-CONSIDER adopted (CDN status mapping): verified. classify() maps 401 → no-credentials (errors.ts:13), video() throws failure?.code (gateway.ts:381), and relay.ts:83 then skips with NO_VIDEO_NOTE. download() now throws GatewayError('provider-error') itself, retryable only for 408, 429 and 5xx. toGatewayError passes it through unchanged and withRetries honours the flag. The existing 404 → invalid-request assertion (video.test.ts:222-223) is rewritten. Added to F17's root cause and acceptance tests.
- SHOULD-CONSIDER adopted, narrowed (asset.ts and modelProblem): verified both. asset.ts:93 swallows every GatewayError except three codes, and modelProblem maps invalid-request to the generic 500 and provider-error to 'did not answer'. Not adopted: adding all 'invalid-request' errors to asset.ts's rethrow list. That would turn a provider content-policy 400, which is retried and skipped today, into a step failure. Instead, held-key errors carry a duck-typed heldKey marker (like RetryHintedError's retryAfterMs, no contracts change). asset.ts rethrows it under its own 'key problems stop the step' rule, and modelProblem returns the gateway's message (400 or 502). The compatibility text now says exactly what the person sees on each path.
- SHOULD-CONSIDER adopted (critic-G-regression-scope, image and video inbound check): fal's video servedModel is req.model (fal.ts:152), so the check was nearly dead, and a billed rejection would be re-bought by asset.ts. The inbound refusal is now limited to completion text. servedModel and upstreamProvider are scrubbed with the redactor in record() (one place for all kinds), and the results carry the recorded value. They are labels, not content, so scrubbing cannot corrupt product text. This also removes the need to 'stop retrying non-retryable billed failures' for the new path. The pre-existing re-buy after 'could not be stored' goes to the backlog.
- SHOULD-CONSIDER adopted (detector edges): FAL_KEY '<id>:<secret>' (test fixture video.test.ts:12) is now matched by each ':'-part of 16 or more characters as well as the whole value. heldKeyIn walks object property names (StartInput.routes is z.record(z.string().max(64), …)). parseBody's heldKeyIn is a required parameter, so a new route that skips it fails typecheck.
- SHOULD-CONSIDER adopted, placement kept (web testability and the Services seam): verified that route files reach services/index.ts ('server-only', next/server connection) and are not vitest-tested, and that Services is documented as the four contracts plus mode. heldKeyIn now lives on ServiceHost, Context and Deps, not Services. I kept the single parseBody boundary rather than moving the check into the api.ts functions: those would repeat it in four or more places, and a new route could skip it. parseBody imports only zod types, so it is unit-tested directly with Request objects. ServiceHost.heldKeyIn is tested with the existing testHost({ env }), the route wiring is enforced by the required parameter, and one demo e2e paste test exempts only its own request from watchForKeys (e2e/flow.ts:13).
- SHOULD-CONSIDER adopted (documentation honesty): the ADR names both secret sets (SECRET_NAME of 8 or more characters plus KEY_SHAPES for scrubbing; KEY_VARS of 16 or more characters for refusal) and why they differ. It says existing SQLite, CAS and Temporal data is not scanned and images are sent unchecked, so the promise holds for text submitted after the change. ADR-0069:36's pointer to a gateway README that does not exist (packages/gateway has none, verified) is superseded in the new ADR. Every overclaim (redact.ts:23, fal.ts:81 and :88, spec §2 l.42) is corrected.
- SHOULD-CONSIDER adopted, partly (readCapped memory): readCapped preallocates when Content-Length is declared within the cap and otherwise gathers chunks. For an in-cap body the peak is about what arrayBuffer() costs today, which also gathers chunks before joining them. MAX_DOWNLOAD_BYTES is not lowered: that is a product limit outside this defect.
- SHOULD-CONSIDER adopted (gateway.ts:403 redact): once the clip is typed from its bytes, that message carries no provider text. The wrap was dropped from the crossings.
- SHOULD-CONSIDER adopted (replay constraint): verified that packages/runner/src/workflow imports only @temporalio/workflow, @byway/contracts, @byway/recipe, @byway/prompts/pure, @byway/store/resolution and local type-only modules. 'No change to those packages or to workflow code' is now a binding rule in the design, not incidental.
- SHOULD-CONSIDER adopted (ADR numbering): the ADR number is assigned at merge (provisionally 0081), because other clusters from the same triage may claim it.
- SHOULD-CONSIDER adopted (Windows gzip caveat): the cap test uses a synthetic counting ReadableStream, with no real-fetch gzip test that exits the worker at once.
- SHOULD-CONSIDER parked (page renderer redirects): verified that pages.ts:131 continues allowlisted requests and that Playwright does not call the route handler for redirect hops. It is the same class of defect at a different boundary with no known live vector, so it goes to the backlog per the scope-discipline rule, not into this cluster.
- SHOULD-CONSIDER noted (effort): effort stays M, upper M with the parseBody unit tests and one e2e paste test. The guard stays at parseBody rather than moving into api.ts, so there is no route-level harness to build.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- Non-blocking. The live fal media host set is still unconfirmed, and the *.fal.media allowlist is enforced from merge, after the clip is billed. That was critic-G-regression-scope's must-fix. The design rebuts it, and the rebuttal holds against the repo. download() throws a non-retryable GatewayError. video() turns it into provider-error with retryable=false (gateway.ts:397; the constructor defaults retryable to false). relay.ts:82-84 skips only on no-credentials. toFailure (failures.ts:46) makes the failure non-retryable. Interpreter.act (interpreter.ts:194-212) turns it into a RunFailure. So the cost is one billed clip per run attempt, with the host named in the message. The deny-list alternative really is bypassable: 'localhost.' passes it.
- Non-blocking. The secret definitions differ for FAL_KEY. findHeldKey matches each ':'-part of 16 or more characters. makeRedactor matches only the whole value plus KEY_SHAPES, whose fal shape needs uuid:hex32. So a bare FAL secret half that reaches a diagnostic copy, such as the response evidence that record() stores before the inbound text check, is not scrubbed.
- Non-blocking. readCapped preallocates from a declared Content-Length when it is within the cap. With Content-Encoding, the reader yields decoded bytes that can exceed the declared (encoded) length. On Node 24.13.1 I saw 65,250 bytes declared and over 8 MiB decoded before cancel. A fixed-size buffer would throw a RangeError on a legitimate encoded body.
- Non-blocking wording and citation drift in the design:
- '7 POST routes' is 6 POST routes plus PATCH /api/settings. All 7 call parseBody.
- 'fal.ts:152' should be fal.ts:153 (servedModel: req.model).
- 'video() throws failure?.code (gateway.ts:381)' should be gateway.ts:397.
- 'never sent to a provider, even by the CLI': packages/cli only validates and hashes recipe files.


## Cluster H: Renderer OS sandbox

**Root cause.** The renderer's single launch boundary has no containment policy. That boundary is launchChromium in packages/runner/src/pages.ts:241-243, the only production launcher, reached from worker.ts:63 through playwrightPages() at pages.ts:100. Chromium therefore inherits two defaults built for other contexts: no OS sandbox (Playwright adds --no-sandbox unless chromiumSandbox is true) and the engine's full environment, including the provider keys loaded from .env.agents.

The wrong assumption is that the browser-level controls are the containment and that the renderer only renders web pages. The product defined containment only as in-browser controls (spec §3.2; ADR-0074). The OS-level isolation the research track planned (ADR-0031) was dropped for the product (ADR-0067) and never replaced. Since BLIND-1 the renderer has drawn every mixed lineup's cards, so its untrusted inputs are:
- model-written HTML and JS;
- HTML references;
- user-uploaded reference images;
- provider-returned images and frames.

Two things follow from the same boundary:
- No test checks the effective launch flags or environment.
- The browser launches lazily, so a renderer that cannot start is discovered only when a run reaches it, after paid steps.

Because the assumption lives in one place, one correction there fixes every caller: C1 views, HTML references, lineup cards (including the C5 gate), the e2e demo and the tests. A readiness check at the same boundary then reports the new fail-closed state before money is spent.


### F18: Untrusted generated pages, and untrusted images, are processed by a Chromium launched without its OS sandbox, with the provider keys in its environment

- **Verdict:** ACCEPT · **Severity:** P2 (review: P2) · **Label:** security-hardening

**Rationale.** Both verifiers accept, both critics accept the verdict, and the repo agrees.

The launch: packages/runner/src/pages.ts:241-243 calls chromium.launch({ headless: true, args: [...LAUNCH_ARGS, ...extraArgs] }) with neither chromiumSandbox nor env. In the installed playwright-core@1.63.0, coreBundle.js:43346-43347 adds --no-sandbox whenever chromiumSandbox !== true, and :39798 falls back to process.env when no env is given.

This is the production path. scripts/serve.ts:138 loads .env.agents into process.env (gateway env.ts:94-110). serve.ts:152 then starts the engine without injecting a renderer: startDevEngine -> createWorker (dev-engine.ts:101) -> playwrightPages() (worker.ts:63) -> launchChromium (pages.ts:100).

The renderer is shared by every medium, not only web pages:
- C1 views of model-written HTML (render.ts:31);
- web-page references given as HTML (critic.ts:158);
- BLIND-1 lineup cards for any lineup that mixes forms (critic.ts:180-207; critic.test.ts:103-108 asserts the cards form for a storyboard, prose and a web page against image references), including the C5 launch gate (catalog c5.ts:140).

Cards decode user-uploaded PNG, JPEG and WebP references (apps/web/src/server/refs.ts:14-35 checks only magic bytes) and provider-returned images through the artifact route (cards.ts:44). So the untrusted input is model JavaScript and also image bytes; the second path needs no model cooperation.

Measured on this host:
- design-H probe: production launchChromium(['--enable-automation']) shows --no-sandbox in CDP Browser.getBrowserCommandLine.
- revise-H-r1 probe: the revised options show none, and the raw control does.
- The verifiers measured the renderer at Medium integrity unsandboxed and Untrusted sandboxed.

Key custody is framed as an extension, not a breach of a written rule. Spec §2 and ADR-0074 'Keys' are about the user's browser and HTTP responses, so the renderer's environment was never covered. The principle that does apply is ADR-0030's 'keys never enter a sandbox'. The product never extended it to the renderer.

**Severity rationale.** I agree with P2. This is defense in depth against a conditional threat: it needs an exploitable Chromium, V8 or image-decoder bug to reach the renderer. There are two ways in. One is model output, such as a prompt-injected page that loads any npm script from the allowlisted unpkg or jsDelivr. The other is image bytes, such as a crafted reference upload or a provider frame decoded on a lineup card, which needs no model cooperation. No compromise has been demonstrated, so P1 is not warranted.

If such a chain succeeds, the attacker gets user-level control of the machine: .env.agents, the data directory, and the keys already in the browser's environment. That is material hardening, not a standards nit. Three things keep it at P2: Playwright is pinned at exactly 1.63.0, so known n-days accumulate; untrusted image decoding is a classic n-day surface; and the fix is cheap and verified on the primary platform.

**Root cause.** launchChromium (pages.ts:241-243) is the single place every renderer Chromium is started, and it states no containment policy. Two defaults built for other contexts therefore apply:
- Playwright's chromiumSandbox:false, meant for Docker and CI running as root, becomes --no-sandbox on every Chromium process.
- Inheriting process.env gives the browser process tree the provider keys that serve.ts loaded.

Nobody decided this. The product described the renderer's containment only as in-browser controls (spec §3.2 render row; ADR-0074 'Generated content'): the CDP request allowlist, the WebSocket and WebRTC blocks, deadlines and dialogs. That framing came after ADR-0067 dropped ADR-0031's OS-isolated renderer for the product without replacing its containment role. It also treated the renderer as a web-page renderer, though BLIND-1 has since made it the shared renderer for every medium's lineup cards, which decode user and provider images.

No test checks the effective launch flags or environment. Because the browser starts lazily, nothing reports a renderer that cannot start until a run reaches it.


### Options


**A. Review's full repair: sandbox plus a separate least-privilege renderer process or identity** (fixes root cause: yes; effort L; risk medium)

Set chromiumSandbox:true, verify it and fail closed. In addition, move Playwright and Chromium into a dedicated child process (or a separate low-privilege OS account) with a scrubbed environment. The child gets a narrow IPC interface: HTML, surfaces and artifact bytes go in, PNG tiles come out, and artifact-route lookups are proxied back to the engine.


*Pros*
- Strongest separation: keys are absent from the whole renderer process tree, including the Playwright driver
- With a separate OS identity, even a sandbox escape cannot read .env.agents or the data directory
- Matches the review's 'stronger isolation' wording literally

*Cons*
- Rebuilds tested renderer behaviour across IPC: the deadline race, AbortSignal cancellation, close-timeout escalation, crash relaunch and dialog dismissal (SEC-5/ENG-14), plus the artifact resolver callback
- A same-user child adds little over option B. Chromium's broker/renderer split already separates the code that runs page JS, and a same-user process can still read .env.agents and the data directory. Only a different OS identity changes that.
- A separate Windows account needs admin rights, credentials and ACL management, which is disproportionate for a local, single-user, loopback app
- Adds lifecycle and failure modes to engine start and stop (stopTree, ENG-10 grace times)


**B. Contain at the launch boundary: sandboxed, secret-free options by construction, no launch parameters, fail closed with one renderer-wide message, a readiness check before spend, effective-flag tests** (fixes root cause: yes; effort M; risk low)

pages.ts gets one options builder, chromiumLaunchOptions(), which always returns headless with chromiumSandbox:true, the fixed LAUNCH_ARGS and env = withoutSecrets(process.env). launchChromium() takes no parameters, so nothing can add flags to the production launch. It maps Playwright's sandbox start-up failure, through a pure sandboxFailure(err), to one plain, medium-neutral, non-retryable StepError, and never retries without the sandbox.

withoutSecrets becomes the single SEC-3 rule in the gateway's env module. It drops the provider key names, secret-looking names, and every name the secrets file set or kept.

PageRenderer gains ready(), which starts or finds the shared browser. It is used in two places:
- serve.ts prints a 'renderer' line at start-up through checkRenderer();
- beginRun refuses a web-page run before any paid step when the renderer cannot start.

Tests check the effective command line through CDP (with a negative control), the options contract, the failure mapping on every renderer path including lineup cards, and the begin-run gate. A new ADR extends ADR-0074.


*Pros*
- Fixes both halves of the root cause at the one boundary, so every caller is covered: C1 views, HTML references, lineup cards for every medium including the C5 gate, the e2e demo and tests
- Containment holds by construction: the production launch has no parameter, so no deny-list of weakening flags is needed
- Verified on this host (revise-H-r1 probe): the revised options show no --no-sandbox while the raw control does; a sandboxed launch plus close takes 95-111 ms; a card renders through the artifact route; ready() followed by renders uses one launch. The regression critic measured pixel-identical tiles, the same latency, cancellation, the runaway bound, relaunch and all five dialog variants under the same launch.
- The new fail-closed state is announced at start-up, and web-page runs fail before any paid step instead of after one
- Reuses and strengthens the repo's own secret rule (SEC-3) instead of adding a second one
- Activity-side only: no workflow-bundle, history, recipe-hash, contract or storage change (dist/workflows.js inlines none of the touched modules)

*Cons*
- The Playwright driver still runs in the engine process, which holds the keys. Containment relies on Chromium's broker/renderer split. On Windows the broker and the network-service utility stay at Medium integrity (root-cause critic's probe), so a full sandbox escape still lands at user level.
- Hosts where the sandbox cannot start will no longer render. That covers Linux with unprivileged user namespaces restricted (the default on Ubuntu 23.10 and later; inferred, not tested here) and running as root or in a container. It is the intended fail-closed behaviour, but on those hosts it is a platform-support change the user should ratify.
- Lineup cards for media other than web-page (C5 or prose against image references) can still reach an unavailable renderer only at the GREAT gate, after paid steps. The start-up line warns, but the run is not refused early: the references are in the workflow input, not available to beginRun.
- The env scrub is still a deny-list for variables exported in the shell under unconventional names
- Effective-flag checks run at test time. Production relies on construction, because the command line is not readable without --enable-automation.


**C. Minimal flag flip** (fixes root cause: partly; effort S; risk low)

Add chromiumSandbox:true to the chromium.launch call in launchChromium, and one test that the browser command line has no --no-sandbox.


*Pros*
- One line plus one test; removes --no-sandbox in production on hosts that support the sandbox
- Lowest possible change surface

*Cons*
- Leaves the provider keys in the environment of the browser process tree, so a renderer exploit without a sandbox escape can still read its own environment block
- launchChromium(extraArgs) still lets any caller pass --no-sandbox and silently undo the containment
- A host whose sandbox fails shows Playwright's raw text, which recommends 'chromiumSandbox: false', and Temporal retries it as transient. The failure arrives only after paid steps, with no start-up signal.
- Records no decision, so the gap ADR-0067 left stays undocumented


**D. Hardened container renderer (research ADR-0031 style)** (fixes root cause: yes; effort XL; risk high)

Run Chromium in a pinned, hardened Docker image: non-root, read-only root, dropped capabilities, egress only through an allowlist proxy and the artifact route. The engine drives it over a narrow interface.


*Pros*
- Strong OS isolation and a pinned, recorded renderer version
- Reuses a design the research track already accepted

*Cons*
- Contradicts ADR-0067, which keeps the product Docker-free; Docker Desktop and WSL2 would become prerequisites on Windows
- Re-plumbs the artifact route, the allowlist, cancellation and relaunch through a container boundary
- XL effort and new operational failure modes for a local, single-user app; out of product v1 scope


### Recommendation: B

**Why.** B removes the wrong assumption where it lives: launchChromium, the only production launcher, which every renderer use goes through, cards included. It fixes both halves of the root cause, the missing OS sandbox and the inherited secrets. It also closes the gap B's first version opened, which both critics raised: a host that cannot sandbox would otherwise discover it only after paying for steps.

Why B is enough. With the sandbox on, the process that runs page JavaScript and decodes images is at Untrusted integrity on Windows (measured by both verifiers). Reaching user-level authority from there needs a second bug, a sandbox escape. A same-user helper process (A without a new OS identity) would not stop that escape from reading .env.agents. A separate identity (A) or Docker (D) would, but they need admin rights or Docker, which conflicts with ADR-0067 and is disproportionate for a local, single-user, loopback app.

Why not C. It leaves the keys in the renderer's environment and leaves extraArgs as a way to undo the sandbox. It also gives a non-sandboxable host Playwright's raw 'use chromiumSandbox: false' advice, and only after money is spent.

Verified on Windows 11 with Playwright 1.63.0:
- The revised options compose to a browser with no --no-sandbox, and the raw control has it (revise-H-r1 probe).
- A sandboxed launch plus close takes about 100 ms, which is cheap enough for a start-up check.
- Cards decode images under the sandboxed launch (root-cause critic).
- Tiles are pixel-identical, and cancellation, the runaway bound, relaunch, the artifact route and the dialogs are unchanged (regression critic).

**Design.** Contract. The renderer's Chromium always runs inside its OS sandbox, with no provider key, no secret-looking variable and no name from the secrets file in its environment. When the sandbox cannot start, rendering fails with one plain message for every renderer use: web pages, HTML references and lineup cards. There is never an unsandboxed fallback. byway says at start-up whether the renderer is ready, and a web-page run whose renderer cannot start fails before any paid step.

Modules touched

1. packages/gateway/src/env.ts: the single secret rule (moved from apps/web/src/server/serving.ts:6-21).
- Keep SECRET_NAME = /(?:API_KEY|_KEY|_TOKEN|_SECRET|PASSWORD)$/i.
- loadEnvFile records, in a module-level WeakMap keyed by the env object it was given, every name the file listed: those it set (report.loaded) and those already present (report.kept).
- export function withoutSecrets(env, extraNames = []) drops undefined values, every KEY_VARS name, every name the secrets file listed into this same env object, extraNames, and names matching SECRET_NAME.
- Export it from the package index. No './env' subpath: runner already depends on and imports @byway/gateway, and a plain-node import of the index from runner works (about 0.5 s against about 0.05 s for env.ts alone, measured).
- Doc comment: one rule for every child that must not hold keys (next build, the renderer).

2. apps/web/src/server/serving.ts. Delete withoutSecrets and SECRET_NAME. Update the three call sites:
- scripts/serve.ts:35-36 imports it from the gateway, and :118 becomes withoutSecrets(process.env). This gives next build the same exactness for names from the secrets file; behaviour is otherwise unchanged, because every KEY_VARS name already matches SECRET_NAME.
- apps/web/test/dev-server.real.test.ts:17,84 imports it from '@byway/gateway' and calls withoutSecrets(process.env).
- serving.test.ts loses its case, which moves to packages/gateway/test/env.test.ts with the same expectation, plus a case for names from the file.

3. packages/runner/src/pages.ts.
- export function chromiumLaunchOptions(env: Env = process.env): LaunchOptions returns { headless: true, chromiumSandbox: true, args: [...LAUNCH_ARGS], env: withoutSecrets(env) }. The env parameter exists only so tests can pass a fixture; it can only remove variables.
- export const SANDBOX_UNAVAILABLE, wording along these lines: byway cannot render pages on this computer (web pages, and the cards that show a reviewer the examples beside the work): Chromium's security sandbox could not start, and byway never renders without it. This happens when byway runs as root or inside a container, and on Linux systems that restrict unprivileged user namespaces (Ubuntu 23.10 and later). The README section 'Rendering needs Chromium's sandbox' says how to allow it for Playwright's Chromium alone. It never mentions chromiumSandbox:false or a system-wide sysctl.
- export function sandboxFailure(err: unknown): StepError | undefined. It is pure: an Error whose message contains Playwright's start-up rewrite 'Chromium sandboxing failed!' (coreBundle.js:43204-43216, which covers crbug.com/357670, 'No usable sandbox!' and the root refusal crbug.com/638180), or Chromium's own 'No usable sandbox', becomes new StepError(SANDBOX_UNAVAILABLE, { cause: err }); anything else returns undefined.
- export async function launchChromium(): Promise<Browser> takes no parameters. It calls chromium.launch(chromiumLaunchOptions()) once, and in its catch it throws sandboxFailure(e) ?? e. Every other launch error passes through unchanged, so the existing relaunch behaviour and the missing-Chromium error stay as they are.
- PageRenderer gains ready(): Promise<void>, which starts the shared browser, or finds it running, and rejects as a launch would. In playwrightPages it is `await getBrowser()`, so the browser it starts is the one later renders reuse.
- export async function checkRenderer(): Promise<{ ready: true } | { ready: false; message: string }> never rejects. It does playwrightPages().ready() then close(). On failure the message is the StepError's own, or for any other error "Playwright's Chromium could not start (<first line of the error>). If it is not installed: pnpm --filter ./apps/web exec playwright install chromium".
- The header comment states the containment contract and the renderer's untrusted inputs. The PlaywrightPagesOptions.launch doc says it is for tests only; production always uses launchChromium.
- packages/runner/src/index.ts additionally exports chromiumLaunchOptions, checkRenderer, sandboxFailure and SANDBOX_UNAVAILABLE.

4. packages/runner/src/activities/liveness.ts guardPages passes ready through. packages/runner/test/helpers/fake-pages.ts implements ready(), which resolves by default and rejects with a given error when a test asks.

5. packages/runner/src/activities/lifecycle.ts beginRun: `if (run?.medium === 'web-page' && deps.pages) await deps.pages.ready();` placed before the first step runs. A web-page run renders at its first RENDER, so a renderer that cannot start fails the run here, through guarded/toFailure, as a non-retryable FAILURE.step with the plain message, and nothing has been spent. Runs of other media are not gated, because they need the renderer only when a lineup forms cards, and that depends on references held in the workflow input.

6. scripts/serve.ts. Start `const rendererChecking = checkRenderer()` alongside startDevEngine. After the engine line, print `renderer   Chromium, inside its security sandbox`, or `renderer   not available: <message>`. byway keeps running either way, because prose, options and code-diff runs need no renderer unless a lineup forms cards.

7. Docs.
- New ADR (see adrNeeded) and the ADR README index row and counts.
- Spec §2 Keys: add that the page renderer's Chromium runs with none of the keys in its environment.
- Spec §3.2 render row: inside Chromium's OS sandbox, used for views, HTML references and lineup cards, never unsandboxed.
- README line 53: byway renders web pages and lineup cards with Playwright's Chromium inside its OS sandbox. A new short section, 'Rendering needs Chromium's sandbox', covers: do not run byway as root or in a container; on Ubuntu 23.10 and later, install a per-binary AppArmor profile that allows userns for Playwright's Chromium executable (Ubuntu's documented route, not tested here); the system-wide sysctl weakens the whole machine and is not recommended. The start-up line says when this applies.
- docs/backlog.md 'Product follow-ups' (see notDoing).

Data flow (unchanged apart from the launch and the readiness check)
worker.ts:63 playwrightPages() -> getBrowser (pages.ts:92) -> launchChromium() -> chromium.launch({ headless, chromiumSandbox: true, args: LAUNCH_ARGS, env: withoutSecrets(process.env) }). The Chromium broker runs at user level and spawns the renderer (Untrusted on Windows), the GPU process (Low) and the network-service utility (Medium; not sandboxed in this build). CDP routing, the allowlist, the WebSocket block, deadlines and dialogs work as before.

Failure paths
- At start-up: the 'renderer' line says not available, with the plain message.
- Web-page run: beginRun -> ready() -> StepError -> non-retryable -> the run fails with the plain message before any model call.
- Any render (C1 view, HTML reference, lineup card): the sandbox failure becomes a StepError, getBrowser's launching.catch clears the browser, shoot rethrows, toFailure makes it non-retryable, and the step fails with the same plain message. The next render tries again under the same options and never with --no-sandbox.
- On Windows or macOS a sandbox that fails per renderer (antivirus or policy) shows up as a raw page or target crash. That stays retryable and unmapped, because a crash can also be out-of-memory, and it still never falls back.


**Steps**
1. Browser-free tests first, in a new packages/runner/test/launch.test.ts with vi.mock('playwright'). (a) Options: chromiumLaunchOptions(env), where env is a fixture with PATH, SystemRoot, HOME, every KEY_VARS name, GITHUB_TOKEN, MY_SECRET, and a name ODD_CREDENTIAL loaded through loadEnvFile from a temp secrets file into that same env object. The result has headless true, chromiumSandbox true and args deep-equal to the two WebRTC flags; its env keeps PATH, SystemRoot and HOME and has none of the others. (b) sandboxFailure: Playwright's full 'Failed to launch the browser process ... Chromium sandboxing failed! ... chromiumSandbox: false' text and a bare 'No usable sandbox!' both give a StepError whose message is SANDBOX_UNAVAILABLE, does not match /chromiumSandbox|sysctl/, and keeps the original as cause; "Executable doesn't exist at ..." and non-Errors give undefined. A drift check confirms the installed playwright-core, resolved from playwright, still contains 'Chromium sandboxing failed!' in its lib files. (c) launchChromium: the mocked chromium.launch is called exactly once, with options deep-equal to chromiumLaunchOptions(); when it rejects with the sandbox text, the result is that StepError and toFailure gives a non-retryable ApplicationFailure of type FAILURE.step; any other rejection passes through unchanged. (d) The same failure on every renderer path, through the real playwrightPages() and its default launcher with playwright mocked: render(cardHtml(...)), ready(), and buildLineup with image references (the cards form) each reject with the same StepError. (e) checkRenderer: launch resolves to a fake browser -> { ready: true } and the browser is closed; sandbox text -> { ready: false, message: SANDBOX_UNAVAILABLE }; missing executable -> { ready: false } with the install hint.
2. Real-Chromium test in packages/runner/test/pages.test.ts, 'the renderer's Chromium runs inside its OS sandbox': launch { ...chromiumLaunchOptions(), args: [...chromiumLaunchOptions().args, '--enable-automation'] } (test-only, so CDP returns the command line) and check that Browser.getBrowserCommandLine has no '--no-sandbox'. Negative control: a raw chromium.launch({ headless: true, args: ['--enable-automation'] }) has it. In the same file, playwrightPages({ launch: counting wrapper around launchChromium }): ready() followed by two renders launches once. Rewrite the WebSocket test (pages.test.ts:148) to compose its --disable-features flag the same way instead of passing it to launchChromium. Close every browser.
3. Begin-run gate test in a new packages/runner/test/begin-run.test.ts: a temp store, with fakePages whose ready() rejects with sandboxFailure(new Error('Chromium sandboxing failed!')). createActivities(deps).beginRun for a web-page run rejects with a non-retryable FAILURE.step carrying SANDBOX_UNAVAILABLE, and the gateway records no call. The same renderer lets a prose run begin. A ready renderer lets the web-page run begin.
4. Run the new tests and watch them fail against b33f128: chromiumLaunchOptions, sandboxFailure, checkRenderer and ready are missing, and the effective command line shows --no-sandbox (design-H probe: production.noSandbox=true).
5. Move withoutSecrets into packages/gateway/src/env.ts, adding the secrets-file name tracking in loadEnvFile. Export it from the index. Move the serving.test.ts case to packages/gateway/test/env.test.ts and add the file-names case. Update scripts/serve.ts (:35-36 imports, :118 withoutSecrets(process.env)) and apps/web/test/dev-server.real.test.ts (:17, :84). Delete the serving.ts copy.
6. Implement in pages.ts: chromiumLaunchOptions, SANDBOX_UNAVAILABLE, sandboxFailure, the parameterless launchChromium, PageRenderer.ready, checkRenderer, and the header and launch-option doc comments. Then implement guardPages.ready, FakePages.ready, the runner index exports, the beginRun gate, and the serve.ts 'renderer' start-up line.
7. Run packages/runner tests (launch, pages including the dialog-page subprocess helper, cards, critic, begin-run and the scenario suites), the gateway and web tests (serving, dev-server.real), pnpm -s typecheck and pnpm e2e. The e2e is demo mode with the real, now sandboxed renderer through C1, C3, C4, C5 and C6a, and its start-up output shows the 'renderer' line. Then confirm git status lists only the intended files and no chrome-headless-shell process remains.
8. Docs: write the ADR. Update the ADR README index row and counts, spec §2 Keys and the §3.2 render row, README line 53 plus the 'Rendering needs Chromium's sandbox' section, and the backlog 'Product follow-ups' items listed under notDoing.


**Acceptance tests**
- Effective state: Chromium launched from chromiumLaunchOptions() plus the test-only '--enable-automation' has no '--no-sandbox' in CDP Browser.getBrowserCommandLine, and the raw chromium.launch control does. Measured in the revise-H-r1 probe: revised false, raw true. Today production shows it (design-H probe: production.noSandbox=true).
- By construction: launchChromium() takes no parameters, calls chromium.launch exactly once with options deep-equal to chromiumLaunchOptions(), and those options have chromiumSandbox === true and args exactly equal to the two WebRTC flags. Today the option is absent, so Playwright's default (false) applies, and extraArgs can add any flag.
- Secrets out of the renderer: chromiumLaunchOptions(env).env contains no KEY_VARS name, no GITHUB_TOKEN or other secret-looking name, and no name that loadEnvFile read from the secrets file into env (including one that does not look secret). It keeps PATH, SystemRoot and HOME. Today Playwright hands Chromium the whole process.env (coreBundle.js:39798).
- Fail closed, plainly, on every renderer path: Playwright's 'Chromium sandboxing failed!' start-up text produces one StepError with SANDBOX_UNAVAILABLE. That message is medium-neutral, names root or a container and Ubuntu's user-namespace restriction, and does not mention chromiumSandbox or sysctl. It comes out of launchChromium, ready(), a C1-style render, and buildLineup's card path, and toFailure makes it non-retryable. Launch is attempted once per render and never with --no-sandbox. Today the raw text, which suggests 'chromiumSandbox: false', reaches the step after paid work, and Temporal retries it as transient.
- Drift guard: the installed playwright-core still contains 'Chromium sandboxing failed!'. A Playwright bump that rewords it fails this test. Without the test the drift would fail safe (raw, retryable, still sandboxed) but unannounced.
- Before spend: a web-page run whose renderer's ready() rejects with the sandbox StepError fails at beginRun with the plain message and no gateway call. A prose run on the same renderer begins. Today a web-page run pays for its build and seed steps and then fails at RENDER.
- Start-up signal: checkRenderer() gives { ready: true } when the sandboxed launch works (about 100 ms here), the plain sandbox message when it does not, and the install hint for a missing Chromium. serve.ts prints it as the 'renderer' line, which the pnpm e2e start-up output shows. Today nothing reports the renderer until a run reaches it.
- One shared secret rule: withoutSecrets lives only in @byway/gateway. The moved SEC-3 case gives the same result as apps/web/test/serving.test.ts:21 does today, and serve.ts, dev-server.real.test.ts and the renderer all import that one definition.
- Regression, green before and after: the existing pages.test.ts cases (1440 tiles with the artifact route and other hosts blocked; RENDER-1 surfaces; phone overflow; runaway 2 s StepError and the next render working; the five dialog variants in their own process; failing artifact route giving 404; cancellation; WebSocket block; relaunch after a failed launch or a crash), cards.test.ts (real Chromium, now sandboxed by default), critic.test.ts, the scenario suites with fakePages, and the pnpm e2e journeys C1, C3, C4, C5 and C6a. Evidence already collected: the regression critic measured pixel-identical tiles and unchanged latency, cancellation, runaway bound, relaunch and dialogs under the same launch; the root-cause critic rendered a card decoding PNG and WebP through the artifact route under it; the revise-H-r1 probe rendered a card and three surfaces with one launch after a warm-up.


**Compatibility.** Temporal replay and determinism are unaffected. dist/workflows.js inlines only contracts/runner.ts, prompts ids/outputs/slots, the protocol, store resolution, and runner gates/hits/labels/types/workflow/* (checked against the built bundle's source markers). pages.ts, liveness.ts, lifecycle.ts and gateway env.ts are not in it. The workflow bundle hash therefore does not change, ADR-0078/C7 retires no open runs, and persisted histories replay as before. beginRun's new check is activity behaviour: a run whose beginRun already completed is unaffected, and a retried beginRun simply checks the renderer.

No change to stored data, SQLite, CAS, the ledger, recipe hashes or the contracts package.

Runner surface:
- PageRenderer gains ready(). Its implementers are playwrightPages, guardPages and the test FakePages; RunnerDeps is unchanged.
- launchChromium loses its extraArgs parameter. Only tests passed it (pages.test.ts:148, 169), and they compose from chromiumLaunchOptions() instead.
- New exports: chromiumLaunchOptions, checkRenderer, sandboxFailure and SANDBOX_UNAVAILABLE.

withoutSecrets moves from apps/web to @byway/gateway. Its signature changes from (env, keyVars) to (env, extraNames = []) with KEY_VARS always dropped, at three call sites. It now also drops names listed in the secrets file, which only affects next build and the renderer, neither of which needs them.

Rendering: the same headless shell and flags, minus --no-sandbox. Tiles were pixel-identical in the regression critic's run on Windows. No pixel-equality guarantee is claimed elsewhere.

Runs:
- On a host where the renderer starts, web-page runs now launch the browser at beginRun instead of at the first RENDER. It is the same shared browser, so no extra cost.
- With Chromium missing, a web-page run now fails at beginRun with the existing raw error, after the quick proxy's retries and before any paid step, instead of after paid steps.

Platforms:
- Windows 11: verified. The sandbox works; the renderer is at Untrusted and the GPU process at Low; the broker and the network service remain at Medium.
- macOS: expected to work, because its sandbox needs no privileges, but not verified.
- Linux: with unprivileged user namespaces restricted (the Ubuntu 23.10 and later default; inferred, not tested here) and on any host run as root or in a container, every renderer use fails closed: C1 views, HTML references, and lineup cards including the C5 gate. byway says so at start-up and refuses web-page runs before spend. Other media fail at a card lineup after paid steps; that residual is recorded.

There is no CI in the repo, so nothing automated breaks; pnpm e2e runs the real renderer on Windows.

**ADR.** Yes. A new Product-track ADR at the next free number (0081 at b33f128; renumber if another fix lands first), Accepted, Delegated: 'The page renderer runs inside Chromium's OS sandbox, with no keys or secrets-file names in its environment, says at start-up whether it can, and never falls back to running unsandboxed.'

It extends ADR-0074 by addition only. ADR-0074's text is not edited (docs/adr/README.md:10); the new ADR links back to it. It applies ADR-0030's 'keys never enter a sandbox' principle to the product renderer, which the product had not done before; it does not claim to restore spec §2 or ADR-0074 'Keys', which concern the user's browser. It records that ADR-0031's container renderer stays research-only, per ADR-0067.

Threat model: the renderer's untrusted inputs are model-written HTML and JS, HTML references, user-uploaded reference images and provider-returned images and frames. It is the shared renderer for C1 views, HTML references and BLIND-1 cards for every medium, including the C5 gate.

What the sandbox covers on Windows: the renderer runs at Untrusted and the GPU process at Low, while the broker and the network-service utility stay at Medium. The network service handles responses from the allowlisted CDNs.

It explains why the artifact route is not narrowed. It answers only exact recorded sha256 content-hash ids, validated by the store (artifacts.ts:17, 122-125), and egress is limited to the allowlist. It also says that a per-renderer sandbox failure on Windows or macOS appears as a retryable crash, never as a fallback.

Evidence: review F18, both verifier probes, the integrity measurements, the design-H and revise-H-r1 probes, and both critics' probes.

Flagged for the user's ratification, and logged in the backlog per the code-first rule: the platform-support consequence that hosts which cannot sandbox (Linux with userns restricted, root, containers) no longer render, and whether an explicit owner opt-out should exist.

Update the ADR README index row and the counts line (from '80 records: 73 accepted (15 …; 18 delegated) and 7 proposed' to 81/74/19 at b33f128) in the same change.


**Deliberately not doing**
- No separate renderer process or low-privilege OS account (option A). A same-user helper adds little over Chromium's broker/renderer split, and a separate identity needs admin rights and account management, which is disproportionate for a local, single-user app. Revisit if byway is ever hosted or multi-user, where the review's threat-model note already calls for a fresh design.
- No Docker or containerized renderer (option D); ADR-0067 keeps the product Docker-free.
- No deny-list of sandbox-weakening flags. The production launch has no parameter at all, which is smaller and complete. Tests compose their extra flags from chromiumLaunchOptions() in test code. PlaywrightPagesOptions.launch stays as a documented test-only seam; production (worker.ts:63) passes none.
- No owner opt-out to run unsandboxed (for example BYWAY_RENDER_SANDBOX=off) in v1, because it would bring the hazard back by configuration. Parked in the backlog as a decision for the user, together with the Linux and root platform-support trade. If added, it must be explicit and printed in the 'renderer' start-up line, never automatic.
- No early refusal for runs of other media that may later form lineup cards (C5, prose or media against image references). Their references live in the workflow input, so refusing them at beginRun would change workflow code and retire open runs (C7). The start-up line warns; the residual is recorded in the ADR and the backlog.
- No production self-inspection of effective flags. Reading the command line needs --enable-automation, which sets navigator.webdriver for every page, or per-OS process inspection. The invariant holds by construction, and the tests check effective state.
- No win32 integrity-level test (dropped, as the regression critic suggested). The PowerShell Add-Type P/Invoke compiles C# at run time and is fragile under Constrained Language Mode and antivirus. The CDP command-line check with its negative control already tells the two launches apart.
- No allowlist-only environment for Chromium. On Linux and macOS, fonts, locale and fontconfig depend on variables not tested here, and a wrong guess would quietly change what critics see. The deny-list is the repo's own SEC-3 rule, now exact for the secrets file. Unconventionally named secrets exported in the shell remain a documented residual.
- No mapping of a missing Chromium, or of per-renderer crashes, to new messages. A missing Chromium keeps its existing error and is now caught at start-up and before spend for web-page runs. Crashes stay retryable because they can also be out-of-memory.
- No narrower artifact interface. The route answers only exact recorded sha256 ids, validated by the store, behind the egress allowlist. The reason is recorded in the ADR rather than dropped silently.
- No './env' subpath export on @byway/gateway. runner already imports the package index, and the dialog helper loads it in plain Node (measured).
- No change to the CDN allowlist breadth (unpkg and jsDelivr serve any npm package), no Playwright bump policy, and no change to the network-service sandbox on Windows (Medium in this build) here. All three go to backlog 'Product follow-ups': renderer egress; pinned-version n-days, plus re-checking the sandbox failure text on each bump (the drift test also catches it); and investigating whether the network service can be sandboxed on Windows, without adding an untested flag now.
- No edit to protocol/06-runbook.md §1, whose RENDER snippet launches Chromium with Playwright's unsandboxed default. That belongs to the protocol track; a backlog note asks it to decide, so harness users do not copy the default.
- No change to the Temporal CLI child or the web process environments. They run trusted code, and the web process is meant to hold keys (serve.ts:19-20).


**How it resolves each finding**
- **F18:** Resolved by option B at the single launch boundary, packages/runner/src/pages.ts.

(1) Sandbox by construction. chromiumLaunchOptions() always sets chromiumSandbox:true with the fixed LAUNCH_ARGS, so Playwright no longer adds --no-sandbox (coreBundle.js:43346). launchChromium() takes no parameters, so nothing can weaken the production launch.

(2) The renderer is isolated from secrets. Chromium gets env = withoutSecrets(process.env), which drops every provider key name, every secret-looking name and every name the secrets file listed. It is one rule in @byway/gateway, shared with next build (SEC-3). This extends ADR-0030's 'keys never enter a sandbox' to the product renderer.

(3) It fails visibly, before spend where possible, with no fallback:
- One plain, medium-neutral, non-retryable StepError covers web pages, HTML references and lineup cards. It names root or a container and the Ubuntu user-namespace restriction, and points to a README section that does not recommend weakening the whole system.
- serve.ts prints a 'renderer' start-up line.
- beginRun refuses a web-page run whose renderer cannot start, before any paid step.
- Nothing ever relaunches with --no-sandbox.

(4) The effective configuration is verified. A real-Chromium CDP test with a negative control, the options contract, the mapping on every renderer path (including buildLineup's cards), a drift guard on Playwright's failure text and a begin-run gate test cover it. The existing allowlist, WebSocket and WebRTC blocks, deadlines, dialogs and relaunch are unchanged; the critics measured them under the sandboxed launch.

A new ADR extending ADR-0074 (by addition only) records:
- the decision and the renderer's full threat model, including user and provider images;
- what the sandbox does not cover (broker and network service at Medium on Windows);
- why the artifact route is not narrowed;
- the Linux and root platform consequence, flagged for the user's ratification;
- the parked follow-ups: opt-out decision, card lineups of other media, CDN breadth, Playwright bumps, the Windows network-service sandbox, and the protocol runbook snippet.

No workflow, replay, storage, contract or recipe-hash impact.


**Changes forced by the adversarial rounds (last round)**
- ACCEPTED, root-cause mustFix 1 (the renderer is shared by every medium). Verified: critic.ts:180-207 (cardOf renders every card through deps.pages.render; formOf gives 'cards' for media, prose and web-page against image references, asserted at critic.test.ts:103-108); the C5 gate at catalog c5.ts:140; user images checked only by magic bytes at apps/web/src/server/refs.ts:14-35; cards loading images through the artifact route at cards.ts:44. The code fix already covered these callers, but the message, docs, blast radius and threat model were scoped to web pages. Changes:
- SANDBOX_UNAVAILABLE is now medium-neutral.
- The ADR, spec §3.2, README and compatibility section list every renderer use, including the C5 gate.
- The ADR's threat model lists user-uploaded and provider images as untrusted input.
- The severity rationale adds image decoding as a delivery path that needs no model cooperation (P2 unchanged; still conditional).
- New acceptance test: the same StepError comes out of render, ready() and buildLineup's card path.
- cards.test.ts runs sandboxed by default.
- ACCEPTED, root-cause mustFix 2 (failing closed only after spend). Verified: the lazy launch at pages.ts:92-111; the C1 render after the paid build (render.ts:31); the C5 gate after media generation; Playwright rewriting the root refusal (crbug.com/638180) to the same 'Chromium sandboxing failed!' text (coreBundle.js:43204-43216). My earlier claim that this was 'the same as a missing Chromium' was wrong: this fix creates a new failure class. Changes:
- checkRenderer() runs at start-up in serve.ts and prints a 'renderer' line. A sandboxed launch plus close took 95-111 ms here.
- PageRenderer.ready() plus a beginRun gate refuses web-page runs before any paid step. It is activity-side only; lifecycle.ts is not in dist/workflows.js, which I checked.
- The remaining gap (other media reaching cards at the GREAT gate) is recorded in the ADR and backlog, with the reason: their references are workflow input, so gating them would change workflow code and trigger C7.
- ACCEPTED, shouldConsider (an incomplete, speculative deny-list). Removed SANDBOX_WEAKENING and launchChromium's extraArgs. The production launch now has no parameter, which is smaller and complete. Tests compose from chromiumLaunchOptions(), and pages.test.ts:148 is rewritten that way. The 'no silent weakening' acceptance test is replaced by 'no parameter, args exactly LAUNCH_ARGS'.
- ACCEPTED in adapted form, shouldConsider (make the scrub exact for the secrets file). Instead of threading EnvLoadReport names through startDevEngine, createWorker and playwrightPages, loadEnvFile records the names it set or kept, per env object, in the gateway env module. withoutSecrets drops them. serve.ts's next build uses withoutSecrets(process.env), so SEC-3 gains the same exactness. Unconventionally named secrets exported in the shell remain a documented residual.
- ACCEPTED, both critics (do not overclaim the key invariant). Spec §2 and ADR-0074 'Keys' concern the user's browser and responses. The verdict rationale, ADR and perFinding now say the fix extends ADR-0030's principle to the renderer, not that it restores a breached rule. F18 stands without that argument.
- ACCEPTED, shouldConsider (the sandbox does not cover the whole tree). The root-cause critic's probe shows the browser broker at 0x2000, the network-service utility at 0x2000 and the GPU at 0x1000; the verifiers measured the renderer at Untrusted. The ADR and option B's cons state this. A backlog item asks whether the network service can be sandboxed on Windows, with no untested flag added now.
- ACCEPTED, shouldConsider (name root and containers). The message and README now cover running as root or in a container as well as Ubuntu's userns restriction, because Playwright gives both the same text and the mapping cannot tell them apart.
- ACCEPTED, both critics (the Linux hint). The message no longer says 'allow unprivileged user namespaces'. It points to a README section that recommends a per-binary AppArmor profile for Playwright's Chromium (Ubuntu's documented route, not tested here) and warns that the system-wide sysctl weakens the whole machine.
- ACCEPTED, regression critic (Linux is understated). The restriction is the default on Ubuntu 23.10 and later (inferred, not tested here). The ADR flags the fail-closed platform trade, and whether an opt-out should exist, for the user's ratification, and the backlog logs it per the code-first rule rather than burying it as a silent Delegated item.
- ACCEPTED, shouldConsider (per-renderer sandbox failure on Windows or macOS). The ADR notes that it surfaces as a raw, retryable page or target crash, still with no fallback. It is not mapped to the sandbox message, because a crash can also be out-of-memory.
- ACCEPTED, shouldConsider (protocol/06-runbook.md:35-39). Verified: the RENDER snippet uses a default chromium.launch(), which is unsandboxed. The protocol is a separate track and is not edited by this product fix; a backlog note asks that track to decide.
- ACCEPTED, shouldConsider (the review's 'narrow artifact interface'). The ADR now says why it is not needed. The route answers only exact recorded sha256 ids, which the store validates (artifacts.ts:17 ID regex; has() at :122-125 rejects malformed or unrecorded ids), and egress is limited to the allowlist.
- ACCEPTED, both critics (a missed call site). apps/web/test/dev-server.real.test.ts:17,84 is now named in the steps. The signature change from (env, keyVars) to (env, extraNames=[]) with KEY_VARS always dropped is spelled out for all three call sites (serve.ts:118, serving.test.ts:21, dev-server.real.test.ts:84). Behaviour is unchanged for those names, because every KEY_VARS name already matches SECRET_NAME.
- ACCEPTED, both critics (no test-only parameter on a public export). The mapping is a pure exported sandboxFailure(err), tested directly. launchChromium's call is checked with vi.mock('playwright') in its own test file. A drift test asserts that the installed playwright-core still contains 'Chromium sandboxing failed!', and the parked Playwright-bump item says to re-check it. Drift fails safe in any case: the error stays raw and retryable, and the browser stays sandboxed.
- ACCEPTED, regression critic (ADR-0074 is not edited). The additions live only in the new ADR, which links back. The index row and the counts line are updated in the same change.
- ACCEPTED, regression critic (the './env' subpath is optional). Dropped. I measured that a plain-node import of @byway/gateway resolves from packages/runner and loads in about 0.5 s (env.ts alone takes about 0.05 s). runner already depends on and imports the package, so the export surface does not need to grow.
- ACCEPTED, regression critic (drop the win32 integrity-level test). Removed. The CDP check with a negative control is enough: in the revise-H-r1 probe the revised launch showed no --no-sandbox and the raw launch did.
- INCORPORATED, regression critic's measurements (no Windows regression: pixel-identical tiles, the same latency, cancellation, runaway bound, relaunch, artifact route and dialogs under the sandboxed launch; the workflow hash unaffected). They are cited as evidence. Effort is revised from S to M because of the start-up check, the begin-run gate and the secrets-file names; risk stays low.
- NEW EVIDENCE (revise-H-r1, C:/Users/arvik/AppData/Local/Temp/byway-review-verify/revise-H-r1/probe.mts and probe-results.json):
- the revised options composed with --enable-automation give noSandbox=false, and the raw control gives true;
- a sandboxed launch plus close took 100/95/111/101/97 ms;
- a card decoding an artifact-route PNG rendered one tile;
- ready-style warm-up then two renders used one launch;
- Playwright's rewrite text, including the crbug.com/638180 root case, is present in the installed bundle.
The repo stayed clean at b33f128, and no chrome-headless-shell process was left running.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- Non-blocking. The design says runs of other media that later form lineup cards (C5, prose or media against image references) cannot be refused before spend, so it records them as a residual. That residual can be closed on the activity side, and the design does not consider how. Every model step already receives the run's references: interpreter.ts:311 passes refs: this.input.inputs.refs to model.modelStep. startRun accepts references only for recipes that use examples (apps/web/src/server/api.ts, the takesRefs check). So modelStep could await deps.pages.ready() before its first provider call when refs.length >= GREAT_MIN_REFERENCES and any reference is an image. That needs no change to the workflow bundle and does not trigger C7.
- Non-blocking. Making the scrub exact for the secrets file changes next build as well as the renderer. withoutSecrets would drop every name .env.agents lists, including non-secret settings a user may keep there. Examples: HTTPS_PROXY/NO_PROXY, which Chromium on Linux can honour for the allowlisted CDN fetches; BYWAY_NEXT_DIST_DIR, which apps/web/next.config.ts reads for distDir while webEnv still passes it to next start, so build and start would disagree.
- Non-blocking. I verified the mapping on the real launch path and the test fixtures should match it. With Playwright's default pipe transport, waitForReadyState returns at once (coreBundle.js:42932-42934), so a Chromium that dies at start-up surfaces as 'browserType.launch: Target page, context or browser has been closed', not as 'Failed to launch the browser process'. Playwright's _rewriteStartupLog (coreBundle.js:39673, 39907-39912) still inserts 'Chromium sandboxing failed!' into the logs. My echo.exe stand-in showed this 5/5 for the user-namespace 'No usable sandbox!' marker and 5/5 for the root crbug.com/638180 marker, and 0/5 for an unrelated failure (check-H/rewrite4-results.json). So the mapping key holds. Two gaps remain: (1) step 1(b) uses only the 'Failed to launch the browser process ...' text as its fixture, and (2) checkRenderer's fallback for unmapped launch errors would print 'Target page, context or browser has been closed' plus an install hint, which is uninformative.
- Non-blocking documentation gap. apps/web/README.md:91 says next build gets no keys via src/server/serving.ts. Step 8's docs list does not include updating it when withoutSecrets moves to @byway/gateway. Also, the acceptance item that the 'renderer' line appears in the pnpm e2e start-up output is a manual check: scripts/e2e.ts pipes serve.ts output into tmpdir/byway-e2e-server.log, and nothing asserts the line.
- Process note, not a design issue: I briefly wrote into the read-only repo. A probe used C:/Windows/System32/cmd.exe as a stand-in Chromium executable. cmd.exe parsed '/cmd.exe' in the forward-slash path as '/c md.exe ...', so it created 68 empty, untracked directories named after Chromium's launch flags in the root of C:/Users/arvik/code/byway. I removed exactly those (rmdir, empty directories only; list in check-H/stray.txt). Afterwards no new entries remained in the repo root, git status was clean and HEAD was still b33f1285. The two temporary Playwright profile folders were already gone, and no stand-in process remained. Later probes ran from my scratch folder with echo.exe, which writes only to stdout.


## Cluster I: Canonical JSON key validation

**Root cause.** Well-formed text is a precondition of hashing in Byway (RFC 8785 for canonical JSON, and UTF-8 for sha256Hex), but it is enforced in only one place, @byway/canonical's string-value branch. Even there, property names bypass it (index.ts:56) and sha256Hex silently re-encodes lone surrogates. None of the three places where untrusted text enters a hashed record makes sure the text is well-formed. (1) Recipe input: parseRecipe ('Parse untrusted input into a Recipe', schema.ts:257-264) returns Recipes that recipeHash cannot hash, so composer answers and CLI files carrying a JSON \u escape reach recipeHash in checkAnswer (compose.ts:102), `byway hash` (main.ts:87) and runner.start (client.ts:72). (2) Ledger read-back: Ledger.verify (ledger.ts:270-280) assumes every parsed line is a hashable entry object. It throws on a lone-surrogate value, a 1e400 number or a `null` line, which breaks its documented contract. (3) Provider output written to the ledger: ModelGateway.record (gateway.ts:569-581) copies provider-reported labels (servedModel from res.model, msg.model or res.modelVersion; upstreamProvider from res.provider) into the hash-chained entry after the call was billed. One malformed label makes entryHash throw, and billedFailure leaves the spend uncounted (ENG-3). The correction has two parts: make the library conform (keys and sha256Hex), and make each of the three boundaries guarantee hashability by construction, so no downstream caller needs a catch. The numeric twin, a non-finite usage number reported by a provider (JSON 1e400), is an accounting-value rule that belongs to the F03 cluster and is handed off there explicitly. It is not part of this text-validity root cause.


### F19: Canonical string validation excludes object keys

- **Verdict:** ACCEPT · **Severity:** P3 (review: P3) · **Label:** standards-conformance

**Rationale.** Reproduced at b33f1285 by both verifiers, by my first-round probe and again in this round (revise-I-r1/probe-revise.mts). In packages/canonical/src/index.ts the lone-surrogate check (isWellFormed, line 24) runs only in the string-value branch. Property names go through a bare JSON.stringify(key) at line 56, which escapes a lone surrogate instead of rejecting it. canonicalize({'\ud800':1}) and canonicalize({a:[{'x\udc00':1}]}) both succeed, while {s:'\ud800'} throws. RFC 8785 §3.2.2.2 applies string rules to property names. The package comment, ADR-0059 ('JSON hashed with RFC 8785') and the engine-core spec's canonical section all promise conformance. I keep the refuter's two corrections. (a) 'Interoperability' is theoretical, because no second canonicalizer exists in the product. (b) The review's repair alone regresses callers that rely on 'what I parsed can be hashed'. This round the critics showed that the same wrong assumption reaches further than my first design covered. Provider-reported labels written to the money ledger are a third untrusted boundary: I reproduced end to end that a fake Anthropic reply with model 'claude-opus-5-5\ud800' makes complete() raise 'answered and billed ... could not be written to the ledger', with spend 0 and nothing stored. Also, my first-round Ledger.verify helper let a line with a missing hash and an ill-formed value pass as intact (probe: firstRound returns null; on line 1 it blames the next entry). Both are now in the design.

**Severity rationale.** P3 still fits. The library breaks RFC 8785 and its own contract, so the severity cannot be 'none'. It stays low because every path to the defect needs a lone surrogate, which can only enter as a JSON \u escape. That means a model writing the escape into its recipe answer (now refused at parse), a crafted CLI file, a damaged ledger line, or a malformed or compromised provider response. Recipe knob names must be registered (ST7, COMPOSED-KNOB), the web start path runs only catalog or ok composed recipes (api.ts:147-150), LedgerEntry keys are fixed by contract, and the canonical output is collision-free for keys. The gravest consequence the critics found (a billed call never counted against the caps) needs a provider to send an escaped lone surrogate in its model id. That is deterministic when it happens, but it depends on a malformed provider, the same condition the review's threat model already lists, so P3 rather than P2.

**Root cause.** Commit 54eed9e ('address the Milestone 0 adversarial review') added the well-formedness check only in serialize()'s string-value branch. Property names kept their own unchecked JSON.stringify(key) at index.ts:56, and sha256Hex encodes a lone surrogate as U+FFFD without complaint (sha256Hex('a\ud800b') === sha256Hex('a�b'), probe head_sha_collision). The test added in that commit (canonical.test.ts:57-60) covers values only. At the callers the deeper cause is that hashability is a precondition nobody establishes where untrusted text comes in. parseRecipe returns Recipes that recipeHash cannot hash. Ledger.verify assumes any parsed line is a hashable entry object. ModelGateway.record puts provider-reported labels into the hash-chained entry after the call was billed. For keys these callers held only because of the F19 laxity.


### Options


**O1. Review's repair alone: one checked string serializer for keys and values** (fixes root cause: partly; effort S; risk medium)

In packages/canonical/src/index.ts, send both string values and property names through one serializeString(s, where). Add key tests. Nothing else changes.


*Pros*
- Removes the RFC 8785 §3.2.2.2 breach in the library
- No well-formed output changes: all 18 CATALOG recipes and all 18 recipes/*.json keep their stored hash, and well-formed edge keys (astral pair, U+0000, U+FFFF, U+2028, a literal backslash-u, a decomposed e) serialize byte-identically (probe-revise: catalog_all_match, recipe_files_match, rev_edge_keys_identical)
- Smallest diff

*Cons*
- Turns three clean outcomes into uncaught throws. A lone-surrogate knob name in checkAnswer (today COMPOSED-KNOB) would throw out of composeRecipe. `byway hash` on such a file (today exit 0) would throw. Ledger.verify on a line tampered with a lone-surrogate key (today it returns the id) would throw.
- Leaves all three boundaries assuming hashability, including the provider-label path, which loses billed spend today
- Leaves sha256Hex lax


**O2. O1 plus typed CanonicalizationError catches at each hashing caller** (fixes root cause: partly; effort S; risk low)

Apply O1, then catch CanonicalizationError in checkAnswer (as a violation), the CLI (InputError), Ledger.verify (broken line), runner.start (refusal) and gateway.record (somehow ledger anyway).


*Pros*
- Fixes the library and every regression O1 causes
- No change to what parseRecipe accepts

*Cons*
- Five catch sites, and every future hashing caller (registry.ts:45, advisor.ts:129, derive.ts) must remember its own. This is the per-caller special-casing the design standard rejects
- In gateway.record a catch cannot recover: the entry still has to be written, so the label has to be fixed anyway
- A typed Recipe can still be unhashable


**O3. O1 + sha256Hex check + hashable-by-construction at the three untrusted text boundaries (recommended)** (fixes root cause: yes; effort S; risk low)

Apply O1, and make sha256Hex refuse ill-formed text. (a) parseRecipe establishes hashability with the hasher itself: after RecipeSchema.parse it calls recipeHash and turns a CanonicalizationError into a ZodError, so 'parsed means hashable' holds by construction and cannot drift from the canonicalizer. (b) Ledger.verify reports a line that is not a JSON object, or cannot be canonicalized, as broken in its own right, not by hash equality. (c) ModelGateway.record writes provider-reported labels (servedModel, upstreamProvider) with String.prototype.toWellFormed() and passes non-strings through unchanged, so a billed call can always be ledgered. No catch is added to compose.ts, cli/main.ts or runner/client.ts.


*Pros*
- Removes the wrong assumption at each place untrusted text comes in, and the library conforms (keys and sha256Hex)
- parseRecipe's rule is the canonicalizer's own rule, so there is no duplicated predicate and nothing to drift. Messages are well-formed by construction because canonical checks a name before walking its value and escapes it in the message (probe: rev_messages_wellformed, B_parse_nested)
- Existing error channels handle the case with no new code: checkAnswer turns ZodError into SCHEMA violations and a repair round, the CLI exits 2 via InputError, and runner.start refuses before a run exists
- Fixes pre-existing failures as consequences of the same rule, not as separate patches: the composer and `byway hash` throwing on a lone-surrogate value or title, verify() throwing on a tampered value or a null line, and billed calls lost to a malformed provider label
- No recipe hash, ledger entry, Temporal history or workflow bundle changes

*Cons*
- Narrows what byway.recipe/1 accepts. Only inputs that could never be hashed (values) or validated (keys, ST7) are affected, but it is a format rule worth an ADR
- A malformed provider label is recorded with U+FFFD in place of the lone surrogate. The exact original is still kept in the stored response text, under responseSha256
- CLI exit code for such files moves to 2 (validate was 1, hash was 0 or an uncaught throw). A lone-surrogate knob name is reported as SCHEMA at '(recipe)', not COMPOSED-KNOB
- parseRecipe now canonicalizes each recipe once more (negligible for recipe-sized input)


**O4. Boundary-only: guard the boundaries, leave @byway/canonical as is** (fixes root cause: no; effort S; risk low)

Apply O3(a)-(c) without the library change.


*Pros*
- Lowest regression risk; fixes the composer, CLI, verify and provider-label failures

*Cons*
- Does not fix F19: canonicalize still escapes lone-surrogate property names, which breaks RFC 8785 and the package's own contract
- parseRecipe's hash check would still accept ill-formed knob names, because the hasher accepts them


**O5. O3 without the provider-label part (provider-to-ledger boundary parked in the backlog)** (fixes root cause: partly; effort S; risk low)

The critics' fallback (b): fix the library, recipe parse and ledger read-back, and record the provider-label path as a backlog follow-up cross-referenced to F03.


*Pros*
- Smaller gateway diff, and no gateway behavior change in this cluster

*Cons*
- Leaves a reproduced, deterministic loss of billed spend (ENG-3) that has the same root cause and a three-line fix
- F03's proposed fail-closed admission on ledger-write failures would turn one malformed model id into a stop on all paid work


**O6. First-round O3: a raw pre-parse Unicode walk in parseRecipe** (fixes root cause: yes; effort S; risk low)

As O3, but parseRecipe walks the raw input with isWellFormed (merged into reservedKeyPaths) instead of asking the hasher.


*Pros*
- Structured zod paths for the issue; it runs before zod, so zod never sees ill-formed input

*Cons*
- Re-implements canonical's string rule in a second place and depends on zod rejecting everything else, so the guarantee holds only by listing cases and can drift (critic 2)
- Paths below an ill-formed key need explicit escaping, or raw lone surrogates leak into violation text (critic 2's nested case)
- Adds a second traversal that F02's depth bound must also cover


### Recommendation: O3

**Why.** F19 is a library defect, so the library must change (O1), and sha256Hex has the same flaw in the same package. The review's repair stops short, because three boundaries depend on 'this text can be hashed'. For recipe keys and for ledger lines with a tampered key, that held only because of the defect being fixed. For provider labels it already fails today and loses billed spend. O2 patches callers one by one and cannot really recover in gateway.record. O5 leaves a reproduced ENG-3 loss in place. O3 puts the guarantee at each place untrusted text comes in, using the canonicalizer itself as the single definition of 'hashable' wherever possible, so each downstream caller's existing error channel stays correct with no new code. It is the smallest design that removes the wrong assumption everywhere text enters a hashed record. It changes no valid hash, needs no migration, and does not touch the Temporal workflow bundle.

**Design.** 1) @byway/canonical (packages/canonical/src/index.ts). Add a private serializeString(s, where) that throws CanonicalizationError(`${where} contains a lone surrogate`) when !s.isWellFormed() and otherwise returns JSON.stringify(s). The string-value branch calls serializeString(value, `${path}: string`), so the message stays exactly as today. The object branch calls serializeString(key, `${path}: property name ${JSON.stringify(key)}`) BEFORE walking the value. The name is therefore escaped in the message, and every path handed down holds only names that passed the check, so every CanonicalizationError message is well-formed text (probe: an ill-formed name nested under an ill-formed name reports the outer one). sha256Hex(text) first throws CanonicalizationError('text to hash contains a lone surrogate, so it has no UTF-8 encoding') when !text.isWellFormed(). This mirrors store putText (artifacts.ts:87-88). No hash of well-formed text changes, and its only production callers pass canonical output or canonicalOrJson output, both well-formed by construction (canonical rejects lone surrogates, and the JSON.stringify fallback escapes them). Doc comments: 'strings, property names included, must be well-formed Unicode (RFC 8785 §3.2.2.2)'; 'sha256Hex hashes the UTF-8 encoding, so text must be well-formed'. The public API is otherwise unchanged.
2) @byway/recipe (packages/recipe/src/schema.ts, parseRecipe). Keep reservedKeyPaths and its order unchanged. After RecipeSchema.parse(input), call recipeHash(recipe). On CanonicalizationError, throw new z.ZodError([{ code:'custom', path:[], message:`the recipe cannot be hashed: ${e.message}`, input: undefined }]) (the same wording as validator ST3). Rethrow anything else, such as a RangeError on deep input, which is F02's. Document the invariant on parseRecipe: 'every Recipe returned can be hashed: recipeHash never throws on it'. Document on RecipeSchema: 'shape only; it neither reserves key names nor guarantees hashability; parse untrusted input with parseRecipe' (no external user of RecipeSchema/StepSchema/NodeSchema exists; grep). schema.ts imports recipeHash from hash.ts, and hash.ts imports only the Recipe type from schema.ts, so there is no runtime cycle. Validator ST3 'unhashable' stays as the guard for programmatically built recipes, such as the NaN test.
3) @byway/gateway Ledger.verify (packages/gateway/src/ledger.ts:270-280). After JSON.parse: if the value is null, not an object, or an array, return `line:${i+1}`. Otherwise compute expected = expectedHash(rest) through a local helper that returns undefined when entryHash throws CanonicalizationError and rethrows anything else. Return entry.id ?? `line:${i+1}` when expected === undefined OR seq, prevHash or hash mismatches. The undefined case is checked explicitly and never through hash equality, because a line whose hash field was removed would otherwise compare undefined === undefined and pass. Import CanonicalizationError from @byway/canonical (already a dependency).
4) @byway/gateway ModelGateway.record (gateway.ts:569-581). Add a module function providerLabel(v) that returns v.toWellFormed() for a string and v unchanged otherwise. A missing or non-string model keeps today's behavior: defined() drops undefined, and numbers are hashed as numbers. Inside record(), build the appended draft as { ...draft, servedModel: providerLabel(draft.servedModel), ...(draft.upstreamProvider !== undefined ? { upstreamProvider: providerLabel(draft.upstreamProvider) } : {}), requestSha256, responseSha256 }. Comment: provider JSON can carry a lone surrogate through a \u escape, and a billed call must still be ledgered (ENG-3), so the label is recorded with U+FFFD and the exact response is kept under responseSha256. record() is the single funnel every paid kind (completion, image, video) goes through, so future paid paths are covered too. Returned results keep the provider's label as reported, because nothing hashes them (the canonical caller list is recipes plus the gateway ledger and wire). Caller-supplied draft fields are not touched; see notDoing.
Data flow after the change. Model answer -> answerJson -> forceComposed -> parseRecipe -> ZodError -> SCHEMA violation at '(recipe)' -> repair round; withHash is never reached with unhashable input. CLI file -> decode/JSON.parse/checkStructure -> parseRecipe -> ZodError -> InputError -> exit 2. runner.start -> parseRecipe throws before a run row exists. Provider reply with an ill-formed label -> record() -> ledgered with U+FFFD; the response body is stored through canonicalOrJson's escaped fallback (probe-record: well-formed, keeps the escaped original); spend counts it. A damaged ledger line -> verify() returns its id or `line:n` and never throws for content. Evidence: C:/Users/arvik/AppData/Local/Temp/byway-review-verify/revise-I-r1/ (canonical-revised.ts, probe-revise.mts and probe-revise-results.json, probe-record.mts and probe-record-results.json), plus design-I/ from round one.


**Steps**
1. Test first, canonical (packages/canonical/test/canonical.test.ts). canonicalize({'\ud800':1}), ({'\udc00':1}), ({a:[{'x\udc00':1}]}) and ({'\udc00\ud800':1}) each throw CanonicalizationError whose message names the escaped key and passes isWellFormed(). ({'\ud800':{'x\udc00':'y\ud800'}}) reports the outer name. ({'😀':1}) === '{"😀":1}'. Fixed expected strings for keys U+0000, U+FFFF, U+2028, a literal backslash-u text and a decomposed e. sha256Hex('a\ud800b') throws CanonicalizationError, and the sha256Hex('abc') vector and the RFC §3.2.3 sorting vector are unchanged. Then implement serializeString and the sha256Hex check, and update the doc comments.
2. Test first, recipe (packages/recipe/test/recipe.test.ts). From c4 serialized to JSON text with "\ud800" in (a) a step knob name, (b) a knob value, (c) the title and (d) a knob name nested under an ill-formed name, parseRecipe throws ZodError with exactly one issue: code custom, path [], a message starting 'the recipe cannot be hashed: $.' that names the canonical path, and message.isWellFormed(). For every CATALOG recipe r, recipeHash(parseRecipe(JSON.parse(JSON.stringify(r)))) === r.hash. Add an invariant table test over adversarial inputs (lone surrogates in title, knob name, nested knob name, knob value, sitsOut reason and exceptions; a 1e400 knob; a reserved key): each either throws ZodError or returns r for which recipeHash(r) does not throw. Then implement the hash check in parseRecipe and the two doc comments.
3. Test first, ledger (packages/gateway/test/ledger.test.ts). Each case rewrites lines of a temp ledger: (1) purpose 'probe\ud800' as escape text returns the entry id (today it throws CanonicalizationError); (2) an added "\ud800" key returns the id (passes today; guards the canonical-only regression); (3) two entries, the LAST line with hash removed plus an ill-formed purpose, no .head file, returns e2's id (today it throws; the first-round helper returned null); (4) the same edit on the FIRST line returns e1's id (the first-round helper blamed e2); (5) a first line 'null' returns 'line:1' (today TypeError); (6) a costUsd of 1e400 returns the id. Implement the non-object guard and expectedHash in verify().
4. Test first, gateway (packages/gateway/test/gateway.test.ts). fakeAnthropic answers with anthropicMessage({ model: 'claude-opus-5-5\ud800' }). complete() resolves. The ledger line's servedModel is 'claude-opus-5-5�'. spend('ws-1') counts the entry's costUsd. verifyLedger() is null. The stored response text is well-formed, holds the escaped original, and entry.responseSha256 is sha256 of that text (today: GatewayError billed-not-ledgered, spend 0, nothing stored). A fake adapter (GatewayOptions.adapters) returning upstreamProvider 'x\ud800' is ledgered with 'x�'. A response body with a lone-surrogate KEY is ledgered, and its responseSha256 matches the stored fallback text. Implement providerLabel in record().
5. Test first, callers, with no production change expected (packages/advisor/test/compose.test.ts, packages/cli/test/cli.test.ts). checkAnswer on a lone-surrogate title, knob value and knob name each returns {draft, violations:[SCHEMA at '(recipe)' with 'the recipe cannot be hashed']}, with no recipe and no throw. composeRecipe with sequence(badAnswer, goodAnswer) ends ok after one repair, and the repair prompt's violations slot passes isWellFormed(). `hash` and `validate` on files whose JSON text holds "\ud800" in a knob name or in the title exit 2 with 'is not a valid recipe'. If any of these needs a change to compose.ts, main.ts or client.ts, stop: the boundary invariant is not holding.
6. Verify. Run pnpm vitest for canonical, recipe, validator, advisor, cli, gateway, catalog, runner and apps/web, plus the workspace typecheck. The catalog conformance test (catalog/test/conformance.test.ts) must pass with recipes/manifest.json and recipes/*.json unchanged (git diff --exit-code recipes/). The validator test 'NaN count is reported, not thrown' stays green. Compute WORKFLOW_HASH with buildWorkflows before and after and confirm it is identical, so retireStaleRuns retires no waiting run.
7. Docs. In docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md, canonical hashing section: add 'strings and property names holding a lone surrogate (RFC 8785 §3.2.2.2)' to the rejected inputs; note that sha256Hex refuses ill-formed text and that parseRecipe guarantees a hashable Recipe. Write the ADR below, with its number taken at merge (the next free number, 0081 at b33f1285, unless another cluster's ADR lands first), add it to docs/adr/README.md (table and record count), Decided by: Delegated. Add two docs/backlog.md 'Product follow-ups' entries cross-referenced to F03: (i) provider-reported usage and cost must be finite before the ledger draft (a JSON 1e400 token count makes append throw after billing), unless F03's merged design already covers it; (ii) Ledger.verify still throws on a damaged .head file (non-JSON, or seq < 1 reads raw[-1]), which breaks the same contract (found while revising; out of this text-validity scope).


**Acceptance tests**
- canonicalize({'\ud800':1}) throws CanonicalizationError (today it returns '{"\\ud800":1}')
- canonicalize({'\udc00':1}), ({a:[{'x\udc00':1}]}) and ({'\udc00\ud800':1}) each throw, and every message is well-formed and names the escaped key (today all succeed)
- canonicalize({'😀':1}) === '{"😀":1}'; edge keys U+0000, U+FFFF, U+2028, literal backslash-u and a decomposed e serialize as before; the RFC 8785 §3.2.3 vector is unchanged (guards)
- sha256Hex('a\ud800b') throws CanonicalizationError (today it equals sha256Hex('a�b')); sha256Hex('abc') keeps its vector
- recipes/manifest.json and every recipes/<id>.json are byte-identical, and every CATALOG recipe's recipeHash equals its stored hash (guard)
- parseRecipe on c4 with a knob name "\ud800" throws ZodError with one custom issue whose message is well-formed and names the property (today it parses and hashes)
- parseRecipe on c4 with title 'x\ud800' or a knob value 'v\ud800' throws ZodError (today it parses, and recipeHash then throws)
- For each adversarial input in the invariant table, parseRecipe either throws ZodError or returns a recipe that recipeHash hashes
- checkAnswer on lone-surrogate title, value and knob-name answers returns SCHEMA violations and no recipe, without throwing; composeRecipe(bad, good) is ok after one repair (today the title and value cases throw out of composeRecipe)
- `byway hash` on a file with a "\ud800" knob name exits 2 (today exit 0); on a lone-surrogate title it exits 2 (today an uncaught CanonicalizationError); `byway validate` on that file exits 2 (today exit 1, ST3)
- Ledger.verify returns the entry id for a tampered lone-surrogate value (today it throws) and for a tampered lone-surrogate key (today the same; regression guard)
- Ledger.verify returns e2's id when the last of two lines has its hash removed and an ill-formed purpose, with no head file (today it throws; the first-round helper returned null), and returns e1's id for the same edit on line 1
- Ledger.verify returns 'line:1' for a first line 'null' (today TypeError), and the entry id for costUsd 1e400
- complete() with a provider model 'claude-opus-5-5\ud800' succeeds, ledgers servedModel 'claude-opus-5-5�', counts the cost in spend(), and verifyLedger() is null (today it raises billed-not-ledgered with spend 0)
- An upstreamProvider 'x\ud800' is ledgered as 'x�'; a response body with a lone-surrogate key is ledgered, and responseSha256 matches the stored text
- validate() on a recipe with n = NaN still reports ST3 with recipeHash 'unhashable' (guard)
- WORKFLOW_HASH from buildWorkflows is identical before and after the change (guard: no waiting run is retired)


**Compatibility.** Recipe hashes are unchanged for every well-formed input. The patched serializer is byte-identical whenever names are well-formed: 18/18 CATALOG recipes and 18/18 recipes/*.json keep their stored hash, and well-formed edge keys serialize identically (probe-revise). The recipe files, the manifest, registry entries and runs.recipe_hash need no change. Temporal: no workflow code calls canonicalize, contentHash, parseRecipe or the gateway. runner/src/workflow and runner/src/types.ts import @byway/recipe for types only, and critic 2's bundle build found no canonical, recipe or zod code in it. WORKFLOW_HASH therefore stays the same, persisted histories replay identically, and retireStaleRuns retires nothing; the guard test pins this. The gateway changes run in activities only. Stored data: SQLite intakes keep composed results as loose JSON and never re-hash them. No ok:true composed recipe can hold ill-formed text: a value made withHash throw, a name failed ST7/COMPOSED-KNOB, and no registered knob type is object-valued. Ledger: no existing line's hash changes. New entries differ from today only when a provider sends an ill-formed label, which today cannot be written at all. verify() only becomes more robust on damaged lines. Wire evidence: a provider body with a lone-surrogate key now takes canonicalOrJson's JSON.stringify fallback, as lone-surrogate values already do. Its requestSha256/responseSha256 then address the exact stored text, not a canonical form, and that text depends on key order (probe-record: fallbackOrderDependent true). This is harmless because bodies are built in a deterministic order and stored under their own text, and the ADR records it. Contracts: no type changes. byway.recipe/1 is not bumped, because only inputs that could never be hashed or validated are newly refused. Behavior changes to note: CLI validate exits 2 instead of 1, and CLI hash exits 2 instead of 0 or an uncaught throw. A composer lone-surrogate knob name is SCHEMA at '(recipe)' instead of COMPOSED-KNOB. A malformed provider label is ledgered with U+FFFD. Results returned to callers keep the provider label as reported.

**ADR.** Yes, a short one, numbered at merge (next free; 0081 at b33f1285). Title: 'Hashed text is well-formed Unicode: canonical JSON checks property names, and recipe parse, ledger read-back and provider labels guarantee hashability'. Record: (1) RFC 8785 §3.2.2.2 conformance for property names and sha256Hex's refusal of ill-formed text, with no hash changes. (2) parseRecipe as the recipe boundary, with 'parsed means hashable' established by calling the hasher itself; per-caller catches and a re-implemented raw Unicode walk were considered and rejected (drift, path escaping). (3) Ledger.verify reporting non-object or uncanonicalizable lines as broken explicitly, never by hash equality. (4) Provider-reported ledger labels recorded with U+FFFD, because a billed call must be ledgered (ENG-3) and the exact response stays under responseSha256. (5) requestSha256/responseSha256 for bodies that fall back to plain JSON address the stored text, not a canonical form. (6) The CLI exit-code and composer violation-class changes. (7) The F03 hand-off for non-finite provider usage. Provenance: external review F19 (byway_review/byway-review.md); the two verifier passes (composer and CLI regressions); design round one (Ledger.verify regression); critique round (the provider-label boundary, the verify missing-hash hole, sha256Hex, the null line, drift). Decided by: Delegated. It affirms ADR-0059 and supersedes nothing.


**Deliberately not doing**
- No CanonicalizationError catches in advisor checkAnswer, the CLI or runner.start: parseRecipe makes them unreachable. Validator ST3 stays only as the guard for programmatically built recipes
- No raw pre-parse Unicode walk in parseRecipe (the first-round design): asking recipeHash keeps one definition of 'hashable' and adds no traversal for F02 to bound. reservedKeyPaths stays the only pre-parse walk, and F02 extends it
- No merging of zod issues with Unicode issues in one round: zod runs first and the hash check runs on zod-valid output, so a doubly broken answer costs at most one extra round, which composeRecipe's two repairs absorb. Zod's own 'Unrecognized key' message can echo an ill-formed unknown key (probe zod_unknown_key_message). That is pre-existing and cosmetic, since every consumer serializes violations as JSON or sends them as an escaped request body, so it is left as is
- No unexporting of RecipeSchema/StepSchema/NodeSchema: there is no external user, and parseRecipe is already the boundary for reserved names; a doc comment states it
- No validation of caller-supplied ledger fields (workspaceId, purpose, runId, stepId, requestedModel, prompt.id): they are Byway-internal (purpose templates with enum media, recipe Ids limited to [a-z0-9-], UUID run ids, profile config), not an untrusted boundary
- No numeric checks on provider usage or cost (a JSON 1e400 token count): accounting-value validity belongs to F03 and is handed off through a backlog entry
- No fix for Ledger.verify throwing on a damaged .head file: a different assumption (the head is trusted), parked in the backlog next to F03
- No depth or size limits: that is F02, and a RangeError from deep input is rethrown as today
- No third-party JCS dependency (common JS implementations also write keys with JSON.stringify) and no Unicode normalization (RFC 8785 does not normalize, and it would change hashes)
- No byway.recipe/2 schema bump and no migration of intakes, runs, ledger or artifacts
- No change to returned GatewayResult.servedModel: only the hashed ledger copy needs to be well-formed


**How it resolves each finding**
- **F19:** Fixed at the root by O3. (1) @byway/canonical sends property names and string values through one checked serializeString. The name is checked before its value is walked and escaped in the message, so lone-surrogate keys are rejected at the root and nested, high and low, as RFC 8785 §3.2.2.2 requires, with no change to any well-formed output or catalog hash. sha256Hex refuses text that has no UTF-8 encoding. (2) parseRecipe guarantees every Recipe it returns can be hashed by calling recipeHash and turning a CanonicalizationError into a ZodError. The composer (SCHEMA plus a repair round), `byway hash`/`validate` (exit 2) and runner.start (refusal before a run exists) are then correct through their existing handling, and their pre-existing crashes on lone-surrogate values are fixed too. (3) Ledger.verify reports a non-object or uncanonicalizable stored line as broken explicitly, which closes the missing-hash hole the critique found and the null-line TypeError. (4) ModelGateway.record writes provider-reported labels with toWellFormed(), so a billed call whose model id carries an escaped lone surrogate is ledgered and counted (today: billed-not-ledgered, spend 0). The review's acceptance criteria are covered, plus the caller, ledger and gateway tests from the verifiers and both critique lenses. A short ADR records the rule. The numeric twin goes to F03.


**Changes forced by the adversarial rounds (last round)**
- ACCEPTED (critic 1 mustFix 1; critic 2 shouldConsider on the null line): the first-round Ledger.verify helper let a damaged line pass. Reproduced in revise-I-r1/probe-revise.mts: with the last of two lines missing its hash and holding purpose 'p\ud800', the first-round helper returns null (intact), and on line 1 it blames e2. The revised verify returns `line:n` for a non-object line and treats an uncanonicalizable line as broken explicitly (expected === undefined), never through hash equality. It now returns e2 and e1 respectively, and 'line:1' for a null line (today TypeError). The 'an undefined hash never equals the stored hash' sentence is removed, and acceptance tests for the last-line, first-line, null and 1e400 cases are added.
- ACCEPTED, option (a) (critic 1 mustFix 2, critic 2 mustFix): the provider-to-ledger boundary carries the same wrong assumption. Reproduced end to end at HEAD: a fakeAnthropic reply with model 'claude-opus-5-5\ud800' makes complete() raise 'answered and billed ... could not be written to the ledger', with spend 0 and no stored bodies; Ledger.append throws for servedModel and for upstreamProvider. Folded in as providerLabel() inside ModelGateway.record, the single funnel for every paid kind. Non-strings pass through, so a missing model keeps today's behavior; the probe confirmed that toWellFormed on undefined would otherwise throw, a regression I avoided. The cluster root cause is restated as three boundaries (recipe input, ledger read-back, provider labels into the ledger), so 'yes' for O3 is claimed only for that text-validity root cause. The numeric twin (1e400 usage) is handed to F03 through a backlog entry. Critic option (b) is kept as O5 for comparison and rejected.
- ACCEPTED (critic 1 shouldConsider): sha256Hex now refuses ill-formed text. Probe: today sha256Hex('a\ud800b') === sha256Hex('a�b'); the revised version throws, and the 'abc' vector is unchanged. Its production inputs are well-formed by construction (canonical output, or canonicalOrJson's escaped fallback; probe-record shows both well-formed), so the billed record() path gets no new failure.
- CHANGED THE DESIGN (critic 2 drift concern, which also covers critic 2's path-escaping point and critic 1's issue-merging point): the first-round raw Unicode walk is replaced by a hash check inside parseRecipe that calls recipeHash and turns a CanonicalizationError into a ZodError. The canonicalizer is now the single definition of 'hashable', so nothing can drift. Because canonical checks a name before walking its value and escapes it in the message, no raw lone surrogate reaches violation text: probe B_parse_nested reports the outer name with a well-formed message. With no new pre-parse walk, issue ordering stays zod-first exactly as today. Trade-off accepted: the issue path is [] (shown as '(recipe)') and the canonical path is in the message, the same form validator ST3 uses.
- PARTLY ACCEPTED (critic 1 shouldConsider on schema exports): RecipeSchema, StepSchema and NodeSchema stay exported (grep: no user outside schema.ts), and a doc comment states they check shape only, with parseRecipe as the boundary, which matches the existing reserved-key rule. Moving the check into the schema would leave Step and Node schemas uncovered, and unexporting changes the public surface for no caller.
- ACCEPTED (critic 1 shouldConsider): the ADR records that requestSha256/responseSha256 for bodies that fall back to plain JSON address the exact stored text, not a canonical form, and that this text depends on key order (probe-record fallbackOrderDependent true). This was already true for lone-surrogate values and is now also true for keys.
- ACCEPTED (both critics): the ADR number is taken at merge (next free; 0081 at b33f1285), docs/adr/README.md gets its table row and count updated, and Decided by is Delegated.
- ACCEPTED (critic 2 shouldConsider): the WORKFLOW_HASH guard is added to compatibility and acceptance. Workflow code and runner types import @byway/recipe for types only (my grep), critic 2's bundle build contains no canonical, recipe or zod code, and the gateway changes run in activities, so retireStaleRuns retires no waiting run. The distinction between replay determinism and bundle-hash retirement is now stated explicitly.
- ACCEPTED (critic 2 shouldConsider on F02/F01): there is no new pre-parse walk. reservedKeyPaths stays the only one for F02 to bound, and a RangeError on deep input is still rethrown (F02's). F01's compiled-plan admission must keep going through parseRecipe, which is noted in the ADR.
- ACCEPTED (critic 2 shouldConsider): the test run widens to runner and apps/web, plus the typecheck and `git diff --exit-code recipes/`. Effort stays S.
- ADDED (found while revising, parked rather than folded in): Ledger.verify also throws on a damaged .head file. readHead rethrows a SyntaxError, and a head seq < 1 parses raw[-1]. That is a different assumption (the head is trusted), so it goes to a backlog entry next to F03 and is not part of this cluster.
- NO CHANGE NEEDED (critic confirmations): catalog and recipe-file hashes unchanged, the patched serializer's behavior, zod 4.6.5 rejecting Infinity and NaN, no object-valued knob types, and memo keys using JSON.stringify. All are consistent with my probes (probe-revise: catalog_all_match, recipe_files_match, rev_edge_keys_identical true). git status in the repo stayed clean throughout.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- Non-blocking overclaim: the design's data-flow line says 'A damaged ledger line -> verify() returns its id or line:n and never throws for content'. A line nested very deeply (for example 20,000 nested arrays in purpose) still makes verify() throw 'RangeError: Maximum call stack size exceeded', in today's code and in the revised helper alike (probe-results.json verify.deep). A damaged .head file also still throws, and the design parks that in the backlog.
- Residual corner in providerLabel: only string labels are normalized. Non-strings pass through, and adapters copy res.model, msg.model and res.modelVersion with no type check (openai.ts:100, anthropic.ts:113, google.ts:56). So a malformed provider that sends model as an array or object holding a lone-surrogate string (or 1e400) would still make entryHash throw and leave the billed call unledgered.
- Wording in an acceptance test: '`byway validate` on that file exits 2 (today exit 1, ST3)' holds for the lone-surrogate title file. For the lone-surrogate knob-name file, today's validate fails with ST7, not ST3 (probe-validate.mts output: knob -> ['ST7'] with a real hash; title -> ['ST3'], unhashable).
- The pro 'messages are well-formed by construction' covers canonical-derived messages only. zod's own 'Unrecognized key' message still echoes a raw lone surrogate (probe case_unknownKeyIll: wf=false) into checkAnswer violations and the repair prompt's violations slot.


## Cluster R: Release/maintenance actions and research prerequisites

**Root cause.** Byway writes its release-level guarantees in prose but never ties each one to an executable check that runs on its own at the boundary it describes. Examples:
- 'a CI check enforces...' (spec §4/§6, ADR-0059, CR14);
- 'merge only when tests and typecheck pass' (ADR-0068);
- 'one file to back up' (ADR-0066);
- 'WCAG 2.2 AA' (spec :151);
- 'External seed strings untested' (map GAPS);
- 'Accepted' over 'Proposed, not decided' (ADR-0041);
- 'degrades to Historical' (contracts/advisor.ts:49).

Where a mechanism exists, it lives in something the person making a change controls or forgets:
- double-submit protection is the DOM `disabled` attribute, copied component by component;
- record relations are optional prose verbs;
- a proposed CR14 manifest could be regenerated by the editor;
- the unit suite needs a Chromium that only the developer's machine has.

Corrections and summaries carry no structured link back to the authoritative record. The results:
- promised checks run on the honour system (R1);
- the backup claim was never exercised and is wrong (R4);
- interaction-level accessibility is asserted only through static markup (R5);
- records and protocol summaries drift silently (R3, RS);
- no step would derive distribution obligations from what is actually shipped (R2).

The shared correction is one repo-owned verification gate that CI runs on every change, on a provisioned and pinned toolchain. Each guarantee gets one acceptance check at its real boundary, anchored in something the editor cannot regenerate: git history, structured header relations, or a shared UI primitive guarded against regression. Stale prose gets structured back-links and correction-log entries rather than rewrites.


### R1: Verification is not repeatable in CI; toolchain not pinned

- **Verdict:** ACCEPT_PARTLY · **Severity:** P3 (review: unrated (release action, separate from F01-F20)) · **Label:** process / release-engineering

**Rationale.** Confirmed. At b33f1285 there is no tracked CI: git ls-files shows no .github or pipeline files, git log --all -- .github is empty, no hooks are installed, and recent work lands directly on main (b33f128). The repo's own accepted documents assume a CI that does not exist:
- spec :145 and :170 ('a CI check scans apps/web', 'a CI check enforces the import boundary');
- ADR-0059 lists 'A CI import check in product code' under When: Now;
- ADR-0057 (CR14): 'CI fails any edit to their Context or Decision sections';
- ADR-0068 merges 'only when all tests and the typecheck pass'.
The checks exist as vitest guards (apps/web/test/guard-boundaries.test.ts, guard-claims.test.ts) but run only when someone runs pnpm test.

Two facts sharpen the finding:
- `pnpm test` itself needs provisioned tools. packages/runner/test/pages.test.ts:15-17 and cards.test.ts:8-11 launch real Playwright Chromium (pages.ts:241-243) with no skip guard. The harness downloads the Temporal CLI on first start. So README:95's 'no network' line is wrong.
- The repo has never run on Linux: the POSIX branches in dev-server.real.test.ts (ps/lsof), serve.ts and e2e.ts are unexercised.

Down-scoped in three places:
1. Dependencies are already pinned by pnpm-lock.yaml (frozen install); the app and runner manifests are exact, while root devDependencies use carets resolved by the lock. Only Node, pnpm, the runner images, Chromium and the Temporal CLI are unpinned or provisioned by hand.
2. 'No lint' is literally true, but strict tsconfig plus the guard tests are the spec's linters.
3. The teardown diagnostics are intended. GracefulShutdownPeriodExpiredError is the expected ENG-10 outcome, caught deliberately (worker.ts:103-119). The rest is Temporal dev-server restart noise in parallel runs.

**Severity rationale.** This is not a runtime defect. It is a bounded standards gap against the repo's own accepted commitments: ADR-0059 Now, CR14's ADR CI, the spec's CI checks and the ADR-0068 merge gate are all honour-system today. It stays below P2 because the checks exist and pass when someone runs them on a provisioned machine.

**Root cause.** Verification exists only as documented local commands. Nothing runs them on change, so every 'CI check' the spec and ADRs rely on is enforced by memory. The prerequisites those commands need (Node, pnpm, runner OS, Chromium for the unit suite, the Temporal CLI) are written as minimums or manual steps, not provisioned, pinned inputs.


### R2: Third-party licence decisions not recorded before distribution

- **Verdict:** ACCEPT_PARTLY · **Severity:** none (review: unrated (release action; the review itself says private local use is not a violation)) · **Label:** release-hygiene / third-party licensing

**Rationale.** The facts hold:
- @img/sharp-win32-x64 0.35.5 is 'Apache-2.0 AND LGPL-3.0-or-later'.
- lightningcss and lightningcss-win32-x64-msvc 1.33.0 are MPL-2.0.
- unionfs 4.6.0 has no license field but ships an Unlicense LICENSE.
- No licence or notice record is tracked.

The framing over-includes:
- lightningcss is dev-only (pnpm why -r --prod is empty; it arrives through vitest and vite).
- sharp is only next@16.3.8's lazily loaded optional image optimizer, and byway never imports next/image.

The inventory also misses:
- caniuse-lite (CC-BY-4.0, a production dependency);
- the LGPL and MPL-1.1 libraries bundled inside sharp's binary;
- the runtime-downloaded Temporal CLI and Playwright Chromium;
- the missing root LICENSE despite package.json 'Apache-2.0'.

Nothing is distributed today. The repo is private (ADR-0060), install is from source, and the product's distribution form is an open decision.

**Severity rationale.** No conveyance means no obligation and no defect today. It becomes actionable only when a distribution is created: a packaged product build (undecided) or the ADR-0056/0059 replication kit.

**Root cause.** No step derives licence and notice obligations from the thing actually distributed, because no distribution step exists yet. npm metadata alone also understates bundled native libraries and misses binaries downloaded at runtime.


### R3: Decision records and protocol summaries drift from the authoritative record without pointers

- **Verdict:** ACCEPT · **Severity:** P3 (review: unrated (release action)) · **Label:** documentation / decision-record hygiene

**Rationale.** Every claim is confirmed.
- ADR-0041:5 says Accepted, while :17 says 'Proposed, not decided.', :31 says 'awaiting approval' and :60 says 'User to confirm'. Four product documents cite 'ADR-0041 rule 3'.
- The history table in docs/adr/README.md has rows that ADR-0061 or ADR-0064 settled, with no outcome pointers.

More instances of the same root cause:
(a) ADR-0080 'corrects', 'replaces' and 'extends' ADR-0074, 0072 and 0079, and none of them links back.
(b) ADR-0077 rescales the rank threshold that ADR-0071's Decision applies, and ADR-0079 (LABEL-2) replaces ADR-0071's note for 1-2 references. ADR-0071 links to neither: grep finds ADR-0077 only in itself and the README. No prose verb marks either relation; a scan for corrects/replaces/supersedes/extends/amends/narrows matches only ADR-0080. Product ADRs 0064-0080 also have no Related row (63 of 80 records have one).
(c) Root README:110 says the product ADRs are 'ADR-0064 to ADR-0072'; they now run to 0080.
(d) The blanket seed claim also appears at protocol/04:200, 04:221 and README:130.

CR14's own guarantee is untested. A git-history probe shows that none of the 73 Accepted records has had its Context or Decision changed since the commit where it first read Accepted. The guarantee holds today only because nobody has edited them. The index status columns are accurate for all 80 records.

**Severity rationale.** Documentation only, with no runtime effect. It is still a standards defect against the log's own rules (README:7, :10) and against CR14's append-only CI, which does not run. Product documents also cite a rule whose source text reads as unapproved.

**Root cause.** The ADR log has a rule for replacing decisions (write a new ADR) but no structured, checked relation between a record and the records that change it. It also has no rule for finalising a Proposed record's Decision text on acceptance, and CR14's append-only check is not implemented. So corrections land only in the new record, old text keeps reading as current, prose relation verbs are optional and inconsistent (0077 and 0079 use none), and hand-maintained summaries carry no link to their source.


### R4: No defined backup unit or tested recovery; partial restores fail silently

- **Verdict:** ACCEPT · **Severity:** P3 (review: unrated (release action; 'not a demonstrated incident')) · **Label:** operational-resilience / backup-recovery

**Rationale.** Confirmed, with corrections. Nothing documents a procedure. The only guidance, ADR-0066:26 'one file to back up' (in its Consequences), is wrong: with the store open, a copy of byway.sqlite alone has no tables because commits sit in byway.sqlite-wal (probe P3). The persisted set is larger than the review lists: it adds exposure.jsonl (the CR12 register), ledger.jsonl.head and the WAL/SHM sidecars.

Partial-restore behaviour:
- Store ahead of Temporal: designed and tested. OPS-1 fails the run plainly (lost-runs.ts, called at dev-engine.ts:106).
- Missing or rolled-back ledger: spend resets to 0 or an older value, and calls over the cap are admitted (probe P1; probe P5 shows the store's run cost of $0.42 against a ledger of $0). verifyLedger() returns null on a missing file and has no production caller.
- Missing artifact files: found only on read.
- Store older than Temporal: unhandled. retireStaleRuns lists open workflows but never checks that the store has the run.
- Temporal ahead of the store on the same run: the workflow waits on a checkpoint the store lacks and hangs silently.

reconcileLostRuns scans only the default workspace. That is not a gap in v1, because the Store contract has no createWorkspace or listWorkspaces. No incident was shown.

**Severity rationale.** It triggers only on the owner's own backup or restore. The money-loss path (caps reset after a restore) is the same fail-open accounting that F03 (P1) owns. What remains is a documentation and test gap plus a wrong accepted statement. It would rise to P2 if the product told users how to back up without stating the ledger caveat, so the README section in this design carries that caveat until F03 lands.

**Root cause.** Authoritative state is split across independently written stores: SQLite in WAL mode, CAS files referenced from SQLite, a JSONL ledger plus its .head, the exposure register, and Temporal's SQLite. Nothing defines which set of files, taken in which state, is a backup. The one written statement is wrong and was never exercised. Startup reconciliation covers only the store-ahead-of-Temporal direction, and the ledger treats a missing file as zero spend.


### R5: Interactive accessibility is asserted by static markup only

- **Verdict:** ACCEPT · **Severity:** P3 (review: unrated (release action)) · **Label:** accessibility / test-coverage

**Rationale.** Confirmed with probes. The ARIA work is real, but the tests are static (renderToStaticMarkup, pure functions, e2e that only click, check and fill). There are no keyboard.press calls, no toBeFocused assertions and no accessibility-tree assertions.

The browser probes reproduce the transition gaps:
(1) A focused control that disables itself drops focus to BODY. This is wider than the four panels:
- TurnFooter.tsx:35, ConfirmPanel.tsx:40-43 and ComparePanel.tsx:88 while busy;
- SelectPanel.tsx:54-57, where 'Choose all' and 'Clear' disable themselves when activated, with no busy state involved;
- StartForm.tsx:207;
- RecommendationView.tsx:428, the paid 'Start with $X' button;
- the Examples file input while adding.
On StartForm and RecommendationView, `disabled` is also the only double-submit guard: start() and submit() have no in-flight check, and run start has no server-side idempotency (client.ts:68-93 mints a fresh id per call). RunScreen's controls already use aria-disabled with a pending guard (RunScreen.tsx:112-113, 168-186), but nothing shared carries that pattern.
(2) Closing StepDetail with no question open leaves focus on BODY.
(3) A typed draft is lost when a step is opened (F06).
(4) F07's empty link fails WCAG 2.4.4/4.1.2.

New, beyond R5's wording: the C1 compare decision view renders both pages aria-hidden, tabindex=-1 and clipped, with no Open link (ScaledPage's interactive prop is never set). That belongs with F13.

**Severity rationale.** As an action this is test coverage against the spec's WCAG 2.2 AA commitment (spec :151). The defects it surfaces are owned elsewhere (F06, F07, F13, F05) or are focus-loss regressions softened by Chromium's sequential-focus starting point. The compare-view exposure gap should be weighed as P2 under F13.

**Root cause.** Accessibility is built into components as static attributes, and nothing exercises state transitions in a real browser with the keyboard. 'An action in flight' has no shared owner. Each component implements busy and unavailable states on its own, mostly by handing both focus behaviour and double-submit protection to the DOM `disabled` attribute. So the correct pattern (RunScreen's aria-disabled plus guard) was not reused, and nothing stops `disabled` from coming back.


### RS: Research prerequisites and the blanket 'external seed strings untested' wording

- **Verdict:** ACCEPT_PARTLY · **Severity:** P3 (review: unrated (research prerequisites, explicitly not product defects)) · **Label:** documentation-accuracy / research prerequisites

**Rationale.** The factual claims hold.
- Seed wording: map:675 GAPS ('External seed strings untested'), map:393, protocol/04:221 ('No test of external seed strings'), 04:200 and README:130 all say external seeds are untested. SSoT v3 §5.1.2 and Appendix D.6 do test external randomness (seed injection and tool calls), and model-written strings generally did better on the model and benchmark tested there. 01-blocks.md:97 already has the narrow wording but omits D.6.
- The study draft is unregistered.
- The recipe hash covers only recipe JSON.
- STUDY_REGISTRY is empty.
- labelFor ignores expires, although contracts/advisor.ts:49 promises degradation to 'Historical', a verdict its union cannot represent.

The finding is down-scoped because the activation requirements restate accepted charter ADRs (0041, 0054, 0055) and existing backlog items, and they are inert while the registry is empty and the research track is parked. The current repo action is the wording correction, made through the protocol's own Corrections log. It also bears on a live product choice: spec §3.3 injects a runner-generated string (model-step.ts:30), which is D.6's Seed Injection form.

**Severity rationale.** The wording is false against the cited source and appears on several summary surfaces. That is a bounded documentation defect, so P3. The activation requirements are severity none today, because every label reads Untested.

**Root cause.** Summary surfaces (map GAPS and SEED evidence, 04's findings and gaps, the README prescription list) compress the block prose into slogans. They have no link back to the corrected text or to the protocol's Corrections log, so the earlier correction at 01-blocks:97 never reached them. Separately, contract comments promise registry behaviour (expiry degradation) that no code or test enforces.


### Options


**A. Review's repair as five separate release actions** (fixes root cause: partly; effort L; risk low)

Do each action as the review words it:
- add a CI pipeline;
- record third-party licence decisions now;
- write a current-status decision map and supersession pointers;
- narrow the map wording;
- document and test a recovery procedure;
- add keyboard and screen-reader checks.
Each is scoped and delivered on its own.


*Pros*
- Maps one-to-one onto the review, so it is easy to audit as closed
- Each item can be scheduled independently
- CI and the a11y and recovery tests remove the honour-system gap for those items

*Cons*
- Five parallel efforts with no shared gate. A new 'current-status map' is one more hand-maintained summary, which recreates R3's root cause.
- Licence decisions come before any distribution form is chosen. lightningcss (dev-only) and unused sharp would get obligations they may never carry.
- It misses the instances the review missed: the 0071<-0077/0079 and 0074/0072/0079<-0080 back-links, the 04:200/README seed wording, the exposure.jsonl and .head sidecars, the store-older-than-Temporal direction, and the self-disabling Start buttons.
- The teardown wording ('do not make a passing suite silent') invites work on intended ENG-10 output.


**B. One provisioned release gate with history- and structure-anchored boundary checks, shared UI primitive, back-links instead of rewrites** (fixes root cause: yes; effort L; risk low)

Add a single repo-owned `pnpm verify` (typecheck, unit/guard tests, e2e).
- CI runs it on a pinned runner image, Node and pnpm, with Chromium and the Temporal CLI provisioned for every job that runs tests: Linux on every push and PR, Windows nightly, on PRs and on demand.
- Records: ADR checks with a structured Changes header row and reciprocal Later records, plus CR14 enforced against git history rather than a regenerable manifest.
- Backup: a defined backup unit, a read-only startup data-dir report that includes a ledger-behind-store check, and a two-way store/engine reconcile in lost-runs.ts.
- UI: one shared useAction/ActionButton primitive with a synchronous in-flight guard, a guard test that forbids `disabled=` outside a reviewed allowlist, focus return to the opener, and a keyboard e2e spec.
- Cross-cluster acceptance cases are suite-enforced expected failures.
- Seed wording is corrected through protocol/04's Corrections log.
- Licence and research-registry prerequisites become tracked gates on the steps that would create them.


*Pros*
- Removes the honour-system assumption at once. ADR-0059 Now, CR14 ADR CI, the spec's CI checks and the ADR-0068 merge gate all become one green or red check that runs on a machine that has every prerequisite.
- CR14 is enforced against git history, which the editor cannot regenerate, and record relations are structured and reciprocal, so drift is caught without rewriting history.
- One UI primitive plus a regression guard fixes every self-disabling control (including the paid Start button) and keeps double-submit protection, instead of patching four panels.
- No workflow code, schema, recipe-hash or contract-type changes: replay-safe, no migration.
- Respects scope: no pnpm self-download imposed on users, nothing built for undecided distribution or the parked research track.

*Cons*
- Needs the user to enable branch protection (no force-push, required check) and Actions minutes on the private remote before CI can block merges and before the history check is tamper-proof. This is an admin item for the playbook.
- The first Linux run will surface POSIX-path issues never exercised (ps/lsof, process killing). Bringing the repo up on Linux is budgeted inside L.
- Ubuntu 24.04 restricts unprivileged user namespaces, which will interact with F18's Chromium sandbox fix.
- Some acceptance cases pass only once F03, F05, F06, F07 and F13 land. Until then they are expected failures.
- Two new pieces of repo tooling to maintain: the ADR-records test and the disabled-attribute guard.


**C. Docs and backlog only, plus a local pre-push script** (fixes root cause: no; effort S; risk low)

Correct the prose:
- a new ADR noting ADR-0041 and correcting ADR-0066;
- the map, 04 and README seed wording;
- a README backup procedure;
- history-table pointers.
Add a documented `pnpm verify` and an opt-in pre-push hook. Log CI, a11y testing and licences in the backlog.


*Pros*
- Small, fast and zero runtime risk
- Fixes the false statements readers hit today

*Cons*
- Every check stays honour-system. A local hook is opt-in and bypassable, and agents committing to main skip it.
- No test exercises restore or keyboard transitions, so R4 and R5 persist and drift recurs.
- CR14's 'CI fails any edit' and ADR-0059's 'Now' stay unmet.


**D. Full release-engineering platform** (fixes root cause: yes; effort XL; risk medium)

Build the full set:
- CI with e2e on Linux, Windows and macOS on every push;
- SBOM and licence scanning;
- an online backup/restore CLI (VACUUM INTO, manifests, generation markers, ledger head anchored outside the data dir);
- axe and Lighthouse on the app and on generated pages;
- a generated decisions site;
- the research registry's scope tuple, Historical verdict and snapshot binding, now.


*Pros*
- Maximal coverage and evidence
- Ready for distribution and research activation

*Cons*
- Speculative: nothing is distributed, the product form is undecided, the registry is intentionally empty and the research track is parked.
- axe on generated artifacts as a product check would expose a Study 1 G2 guardrail instrument (CR12/ADR-0055).
- Online backup and anchoring machinery exceeds a local single-user app's needs and overlaps F03.
- High CI cost on a private repo (macOS and Windows minutes on every push) and a large maintenance surface.


### Recommendation: B

**Why.** B is the only option that removes the shared wrong assumption (a guarantee written in prose is enforced) where that assumption lives:
- the missing automatic gate;
- checks anchored in artifacts the editor controls (a regenerable manifest, optional prose verbs, per-component `disabled`);
- missing prerequisites (Chromium for the unit suite).

It stays inside the product's real scope. It is local and single-user, adds no services, changes no schema or workflow code, and imposes no pnpm self-download or lockfile change on users. It builds nothing for undecided distribution or the parked research track.

It honours append-only ADR history. CR14 becomes a check against git history, and corrections are structured Changes rows plus appended Later records. It also fixes, through the same mechanisms, the instances the review and the first design missed:
- 0071<-0077/0079;
- the 04:200 seed wording;
- the self-disabling Start and bulk buttons;
- the ledger-missing partial restore.

A creates another drifting summary and premature licence decisions. C leaves everything honour-system. D overbuilds and risks exposure under CR12.

**Design.** 1. Release gate (R1)
- Root package.json: add the script `verify` = `pnpm -s typecheck && pnpm test && pnpm e2e`.
- Do not add `packageManager` or `devEngines.packageManager`. pnpm 11 removed packageManagerStrict(Version). With its default pmOnFail=download it would download and run the pinned pnpm for every user and write a packageManagerDependencies document into pnpm-lock.yaml (installed pnpm 11.12.0 CHANGELOG :983-992, :317, :1037-1039). That changes users' installs and the lockfile without improving what verification proves.
- The verified toolchain is pinned where verification runs. New `.node-version` 24.13.1, read by setup-node and ignored by pnpm. pnpm is pinned by `pnpm/action-setup` `version: 11.12.0` in the workflow, and runner images by explicit labels (ubuntu-24.04, windows-2025), not -latest.
- engines stays >=24. README keeps 'Node 24+ and pnpm 11+' and adds 'CI verifies with Node 24.13.1 and pnpm 11.12.0 on Linux for every change and on Windows nightly'.
- New `.github/workflows/verify.yml`:
  - Triggers: push to main, pull_request, nightly schedule, workflow_dispatch. `permissions: contents: read`, no secrets (e2e already sets stand-in keys and checks they never leak). `concurrency: {group: verify-${{ github.ref }}, cancel-in-progress: true}`.
  - No path filters: catalog tests read protocol/03-configurations.md and the ADR checks read docs/adr, so docs-only pushes must run too.
  - Job `linux` (ubuntu-24.04, every trigger): checkout with `fetch-depth: 0` (the ADR history check needs full history), setup-node from .node-version, pnpm 11.12.0, `pnpm install --frozen-lockfile`, then `pnpm --filter @byway/runner exec playwright install --with-deps chromium`. Chromium is installed in every job that runs tests, because pages.test.ts and cards.test.ts launch real Chromium inside `pnpm test`. Then `pnpm verify`.
  - Cache the Playwright browser folder keyed on the exact playwright version (1.63.0) and OS, and the Temporal CLI download keyed on @temporalio/testing's version.
  - Job `windows` (windows-2025, same steps with `playwright install chromium`, running `pnpm verify` including e2e): runs on schedule, pull_request and workflow_dispatch, not on every push to main, because Windows minutes bill 2x and agents push often. Promoting it to every push is a playbook/admin call once measured minutes are known. No macOS leg.
- Bring-up budget: the first green Linux run is the acceptance criterion. Fixes to never-exercised POSIX paths (dev-server.real.test.ts ps/lsof, process-tree kills in serve.ts and e2e.ts) are part of this work.
- Expected diagnostics are not filtered. A comment beside the ENG-10 test says its GracefulShutdownPeriodExpiredError line is intended.
- README:95 corrected: the unit run needs Playwright's Chromium and downloads the Temporal CLI once. It makes no model or provider calls and uses no real keys.
- ADR-0068's merge gate is restated as 'pnpm verify passes and CI is green'.
- No test that asserts the YAML's text (circular). Acceptance is a green first run plus a deliberate red probe.
- Ubuntu 24.04 restricts unprivileged user namespaces. When F18 enables the Chromium OS sandbox, the Linux job provisions a sandbox-capable setup (AppArmor userns sysctl or a suitable image) instead of a global --no-sandbox.

2. ADR-record checks (R3, CR14): scripts/test/adr-records.test.ts. scripts/test is added to the vitest include and to scripts/tsconfig.json. Checks:
(a) Each header's leading Status word (Accepted or Proposed; Superseded allowed for the future) equals its index row, and the README count line matches the files.
(b) Structured relations replace prose verbs.
  - New header row `| **Changes** | [ADR-0074](...) corrects; [ADR-0072](...) extends |` with a closed verb set: corrects, replaces, supersedes, extends, narrows, amends, annotates.
  - Required on every ADR numbered after 0080 ('None' allowed).
  - Each Changes entry must match exactly one entry in the target's appended `## Later records` section ('ADR-NNNN <verb> this record: <one line>'), and every Later records entry must match a Changes entry (a bijection).
  - A Decision that uses a relation verb with an ADR number but has no matching Changes entry fails, and the message asks for the row. The regex only prompts for structure; it is not the relation.
(c) An Accepted ADR whose Decision opens with proposal-only wording needs an `annotates` Later records entry.
(d) CR14 against history, with no regenerable manifest.
  - For every ADR that has ever read Accepted, the Context and Decision text at HEAD must equal the text at the first commit where its Status row read Accepted (git log --follow, LF-normalised per .gitattributes).
  - Today all 73 Accepted records pass with no exceptions; the check takes about 8 s locally. ADR-0041's proposal wording is history from its first Accepted commit 5b90054 and stays as it is.
  - The editor cannot regenerate the baseline. Rewriting it needs a force-push, which branch protection forbids (playbook).
  - When CI=true, a shallow or non-git checkout fails the test. Outside CI (an archive copy) it skips with a printed notice.
  - Publishing hashes of private product ADRs (CR14's third bullet) stays with the existing public-record playbook row.
- README 'How to read this log' gains three rules:
  - the Decision text is final in the commit that sets Status to Accepted, and (d) fails any later edit;
  - a record that changes another names it in its Changes row, and the changed record gets a Later records entry;
  - Context and Decision are never edited after acceptance.

3. One-time relation audit and a new ADR
- Audit the cross-references of all 80 records (they are sparse; product ADRs cite few others) and back-fill Changes rows (header metadata, outside CR14's Context and Decision) and Later records.
- Relations found so far:
  - ADR-0071 <- 0077 (rank threshold scaled to the lineup) and <- 0079 (LABEL-2 note for 1-2 references);
  - ADR-0074 <- 0080 (corrects twice, replaces);
  - ADR-0072 <- 0080 (extends);
  - ADR-0079 <- 0080 (extends).
- To classify in the audit: ADR-0074 <- 0079 (SEC-2 Temporal HTTP API) and ADR-0075 <- 0079 (TELLS select only with a person present).
- New ADR (provisionally ADR-0081, Track Process+Product). It records:
  - the release gate;
  - the correction to ADR-0066's 'one file to back up', replaced by the backup unit below;
  - the amendment to ADR-0068's merge gate;
  - the log rules and the Changes row;
  - a record note on ADR-0041.
  Its Changes row is: 0066 corrects; 0068 amends; 0041 annotates.
- The gate and backup parts are Delegated under ADR-0062 (technical choices that shape the code). The log rules govern a user-set log (ADR-0001) and the user-approved CR14, so the playbook gets an item asking the user to confirm them. They stand as Delegated and reversible until then.
- The ADR-0041 note says, in its first sentence, that it is not a ratification (CR14: ratifications become new records; per-rule ratification stays D10). It records only that:
  - the Decision's 'Proposed, not decided' and 'awaiting approval' are the 2026-10-06 proposal text, kept unedited;
  - the record's own Status row gives acceptance at 2026-10-07 06:35;
  - 'rule 3' means the third listed rule.
- Index rows get '(changed by ADR-NNNN)' pointers. History-table rows get Outcome pointers (ADR-0061 for D5, D12, D14 and D16; ADR-0064 for the v1 product form; backlog Pricing). The table intro links backlog 'Deferred decisions'. The ADR-0040 row notes its adoption in the product spec. Root README:110 replaces its hand-maintained range with a link to the index's Product section.

4. Seed wording (R3, RS), through the protocol's own change record
- Surfaces: map:393, map:675, protocol/04-use-case-evidence.md:200 and :221, protocol/README.md:130. 01-blocks.md:97 adds D.6. Summary lines link to 01 · SEED evidence.
- Narrowed text: 'The article's specific setup (a shell-generated seed feeding a design workflow) is untested. SSoT v3 compared injected and tool-call external randomness with model-written strings (§5.1.2; App. D.6), and model-written strings generally did better on the model and open-ended benchmark tested there.'
- The implementer reads D.6 and names its model and benchmark in 01-blocks (reviewers report DeepSeek-R1 on NoveltyBench-style open-ended tasks), so the narrowed claim does not overgeneralise the other way.
- Each changed statement gets a row in a new '**Round 3: post-release review (2026-10-08)**' table in protocol/04 #Corrections (Original | Correction, citing §5.1.2 and D.6).
- Spec §3.3's SEED note cites D.6 as indirect evidence about the runner-injected form. A backlog deferred decision asks whether the product SEED string should stay runner-injected or become model-written. No behaviour change.

5. Backup unit and restore (R4)
- Unit: the whole BYWAY_DATA_DIR, copied after byway has stopped and after confirming the engine is gone (the Temporal port, BYWAY_TEMPORAL_PORT or 7233, is free and no temporal process remains). A server left over from an unclean stop can still be writing temporal.sqlite (dev-engine.ts portInUseMessage).
- Contents: byway.sqlite with any -wal/-shm, artifacts/, ledger.jsonl and ledger.jsonl.head, exposure.jsonl, and temporal.sqlite with its sidecars. bin/ is optional.
- Restore replaces the whole directory with byway stopped. Mixing files from different backups is unsupported, and the README names each consequence:
  - an older or missing ledger rolls spend back and lets caps admit spend again;
  - a store older than Temporal leaves orphan workflows, which are terminated at start;
  - Temporal older than the store fails runs plainly (OPS-1);
  - Temporal ahead of the store on the same run waits on a checkpoint the store lacks and is not detected;
  - missing artifact files are reported at start.
- Until F03 lands, the README section states the ledger caveat explicitly: spend made after the backup is not counted against caps, so check provider dashboards. The F03 restore cases below carry a comment that the caveat is removed in the same change that makes them pass.
- README Data table gains exposure.jsonl, .head, the sidecars and bin/.
- Code, all read-only:
  - `checkStore(dataDir)` in packages/store/src/check.ts, exported from the package and not added to the contracts Store interface: PRAGMA quick_check, plus a stat of every recorded artifact file, returning missing hashes and the run ids that reference them.
  - `dataDirReport({store, gateway, dataDir})` in packages/runner/src/data-check.ts composes checkStore, gateway.verifyLedger(), and a ledger-behind-store check: each run whose store costUsd exceeds the ledger's byRun total for that run by more than $0.01 (from Gateway.spend). That catches the most likely partial restore, byway.sqlite and artifacts without ledger.jsonl and .head, which verifyLedger reports as clean (probes P1 and P5).
  - scripts/serve.ts prints the report before starting the engine. It reports and never blocks; fail-closed admission is F03's.
- Two-way engine reconciliation in one place: reconcileLostRuns (lost-runs.ts, the OPS-1 boundary) becomes the single store/engine pass. Besides today's direction (store going, Temporal not, fail plainly), it lists open run workflows on the task queue whose run the store lacks and terminates them with ORPHAN_RUN_MESSAGE before the worker polls. The store stays the authority. v1 has one workspace (the Store has no createWorkspace or listWorkspaces), so scanning the default workspace covers every run.

6. Keyboard and focus (R5)
- Shared primitive in apps/web/src/components/useAction.ts:
  - `useAction(fn)` returns `{busy, run}` with a synchronous ref in-flight guard: a second call while one is running returns at once, before React re-renders.
  - `ActionButton` renders aria-disabled and aria-busy, stays focusable, and does nothing while busy or unavailable.
  - Form submits route through the same `run`, so Enter in a field while busy does nothing.
- Applied to every control that disables itself or shows busy:
  - TurnFooter, ConfirmPanel and ComparePanel;
  - SelectPanel's send button and its bulk 'Choose all' and 'Clear', which use the 'unavailable' state;
  - StartForm submit;
  - RecommendationView Start and compose;
  - RunScreen's controls and resolve();
  - the Examples file input while adding.
- The ref guard keeps the double-start protection that `disabled` gave the paid Start button. Run start has no server idempotency.
- Regression guard: apps/web/test/guard-disabled.test.ts, next to guard-boundaries, fails on any `disabled=` attribute in apps/web/src outside a reviewed allowlist of {file, element, reason}:
  - Examples 'Paste an example' (addText moves focus to the new field first);
  - Examples fieldset (focus is on Start, outside it, while busy);
  - SettingsView (disabled by configuration, not by the user's action);
  - Switch (passes through its caller's prop).
- RunScreen remembers the timeline button that opened StepDetail. On close with no question open, focus returns there, falling back to the run status. With a question open, today's focus on Your turn is kept.
- New apps/web/e2e/keyboard.spec.ts with helpers in apps/web/e2e/a11y.ts (focusedDescription, expectNamedControls), demo mode, and page.route to delay or fail POSTs.
- Cross-cluster cases are named stubs in the same spec, enforced by the suite:
  - test.fail(), owner ID in the title, where today's behaviour reproduces: F06 (draft survives open and Esc), F07 (no unnamed link in a placed page, via F07's deterministic structural check, never axe) and F13 (compare versions exposed and reachable). They turn red when the owner's fix lands, which forces conversion to plain tests.
  - test.fixme for F05, whose consent control does not exist yet.

7. Licences and research prerequisites (R2, RS): backlog entries plus one comment fix.
- 'Before any distribution (packaged build or replication kit)' records the verified facts:
  - sharp is an unused optional dependency of next;
  - lightningcss is dev-only;
  - caniuse-lite (CC-BY-4.0) needs attribution;
  - sharp's binary bundles LGPL and MPL-1.1 libraries;
  - the Temporal CLI and Chromium are runtime downloads;
  - unionfs is Unlicense by file;
  - the root LICENSE versus package.json mismatch is the user's call.
  The required step is that the distribution job generates a licence and notice manifest from the actual artifact.
- 'Before the study registry's first entry':
  - labelFor enforces expires, with a representable Historical outcome;
  - StudyEntry gets the CR11 scope tuple;
  - labels key on the ADR-0041 snapshot;
  - the lineage check must not trust an exposure.jsonl restored from an older backup, and cross-checks it against the ledger's judging calls.
- contracts/advisor.ts:49's comment stops promising unimplemented degradation. label.test.ts's empty-registry assertion message points to that backlog entry.
- The playbook public-record row (line 42) is updated: ADR CI is now in code; branch protection (required 'verify' check, no force-push), Actions minutes and the Windows cadence remain user and admin actions.


**Steps**
1. Add the verify script, .node-version and .github/workflows/verify.yml (Linux every change, Windows nightly, PR and on demand; Chromium and Temporal CLI provisioned and cached in every job that runs tests; fetch-depth 0; concurrency). Correct README:95 and add the 'CI verifies with' line. Push and iterate on the Linux job until the first run is green, fixing the POSIX paths it surfaces. Then push a throwaway probe branch adding 'proven' to an apps/web string and confirm CI goes red via guard-claims. Add the ENG-10 'expected diagnostic' comment. Update the playbook public-record row (branch protection, no force-push, Actions minutes, Windows cadence).
2. Write scripts/test/adr-records.test.ts with checks (a) to (d), and add scripts/test to the vitest include and scripts/tsconfig.json. Test (d) with a temp git-repo fixture: an edited Decision word in a later commit fails; an appended Later records section passes. Watch (b) fail on ADR-0080's prose verbs, which have no Changes row, and (c) fail on ADR-0041.
3. Do the one-time relation audit across all 80 records. Back-fill Changes rows and Later records (at least 0071<-0077/0079, 0074/0072/0079<-0080, plus whatever the audit classifies). Write the new ADR with its Changes row (0066 corrects, 0068 amends, 0041 annotates) and the non-ratification ADR-0041 note. Update the index pointers, count line, the 'How to read this log' rules, the history-table Outcome pointers, the Deferred decisions link, the ADR-0040 note and root README:110. Add the playbook item asking the user to confirm the log rules. Run the ADR test until green.
4. Correct the seed wording at map:393 and :675, 04:200 and :221, and README:130. Add D.6, with its model and benchmark as read from the paper, to 01-blocks:97, plus the spec §3.3 note. Add the Round 3 Corrections table in protocol/04 with one row per changed statement, and the backlog decision on the SEED string source. Acceptance check: a grep finds no blanket phrase and every changed line has a Corrections row.
5. R4 tests first, in packages/runner/test/restore.test.ts, using a real store, gateway, ledger, exposure register and CAS with a fake adapter:
(i) a data dir copied after clean closes reopens with identical runs, readable artifacts, equal spend and exposure, and a clean dataDirReport (no false positives);
(ii) a deleted artifact file is reported with its referencing runs;
(ii-b) a copy without ledger.jsonl and .head reports the runs whose cost the ledger lacks;
(iii)/(iv) the ledger-missing and older-ledger-pair restores refuse a call over the cap, written as `it.fails` with owner F03 and a comment tying the README caveat to them.
Extend engine-state.test.ts with (v): a running run workflow whose store run is absent is terminated with ORPHAN_RUN_MESSAGE at engine start, and none of its activities executes.
6. Implement checkStore, dataDirReport, the serve.ts startup report and the two-way reconcileLostRuns. Write the README 'Back up and restore' section with the engine-gone check, the whole-directory rule, the named mixed-restore consequences and the ledger caveat, and extend the Data table. Run the runner suite.
7. R5 tests first:
- apps/web/test/guard-disabled.test.ts fails today on the non-allowlisted uses (TurnFooter, ConfirmPanel x2, ComparePanel, SelectPanel x2, StartForm, RecommendationView Start, Examples file input).
- keyboard.spec.ts cases (1) to (3) and the cross-cluster test.fail and test.fixme stubs with owner IDs.
8. Implement useAction and ActionButton, convert every listed control, add the allowlist with reasons, and add focus return to the opener in RunScreen. Run pnpm e2e until green, except the expected-failure stubs. Notify the F03, F05, F06, F07 and F13 owners that their cases are in the suite.
9. Add the backlog entries 'Before any distribution' and 'Before the study registry's first entry' (including the exposure-restore note). Fix the contracts/advisor.ts:49 comment and the label.test.ts message. Finish with pnpm verify locally on Windows and a green CI run on Linux, plus one dispatched Windows run.


**Acceptance tests**
- The first CI run on main is green on ubuntu-24.04 (`pnpm verify`, including pages.test.ts and cards.test.ts with the provisioned Chromium). A dispatched windows-2025 run is green. A probe branch adding 'proven' to an apps/web string turns CI red via guard-claims, which shows the spec's 'CI check' is now real.
- adr-records (b): every Changes entry has exactly one matching Later records entry and the reverse. A relation verb plus an ADR number in a Decision without a Changes entry fails. Fails today on ADR-0080, and passes after the audit with 0071 listing 0077 and 0079 and with 0074, 0072 and 0079 listing 0080.
- adr-records (c): no Accepted ADR's Decision opens with 'Proposed, not decided' without an annotates entry. Fails today for ADR-0041.
- adr-records (d), on a temp git-repo fixture: changing one word of a Decision after the commit that set Accepted fails; appending Later records passes; the check has no file the editor could regenerate. On the real repo all 73 Accepted records pass today.
- restore.test (ii)/(ii-b): checkStore returns a deleted artifact's hash and the runs that reference it, and dataDirReport flags runs whose store cost the ledger lacks after a restore without ledger.jsonl and .head. Fails today (no functions; verifyLedger returns null). (i) also asserts a clean report on a correct round-trip.
- engine-state (v): with the store missing run X while Temporal runs X's workflow, engine start terminates it with ORPHAN_RUN_MESSAGE and runs no activity of X. Fails today.
- restore.test (iii)/(iv), `it.fails`, owner F03: a restored dir without the ledger, or with an older ledger and head pair, refuses a call that the original spend would put over the cap. It is an expected failure today and turns red when F03 lands, forcing the stub to become a plain test and the README caveat to be removed.
- guard-disabled: no `disabled=` in apps/web/src outside the reviewed allowlist. Fails today on 9 uses.
- keyboard.spec (1): Enter on Yes, and on Send reaction, with a slow then failing POST keeps document.activeElement on that button while busy and after the role=alert error. Fails today: BODY.
- keyboard.spec (1b): on the Recommendation screen, pressing Enter twice on Start with a slow then failing POST /api/runs sends exactly one POST and keeps focus on Start. (1c) Enter on 'Choose all' keeps focus on it. Today focus goes to BODY.
- keyboard.spec (2): with no question open, Enter on a timeline step and then Escape returns focus to that timeline button. Fails today: BODY.
- keyboard.spec cross-cluster stubs exist with owner IDs: test.fail for F06, F07 and F13 (expected failures today), test.fixme for F05.
- grep over protocol/ finds no blanket 'External seed strings untested', 'No test of external seed strings' or 'external shell-RNG variant is untested'. 01-blocks.md cites App. D.6 with its model and benchmark, and protocol/04 #Corrections has a Round 3 row for each changed statement.


**Compatibility.** - Temporal replay (ADR-0078): no workflow code changes. The orphan pass runs in engine-start client code (lost-runs.ts) before the worker polls, and terminates only run workflows whose run the store does not have, so persisted histories replay unchanged.
- Stored data: no schema migration. checkStore, quick_check and dataDirReport are read-only. The backup unit is documentation plus tests.
- Recipe hashes, prompt template versions and catalog: unchanged. The SEED source stays runner-injected.
- Contracts: no type changes. Only the advisor.ts:49 comment changes.
- Toolchain: package.json gets no packageManager or devEngines field, so pnpm 11's default self-download and the lockfile's packageManagerDependencies document are not triggered. Users on any pnpm 11.x and Node 24+ are unaffected, and pnpm-lock.yaml is unchanged. CI alone pins Node 24.13.1 (.node-version), pnpm 11.12.0 (action-setup) and the runner images.
- UI: aria-disabled buttons remain clickable and focusable. The shared useAction ref guard makes a second activation a no-op before React re-renders, which preserves the double-submit protection `disabled` gave StartForm and the paid Start button (run start has no server idempotency). Checkpoint resolution keeps its server-side fencing as a second line.
- CI: the ADR history check needs fetch-depth 0. Local runs outside a git checkout skip it with a notice; in CI a shallow checkout fails it. Ubuntu 24.04's userns restriction must be handled for F18's Chromium sandbox with a sandbox-capable setup, not a global --no-sandbox.
- ADR history: append-only is respected. Context and Decision are untouched. Changes rows are header metadata, corrections go in a new ADR and appended Later records, and CR14 is checked against the first Accepted commit, which freezes ADR-0041's proposal wording as history.
- Until the user enables branch protection (required check, no force-push), CI detects rather than blocks, and the history baseline could in principle be rewritten by a force-push. This is logged as a playbook action.

**ADR.** Yes. One new ADR (next free number, provisionally ADR-0081, reversible) with the Changes row '0066 corrects; 0068 amends; 0041 annotates'. It records:
- the release gate and CI-pinned toolchain, restating ADR-0068's merge gate;
- the correction to ADR-0066's 'one file to back up', with the defined backup unit, the mixed-restore consequences and the ledger caveat until F03;
- the log rules: the Decision is final at acceptance, the structured Changes row with a reciprocal Later records entry, and CR14 enforced against git history;
- a factual record note on ADR-0041 that says outright it is not a ratification (D10 keeps rule-level ratification).
The code and gate parts are Delegated under ADR-0062. The log rules touch the user-set log (ADR-0001) and user-approved CR14, so a playbook item asks the user to confirm them.
No ADR is needed for the backlog-only licence and registry prerequisites. The product SEED-source question is logged as a deferred decision.


**Deliberately not doing**
- No packageManager or devEngines.packageManager pin in package.json: under pnpm 11 it would make every user's pnpm download and run the pinned version and would rewrite the lockfile. The pin lives in CI.
- No regenerable hash manifest for CR14: the check compares against the first Accepted commit in git history.
- No YAML-text 'release-gate' unit test (circular). Acceptance is the green run plus the red probe.
- No path filters on CI triggers: tests read protocol/ and docs/adr, so docs-only changes must run too. Cost is handled with concurrency cancel-in-progress and a Windows nightly/PR cadence.
- No ESLint, Prettier or other general linter. Strict TypeScript plus the guard tests meet the spec's linter commitments.
- No filtering or silencing of Temporal teardown diagnostics. ENG-10's expected error is only annotated.
- No repository-settings changes from code (branch protection, signed commits, public mirror, Actions billing, Windows cadence). These are playbook user/admin actions.
- No third-party licence decisions, licence scanner or root LICENSE now. They are tracked against the distribution job.
- No online backup command, ledger-head anchoring or cross-store generation markers. Fail-closed accounting after a partial restore is F03's. This cluster only detects and reports.
- No detection of the Temporal-ahead-of-store-on-the-same-run mix. It is named as unsupported in the README; detecting it would need workflow-state queries out of proportion to a documented-unsupported restore.
- No server-side idempotency key for run start. The shared client in-flight guard closes the double-activation path in a page, and a second tab is an explicit user action in a single-user local app.
- No axe-core dependency, and never axe on generated artifacts as a product check (Study 1 G2 instrument, CR12/ADR-0055).
- No fixes for F05, F06, F07 or F13 or for the compare-view exposure gap. Their cases sit in the shared spec as owner-tagged expected failures, and the compare-view gap is recommended for P2 triage under F13.
- No change to the product's SEED behaviour or recipe hashes.
- No research registry machinery while the registry is empty and the research track is parked. A backlog entry and the empty-registry tripwire only.
- No rewriting of ADR-0041's Decision, the history-table rows or old plans, and no standalone 'current-status map' document.
- No macOS CI leg. README states CI verifies Linux on every change and Windows nightly.


**How it resolves each finding**
- **R1:** Resolved by one release gate: `pnpm verify` run by .github/workflows/verify.yml on ubuntu-24.04 for every change and on windows-2025 nightly, on PRs and on demand. CI pins Node (.node-version 24.13.1), pnpm (11.12.0 via action-setup) and the runner images, and provisions and caches Chromium and the Temporal CLI in every job that runs tests, because the unit suite itself launches Chromium. No packageManager field, so users' pnpm and the lockfile are unaffected. The guard tests thereby become the spec's and ADR-0059's real CI checks, and ADR-0068's merge gate is restated. README:95's 'no network' line is corrected. The first green Linux run, including the POSIX bring-up, plus a deliberate red probe are the acceptance. Teardown diagnostics stay unfiltered and annotated. Branch protection and minutes go to the playbook.
- **R2:** No dependency or licence change now: nothing is distributed and severity is none. A backlog entry, 'Before any distribution', records the verified facts:
- sharp is an unused optional dependency of next, and its binary bundles LGPL and MPL-1.1 libraries;
- lightningcss is dev-only;
- caniuse-lite (CC-BY-4.0) needs attribution;
- the Temporal CLI and Chromium are runtime downloads;
- unionfs is Unlicense by file;
- the root LICENSE mismatch is the user's call.
The entry requires the eventual distribution job to generate a licence and notice manifest from the actual artifact.
- **R3:** Resolved at the log's missing structure:
- adr-records.test.ts enforces index and header agreement;
- a required structured Changes header row with a bijective Later records back-link (prose verbs only prompt for the row);
- no unannotated proposal-tense Decision on an Accepted record;
- CR14 checked against the first Accepted commit in git history, with no regenerable manifest.
A one-time audit back-fills relations, including 0071<-0077/0079 and 0074/0072/0079<-0080. A new ADR adds the log rules (playbook item for the user to confirm them), corrects ADR-0066, amends ADR-0068, and annotates ADR-0041 with a note that says outright it is not a ratification. History-table rows get Outcome pointers and root README:110 becomes a link. The seed wording goes through protocol/04's Corrections log (item 4). No accepted Context or Decision text is edited.
- **R4:** Resolved by defining the backup unit: the whole data dir, copied after byway has stopped and the engine port is confirmed free. It includes the WAL/SHM sidecars, ledger.jsonl.head, exposure.jsonl and temporal.sqlite, with whole-directory restore. Each mixed-restore consequence is named, and the ledger caveat is stated until F03 lands. This goes in the README and in the new ADR that corrects ADR-0066. Partial restores become visible:
- a read-only startup dataDirReport covers quick_check, missing artifact files with the affected runs, ledger verify, and runs whose store cost the ledger lacks (which catches the most likely restore, without the ledger);
- reconcileLostRuns becomes the single two-way store/engine pass and also terminates orphan run workflows.
Restore tests are added. The ledger fail-open stays F03's, and its restore cases are written here as owner-tagged `it.fails` stubs, so the suite forces the hand-off and the README caveat removal.
- **R5:** Resolved at the shared cause:
- One useAction/ActionButton primitive (aria-disabled plus aria-busy, focusable, with a synchronous ref in-flight guard) replaces `disabled` on every self-disabling or busy control: the four panels, SelectPanel's bulk buttons, StartForm, RecommendationView Start and compose, RunScreen and the Examples file input. Focus is kept and double-submit protection preserved.
- A guard test forbids `disabled=` outside a reviewed allowlist.
- RunScreen returns focus to the step's opener.
- keyboard.spec.ts drives these in a real browser through the release gate.
- The F06, F07 and F13 cases are owner-tagged test.fail stubs that turn red when fixed; F05's is test.fixme. Generated pages are never checked with axe (CR12).
- **RS:** Partly accepted. The wording is corrected at map:393 and :675, 04:200 and :221, and README:130, and 01-blocks:97 adds D.6, qualified by the model and benchmark D.6 actually used. Every change is logged as a Round 3 row in protocol/04 #Corrections. Spec §3.3 notes D.6 as indirect evidence about the runner-injected form, and a deferred backlog decision asks whether to switch to model-written strings, with no behaviour or hash change. The activation requirements become the backlog entry 'Before the study registry's first entry': expiry with a representable Historical outcome, the CR11 scope tuple, snapshot-keyed labels, and not trusting a restored older exposure.jsonl. The empty-registry test is the tripwire, and the advisor.ts:49 comment stops promising unimplemented degradation.


**Changes forced by the adversarial rounds (last round)**
- mustFix 1 (Chromium in the checks job), ACCEPTED: verified that vitest.config.ts includes packages/*/test, and pages.test.ts:15-17 and cards.test.ts:8-11 launch real Chromium (pages.ts:241-243) with no skip guard. Every job that runs `pnpm test` now installs Chromium (`--with-deps` on Linux), with browser and Temporal CLI caches keyed on exact versions. README:95's 'no network' is corrected. The R1 root cause now names unprovisioned prerequisites of the unit suite.
- mustFix 2 (pnpm 11 packageManager semantics), ACCEPTED: verified in the installed pnpm 11.12.0 CHANGELOG. :983-992 remove packageManagerStrict(Version) in favour of pmOnFail (default download); :317 says the field makes pnpm download and run that version; :1037-1039 say the resolved version is stored as packageManagerDependencies in pnpm-lock.yaml, and the current lockfile has no such document. Chose the critic's option 1: no packageManager or devEngines field. pnpm 11.12.0 is pinned in the workflow (action-setup), Node in .node-version, and the runner images by explicit label. The compatibility paragraph is rewritten so users' pnpm and the lockfile are unaffected.
- mustFix 3 (prose-verb regex), ACCEPTED: verified that the verb grep matches only ADR-0080. ADR-0077 rescales the threshold ADR-0071:17 applies, and ADR-0079:21 (LABEL-2) replaces ADR-0071:18's note for 1-2 references, but ADR-0071 links to neither. Product ADRs 0064-0080 have no Related row (63 of 80 do). Replaced check (b) with a required structured Changes header row (closed verb set) and a bijective Later records back-link. The regex now only asks for the row. Added a one-time audit of all 80 records, and the new ADR's Changes row includes 0068 (amends).
- mustFix 4 (regenerable CR14 manifest), ACCEPTED: the manifest is dropped. Check (d) compares each ever-Accepted ADR's Context and Decision at HEAD with the first commit where its Status read Accepted. A probe in my scratch folder confirmed it is feasible: 73 Accepted records, zero edits since acceptance, about 8 s locally. CI uses fetch-depth 0, a shallow checkout fails it under CI=true, and the remaining force-push hole is closed by branch protection (playbook).
- mustFix 5 (four-panel patch), ACCEPTED: verified StartForm.tsx:207 and RecommendationView.tsx:428 (`disabled` is their only double-submit guard; start() and submit() have no in-flight check, and client.ts:68-93 has no idempotency), SelectPanel:54-57's self-disabling bulk buttons, and the Examples file input. Replaced the per-panel fix with one useAction/ActionButton primitive with a synchronous ref guard, applied to every self-disabling or busy control. Added guard-disabled.test.ts (no `disabled=` outside a reviewed allowlist with reasons: Examples addText moves focus first, the Examples fieldset, SettingsView, the Switch pass-through) and keyboard cases for Start (exactly one POST) and 'Choose all'. Server-side run idempotency is explicitly out of scope, with the reason given.
- mustFix 6 (seed wording without change record), ACCEPTED: verified that protocol/04 #Corrections (:231) holds Round 1 and Round 2 tables and README 'How this was built' points to it. Each corrected statement now gets a Round 3 row. Also found a surface the first design missed, 04:200 ('The article's external shell-RNG variant is untested'), now included. D.6 is qualified by the model and benchmark it actually used: the implementer reads the paper, and the reviewers report DeepSeek-R1 on NoveltyBench-style tasks.
- shouldConsider (ledger-missing restore reads clean), ACCEPTED: the Store run record has costUsd and Gateway.spend returns byRun. dataDirReport flags runs whose store cost exceeds the ledger's byRun total, with round-trip test (i) asserting no false positives.
- shouldConsider (README backup section before F03), ACCEPTED: the README states the ledger caveat explicitly until F03 lands. F03's restore cases (iii)/(iv) are written here as owner-tagged `it.fails`, which turn red when F03 lands and force both the stub conversion and the caveat removal. I cannot see F03's adopted design from this task, so the suite, not an assumption, enforces the hand-off.
- shouldConsider (Temporal may outlive byway; mixed-restore hang; default workspace), ACCEPTED in part: the procedure requires confirming the engine port is free and no temporal process remains (portInUseMessage confirms leftovers happen), and the README names the Temporal-ahead-of-store hang as an unsupported-mix consequence without building detection. The orphan direction moves into reconcileLostRuns so lost-runs.ts is the single two-way pass. The default-workspace scan is kept, because the Store contract has no createWorkspace or listWorkspaces, so v1 has exactly one workspace.
- shouldConsider (circular release-gate test), ACCEPTED: dropped. Acceptance is the first green run plus the red 'proven' probe.
- shouldConsider (CI cost and Linux bring-up), ACCEPTED in part: added concurrency cancel-in-progress, and Windows runs nightly, on PRs and on dispatch rather than every push. Path filters are rejected because catalog tests read protocol/03-configurations.md and the ADR checks read docs/adr, so docs-only changes must be verified. Linux bring-up (dev-server.real.test.ts ps/lsof, process-tree kills) is explicitly budgeted inside L.
- shouldConsider (Windows e2e), ACCEPTED: the Windows job runs the full `pnpm verify`, including e2e.
- shouldConsider (delegation of log rules), ACCEPTED: the gate and backup parts stay Delegated under ADR-0062. The log rules and the ADR-0041 note get a playbook item for the user to confirm, because they touch ADR-0001 and user-approved CR14. The note's first sentence says it is not a ratification (CR14; D10).
- shouldConsider (cross-cluster R5 cases by memory), ACCEPTED: they are named stubs in keyboard.spec.ts with owner IDs, test.fail where today's behaviour reproduces (F06, F07, F13) and test.fixme for F05, whose control does not exist yet.
- Verdicts unchanged (no verdictChallenges were raised). Rationales are extended with the instances these checks surfaced: Chromium in the unit suite and the never-run Linux paths (R1); 0071<-0077/0079 and the CR14 history probe (R3); the Start and bulk buttons and the Examples input (R5); 04:200 (RS). R1 is also corrected: root devDependencies are caret ranges resolved by the lockfile, not exact manifests.


**Final adversarial check:** passed (no blocking issue).
 Residuals:
- NON-BLOCKING. guard-disabled's 'fails today on 9 uses' is short by one. A regex for `disabled=` in apps/web/src finds 14 matches: 4 are allowlisted (Examples.tsx:113 fieldset, Examples.tsx:166 'Paste an example', SettingsView.tsx:126, Switch.tsx:28), and 10 are not. The extra one is RecommendationView.tsx:401, `<Examples ... disabled={busy} />`. That component prop drives the allowlisted fieldset, but it is in neither the allowlist nor the conversion list.
- NON-BLOCKING. Converting RecommendationView's Start (`disabled={busy || blocked}`) to aria-disabled removes the native block on implicit submission when `blocked` is set (a composed recipe that failed its checks). Today, Enter in the budget field does nothing because the default button is disabled. start() never checks `blocked`, and the design guarantees only that a form submit is blocked while busy.
- NON-BLOCKING. The narrowed seed sentence applies 'on the model and open-ended benchmark tested there' to both §5.1.2 and App. D.6. Per protocol/01-blocks.md:97 and the reviewer's own note, §5.1.2 is the biased probabilistic-instruction test; D.6 is open-ended generation on DeepSeek-R1. Also, the acceptance grep phrases do not match map:393 ('the external-RNG variant is untested') or README:130 ('The external shell-RNG seed.').
- NON-BLOCKING. Hardening for the CR14 history check (d). Deleting an ever-Accepted ADR file should fail too, for example via git log --diff-filter=D under docs/adr. The new log rules should also say that header metadata rows (Status, Changes) are the only permitted non-append edits to an Accepted record. CR14 says 'append-only', and the back-fill inserts Changes rows into the Accepted ADRs 0077, 0079 and 0080.
- NON-BLOCKING. 'Changes: None' remains the author's own declaration. A future record could repeat what 0077 did: it changes ADR-0071 and mentions it only in Context, with no relation verb. That would pass, because the verb regex looks only at the Decision.
- NON-BLOCKING. The it.fails (F03) and test.fail (F06/F07/F13) stubs pass on any failure, including setup errors.
