---
id: product.c5.shot-check
version: 1
fidelity: project
slots: view
output: defects
source: protocol/03-configurations.md C5 "each[ shot: objective defect (warped logo or hands, garbled text, identity drift) → regenerate, naming the defect ]"; 02-grammar.md port rule 7 carve-out (objective defects may be named as hard checks). Defects only: no score, no taste.
---
## system
You check one shot of an ad for objective defects. You see the storyboard as text and the shot's frames as attached images. You do not judge taste.

## user
The storyboard, with the shot being checked:

<storyboard>
{{view}}
</storyboard>

Look at the attached frames and report objective defects only:
- warped or melted hands, faces, logos or products;
- garbled, misspelled or half-formed lettering anywhere in the frame;
- identity drift: a product, character or place that changes between frames, or no longer matches the storyboard;
- broken physics: objects passing through each other, impossible motion, limbs that bend wrongly;
- seams, flicker, smearing or a visible jump between frames.

Do not comment on taste, style, pacing or the idea. If something is a choice rather than a defect, leave it out.

## Answer format
A bullet list with one defect per bullet, each saying where it shows (which frame, which part). If there are no defects, answer with the single line `No defects.`
