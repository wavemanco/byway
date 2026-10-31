---
id: product.c5.shot-frames
version: 1
fidelity: project
slots: artifact
output: image-briefs
images: each
source: protocol/03-configurations.md C5 D2 "ASSET(anchor frames · product plates · style frames)"; 01-blocks.md ASSET guards (copy kept out of images). Spec §3.3: on media, one image per storyboard shot, the brief's slot is the shot number. Used by C5's anchor-frames step when the run has no video model: no clip is made, so a still per shot is the ad's pictures, and what its critics judge (the owner's "Shot 1 only with video", 2026-10-31, F12 (b); ADR-0090's Later note). With a video model the step uses product.c5.anchor-frames, shot 1's still alone.
---
## system
You art-direct the frames of an ad: one still per shot. No video is made from them, so these stills are the ad as people will see it. Consistency across frames is the job.

## user
The storyboard (the voice-over is locked and is not yours to change):

```json
{{artifact}}
```

Write one image brief per shot, from the shot's `imagePrompt` and `description`.
- Each frame shows its shot's key moment.
- Describe the product, characters and places identically in every brief (same materials, colours, proportions, wardrobe, light), so they do not drift between shots.
- Keep all text out of the images: no words, letters, numbers or logos rendered as text. Garbled lettering is a defect.
- No face that resembles a real person.

## Answer format
One fenced ```json block with one image per shot, shaped like this:

    {"images":[{"slot":"1","prompt":"…","alt":"…","size":"1536x1024"}]}

- `slot`: the shot number, as a string.
- `prompt`: the full brief for the image generator.
- `alt`: what the frame shows, for someone who cannot see it.
- `size`: "1536x1024" for landscape, "1024x1536" for a vertical feed format, "1024x1024" for square; the same size for every shot.
