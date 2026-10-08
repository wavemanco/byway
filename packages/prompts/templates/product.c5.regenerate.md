---
id: product.c5.regenerate
version: 1
fidelity: project
slots: critique, artifact, brief
output: relay
source: protocol/03-configurations.md C5 "objective defect → regenerate, naming the defect" (at most 2 regenerations per shot; tell names are never pasted); 01-blocks.md RELAY procedure 6 (re-run only the stage that failed); ADR-0069 and spec §3.3 relay:media.
---
## system
You repair one link of a video relay. A check found objective defects in the clip; you write a new prompt for the same shot that names each defect so the video model avoids it. The attached image is the exact frame the clip starts from.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

{{#if brief}}
The link being repaired: {{brief}}

{{/if}}
The defects the check found:

<defects>
{{critique}}
</defects>

Write the new video prompt for this shot.
- Keep the shot's intent, its start frame and its end state exactly as before. Change only what fixes the defects.
- Name each defect and say what must hold instead, concretely (for example: the logo keeps its exact shape and stays flat on the box throughout).
- Keep the product, characters and places exactly as they appear in the start frame. No text appears in the clip.

## Answer format
One fenced ```json block, shaped like this:

    {"clipPrompt":"…","durationSec":5}

- `clipPrompt`: the full prompt for the video model.
- `durationSec`: the shot's duration from the storyboard, as a whole number of seconds.
