# ADR-0069: In the product, C5 relay links run on fal.ai video, one link per shot, and steps with no v1 executor finish as skipped

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 18:25 |
| **Track** | Product |

## Context

C5 (Ad Video Chain) chains clips: each relay link starts from the exact last frame of the previous one (01 RELAY, 02 `A ~> B`). [ADR-0065](0065-product-v1-scope.md) already says video runs only when a fal.ai key is configured. The C5 recipe also has two steps that v1 has no executor for: `matte`, a compositing tool step, and `vo-audio`, which turns the approved voice-over script into audio. The runner needed a rule for both cases.

## Decision

- `Gateway.video` generates relay clips through fal.ai (`FAL_KEY`). It stores the clip and its last frame as artifacts, and the last frame becomes the next link's `anchor`. Profiles name their video model (`ModelProfile.video`), and `ProfileStatus.video` says whether one is usable.
- A relay chain runs one link per storyboard shot, up to its `maxLinks`. The first link starts from shot 1's frame, which the anchor-frames ASSET step produces. Every relay model step (`clip`, `regenerate`, `render-in-scene`) answers the `relay:media` contract, `{clipPrompt, durationSec}`. The runner then calls `Gateway.video` itself.
- When no video provider is usable, each relay link finishes as **skipped**. Its note reads "No video provider key is configured", and the anchor and artifact pass through unchanged. Steps that have no executor in v1 also finish as skipped with a plain note and pass the artifact through: `matte` ("Compositing is not available in byway yet") and `vo-audio` ("No voice-over audio provider is configured"). The run, its events and the result say what was skipped. Nothing is faked.
- In demo mode the mock provider returns a labelled placeholder clip, so the whole flow can be navigated.

## Alternatives considered

- **Leave C5 out of v1** — rejected; [ADR-0065](0065-product-v1-scope.md) puts all eight configurations in scope.
- **Fail the run when a step cannot execute** — rejected; the storyboard, frames and copy are useful on their own.
- **Fake the missing media** — rejected; it would misrepresent what was made (CR11 honesty).

## Consequences

**Positive**

- C5 runs end to end with any set of keys and shows exactly what it could not do.

**Negative**

- Without fal.ai, C5 delivers a storyboard with frames and copy, not a cut ad.
- Last-frame extraction depends on what the fal.ai platform offers. If it offers no endpoint, a local fallback is needed (recorded in the gateway README).

## Evidence

- [evidence/conversation.md](evidence/conversation.md) · dialogue 2026-10-07T17:48:15Z — “go with the product track. complete it first. use subagents with dedicated worktrees if needed.”
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §3.2, §3.3
- [ADR-0025](0025-model-access-four-providers.md) (fal.ai offered for ASSET and RELAY)
