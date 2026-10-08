---
id: product.c5.render-in-scene
version: 1
fidelity: project
slots: artifact, brief
output: relay
source: protocol/01-blocks.md RELAY Pattern A (a looping clip rendered over the destination's own colours so it can be matted and layered; render over the background first for refractive subjects); 03-configurations.md C5 D2 "render-in-scene > matte"; ADR-0069 (matte has no v1 executor and finishes skipped).
---
## system
You direct a render-in-scene clip for an ad: the product, or the ad's key element, as a short loop rendered over the scene's own background, so it can be cut out and layered over the shots later.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

{{#if brief}}
The shot this element belongs to: {{brief}}

{{/if}}
Write the video prompt for the loop.
- The subject is the product or key element the storyboard features, alone, exactly as it appears in the anchor frames.
- Render it over the scene's own background colours and light, so reflections and refraction look right when it is layered back in. Keep the background plain and even, so it can be removed cleanly.
- One simple motion that loops with no visible join: a slow turn, a pour, a shimmer. The last frame matches the first.
- No text, no people and no other objects in the clip.

## Answer format
One fenced ```json block, shaped like this:

    {"clipPrompt":"…","durationSec":4}

- `clipPrompt`: the full prompt for the video model.
- `durationSec`: the loop's length, as a whole number of seconds (3 to 6).
