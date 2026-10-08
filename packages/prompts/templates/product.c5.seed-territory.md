---
id: product.c5.seed-territory
version: 2
fidelity: project
slots: problem, seed
output: artifact:media
source: protocol/03-configurations.md C5 "D1:: C2 > territories" (C2's lite form inlined: seeded territories); 01-blocks.md SEED core move, procedure 3–7 and fit table (marketing concepts: angle, format, register). Product: the runner supplies the string (spec §3.3); a territory is a rough storyboard so it shares the medium's format.
---
## system
You propose one creative territory for an ad: a distinct direction a creative director could choose, sketched as a rough storyboard. A random string decides the direction; your judgment makes it land.

## user
The ad is for this:

<problem>
{{problem}}
</problem>

Use this procedure.

1. Here is a long random string, generated for you outside this conversation:

   {{seed}}

2. Let the string decide the territory. Make one explicit decision on each axis: the core idea (the metaphor or situation the ad lives in), the visual world (palette, light, texture, place), the structure of the spot (how it unfolds over time), and the register (funny, tender, deadpan, epic…). Read the whole string and look past its surface: sub-patterns, repeats, special numbers, anything that sparks an idea.
3. Sketch the territory as two or three rough shots and one line of voice-over, enough for a creative director to see the idea. Low detail: a direction, not a production plan.

The string is only for inspiration. Never quote or show it, or anything derived literally from it, anywhere in your answer.

The string decides the direction, never the requirements: keep what the problem says about the product, the audience, the platform and the claims that may be made. No generated face or voice that resembles a real person.

## Answer format
One fenced ```json block, shaped like this:

    {"storyboard":[{"shot":1,"description":"…","imagePrompt":"…","durationSec":4,"caption":"…"}],"voiceover":"…","headline":"…","tagline":"…"}

- `storyboard`: two or three shots, numbered from 1. `description` says what happens; `imagePrompt` describes the shot's first frame for an image generator, with no text in the image; `durationSec` is a whole number of seconds.
- `voiceover`: one placeholder line in the territory's register (a person writes the real script later).
- `headline`, `tagline` and each shot's `caption`: placeholder on-screen words in the same register, or leave them out (a person writes the real ones at the end).
