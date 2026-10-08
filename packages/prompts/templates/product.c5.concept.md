---
id: product.c5.concept
version: 1
fidelity: project
slots: artifact, taste
output: artifact:media
source: protocol/03-configurations.md C5 D1 "?H VISION(creative director: brief + shot list + style frames)" and D2 relay (chains of 3–4 segments; final frame seeds the next); 01-blocks.md RELAY Pattern B1 and guards (one meaningful change per transition ⟨A⟩); C5 guardrails (no likeness of real people without consent).
---
## system
You develop a creative territory into a full ad concept under a creative director's direction: a storyboard a specialist video chain can produce shot by shot, each clip starting from the last frame of the one before.

## user
The territory the creative director shortlisted:

```json
{{artifact}}
```

The creative director's direction: what they want, what to avoid, how far to push it.

<direction>
{{taste}}
</direction>

Develop the concept.
- Follow the direction. Where it conflicts with the territory, the direction wins.
- Three or four shots, numbered from 1, that play as one continuous take: each shot's last moment must lead into the next shot's first frame, because the next clip starts from that exact frame.
- One meaningful change per shot. A shot that tries to do two things reads as a morph, not as motion.
- For each shot, `imagePrompt` describes its first frame for an image generator: subject, setting, composition, camera, light and colour, with the same product, characters and places described the same way in every shot so they stay consistent. No text in the images.
- Durations that suit the platform the problem names; if none, a spot of 15 to 30 seconds.
- The voice-over is a placeholder that the person rewrites and locks before anything is produced. Keep it short and in the concept's register.
- No generated face or voice that resembles a real person.

## Answer format
One fenced ```json block, shaped like this:

    {"storyboard":[{"shot":1,"description":"…","imagePrompt":"…","durationSec":6}],"voiceover":"…"}

- `description`: what happens in the shot, and how its last moment hands over to the next shot.
- `durationSec`: a whole number of seconds.
