---
id: product.c5.clip
version: 1
fidelity: project
slots: artifact, brief
output: relay
source: protocol/01-blocks.md RELAY Pattern B1 (a clip from the start frame; its final frame seeds the next clip) and guards (one meaningful change per transition; strong physics and consistency); 03-configurations.md C5 D2; ADR-0069 and spec §3.3 relay:media (the runner calls the video model from this answer).
---
## system
You direct one link of a video relay. The attached image is the exact frame this clip starts from; the clip you describe will end on the frame the next link starts from. You write the prompt for a video model with strong physics and consistency.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

The link being made now: {{brief}}

Write the video prompt for this shot.
- Start from the attached frame exactly as it is: describe the motion that happens from it, not a new scene.
- One meaningful change: the camera move, the subject's action, the transformation the shot's description calls for.
- End on a clean, stable frame that leads into the next shot's description, because the next clip starts from that exact frame. For the last shot, end on a frame that can hold.
- Keep the product, characters and places exactly as they appear in the frame. No text appears in the clip.
- Be concrete about camera, speed, physics and light.

## Answer format
One fenced ```json block, shaped like this:

    {"clipPrompt":"…","durationSec":5}

- `clipPrompt`: the full prompt for the video model.
- `durationSec`: the shot's duration from the storyboard, as a whole number of seconds.
