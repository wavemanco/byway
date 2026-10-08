# ADR-0073: Runner semantics chosen where the product spec was open

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: chosen by Claude's runner work packages under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)), and reviewed by Claude when the branches were merged; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 21:40 |
| **Track** | Product |

## Context

Spec §3 says how each recipe operator executes. It leaves some edge cases open, and the runner had to settle them to be deterministic and testable. They are recorded here so they can be reviewed and changed on purpose.

## Decision

- **Loops.** A loop exits right after its critic or check, so a version that passes, or that reaches the cap, is not fixed once more. At the cap with `onCap: human`, answering "no" to "Use the best version so far?" raises the cap once by `max` rounds; the second cap takes the best snapshot.
- **One-shot gates.** A failed gate re-runs `retry.stage` and every later stage from that stage's entry ports.
- **C5 render-in-scene.** It renders the final shot starting from the chain's last frame, and its clip replaces that shot's `clipArtifactId`.
- **Inputs.** `StartRunInput.inputs.voice` seeds the voice port. `inputs.draft` is the starting text of the author's first write.
- **Empty CUT.** A model cut answering "Nothing to remove.", or a blank human directive, counts as an empty directive. The fix step after it changes nothing and finishes with the note "Nothing to remove". It is not marked skipped: the step ran and found nothing to do.
- **GREAT critique handed on.** The fix step receives our item's own section of the lineup critique, from the first shuffle. With several shuffles the rank is averaged, so it can be fractional.
- **TELLS catalogs.** A sweep uses the tell catalogs of its step's `domains` knob, joined in order. It falls back to `tells.<medium>` when none of the named catalogs exists, and `StartRunInput.inputs.tells` overrides both.
- **VOICE write-back.** Web pages go through `helper.voice.apply`, then a diff check (the tag skeleton is unchanged and every line appears verbatim), with a verified line-by-line placement as the fallback. Prose, options, media and code diffs are written back directly into their fields. `keepsVoice` protects only the person's words that were already in the work before the write.
- **Controls.** An answer is accepted while a run is paused, and the run carries on when resumed. Cancel, pause and resume on an ended run do nothing. Cancelling or failing a run withdraws its open questions.

## Alternatives considered

None were weighed in depth. Each choice is the smallest one that keeps runs deterministic and honest about what happened.

## Consequences

**Positive**

- The runner's behaviour in these cases is written down and covered by its tests.

**Negative**

- Some choices (raising the cap once, a single shuffle's critique) are product judgement calls that a user study may revisit.

## Evidence

- `packages/runner` scenario tests (`test/e2e/*`) and the work-package reports merged on 2026-10-07.
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §3.2
