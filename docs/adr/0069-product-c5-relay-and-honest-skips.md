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

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-31, whether the chosen profile can make images (backlog row B-179).** Settings said whether the chosen profile can make video (`ProfileStatus.video`) but nothing of its images. With Balanced, whose image model is Google's, and only the Anthropic and OpenAI keys, Settings lists OpenAI as "GPT models and image generation", so C3's "If you answer Yes and an image provider is set up" could read as true; the asset step was then skipped before any paid call with "No image provider key is configured…", which names no provider (item 11's check). Asked "B-179: how should byway say whether the chosen profile can make images?", the owner chose "Settings line and named skip note (Recommended)", whose description read "Settings gets a line under the video one, in the same form: 'Images: available' or 'Images need a Google key'. When a run skips images, its note names the provider: 'No Google key is configured for this profile's images, so no images were made; the work passes through unchanged.'" Chosen because the person then sees before a run whether its images can be made, and the run's own record says afterwards which key it lacked. Rejected: "Settings line only" ("Only the Settings line is added. The skip note keeps today's 'No image provider key is configured…', which names no provider."), because a run read later would still not say which key was missing; and "Both, and C3's question points to Settings" ("As the first option, and C3's explainer also reads 'If you answer Yes and Settings shows Images: available…'. That rewrites the sentence you chose today for B-077."), because it rewrites the owner's sentence of that morning while the Settings line already answers what that sentence leaves open. Claude's choices: "Images: not available" for a profile with no image model, or before Settings knows the profile; "an" before a provider whose name starts with a vowel ("Images need an OpenAI key"); in demo mode, ". Demo runs show sample images instead." after the line, as the video line has its own; the profile choices described by both lines, each ended by a hidden full stop so that a screen reader reads two sentences (the check's note web-and-tests-1); the skip note keeping its old words for a profile with no image model (the owner gave it its own words the same day: B-180, below); and the provider's name taken from the gateway's own list (`PROVIDER_NAMES` in packages/gateway/src/declines.ts, now exported). If it breaks, look at apps/web/src/view/labels.ts (`imageAvailability`), apps/web/src/components/SettingsView.tsx, and packages/runner/src/activities/asset.ts (`noImagesNote`) with availability.ts (`imageProvider`); apps/web/test/vocabulary.test.ts and packages/runner/test/activities.test.ts hold the words.
- **2026-10-31, the Providers list and a profile with no image model (backlog row B-180).** Item 12's check noted two older sentences, which its refuters judged no defect of that branch: Settings' Providers list gave Google only "Gemini models", though Balanced makes its images with Google's key; and for a profile with no image model (OpenRouter) a skipped image step said "No image provider key is configured, so no images were made; the work passes through unchanged.", untrue when the person holds an image key for another profile. Asked "B-180 (1): Settings' Providers list says Google gives 'Gemini models' and OpenAI 'GPT models and image generation', though Balanced makes its images with Google's key. Change Google's entry?", the owner chose "Gemini models and image generation (Recommended)", whose description read "One string in SettingsView.tsx, in this block; no check of its own." Chosen because the Providers list is where a person first reads what each key does. Rejected: "Leave it" ("The profile section's new images line already names the key the chosen profile needs."), because a person reading only the list could still take OpenAI's key for the image key; and "Later, at its trigger" ("It waits with B-180 until before anyone besides you uses byway."), because nothing blocked it. Asked "B-180 (2): for a profile with no image model (OpenRouter), a skipped image step still says 'No image provider key is configured, so no images were made; the work passes through unchanged.', which is untrue if you have an image key for another profile. New words?", the owner chose "Say the profile has none (Recommended)", whose description read "'This profile has no image model, so no images were made; the work passes through unchanged.' One constant in the runner's asset step and its test, in this block; no check of its own." Chosen because the run's record then says what is true for that profile, as Settings' "Images: not available" does. Rejected: "Keep today's words" ("The note stays; Settings already says 'Images: not available' for that profile."), because the run's record would keep a sentence that can be untrue; and "Later, at its trigger" ("It waits with B-180 until before anyone besides you uses byway."), because nothing blocked it. Claude's reading: the same note stays the fallback for a mock image model, which is always configured and so never skips. If it breaks, look at `PROVIDERS` in apps/web/src/components/SettingsView.tsx and `NO_IMAGES_NOTE` in packages/runner/src/activities/asset.ts; packages/runner/test/activities.test.ts holds the note's words.
