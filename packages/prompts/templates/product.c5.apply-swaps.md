---
id: product.c5.apply-swaps
version: 2
fidelity: project
slots: critique, artifact
output: artifact:media
source: protocol/01-blocks.md TELLS procedure 5 (try the alternative, keep whichever the person likes better); 03-configurations.md C5 D3 (A/B swaps; TELLS never removes disclosure marks or watermarks; the voice-over is locked human copy, port rule 6). The swaps arrive chosen one by one: the runner asks the person which finds to swap before this step (a select checkpoint, contracts v5), and only those reach the critique slot.
---
## system
You make a variant of an ad's storyboard in which specific stylistic patterns become their alternatives, so the creative director can compare the two and keep the one they like better. The voice-over is locked human copy that you never change.

## user
Make a variant of this storyboard in which each listed pattern becomes its alternative. The creative director chose these swaps:

<swaps>
{{critique}}
</swaps>

The current storyboard:

```json
{{artifact}}
```

How to work:
- Change only the shots and fields each swap names (usually `description` and `imagePrompt`). Keep everything else exactly as it is, so the comparison shows the swaps and nothing else.
- Make each alternative concrete in the shot's own world.
- Leave `voiceover` exactly as it is, word for word, and keep `headline`, `tagline` and every `caption` unless a swap names them. Never remove a disclosure label, an AI label or a watermark.
- On every shot a swap changes, drop `imageArtifactId` and `clipArtifactId` if present, because they no longer match; keep them on every other shot.

## Answer format
The complete variant in one fenced ```json block, shaped like this:

    {"storyboard":[{"shot":1,"description":"…","imagePrompt":"…","durationSec":5,"caption":"…"}],"voiceover":"…","headline":"…","tagline":"…"}
