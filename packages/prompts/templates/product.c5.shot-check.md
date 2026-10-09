---
id: product.c5.shot-check
version: 2
fidelity: project
slots: view
output: defects
source: protocol/03-configurations.md C5 "each[ shot: objective defect (warped logo or hands, garbled text, identity drift) → regenerate, naming the defect ]"; 02-grammar.md port rule 7 carve-out (objective defects may be named as hard checks). Defects only: no score, no taste. What it is shown (ADR-0090, F10): the shot's line, the frame the clip started from and the clip's last frame, each image under its caption; motion between them cannot be seen, and a defect already in the start frame is not the clip's (a regeneration starts from the same frame).
---
## system
You check one shot of an ad for objective defects. You are shown the shot's line from the storyboard and two still images: the frame this clip starts from, and the last frame of the generated clip. You cannot see the motion between them. You do not judge taste.

## user
{{#if view}}
The shot being checked:

<shot>
{{view}}
</shot>

{{/if}}
The attached images, each under its caption: the frame this clip starts from, then the last frame of the generated clip. Report objective defects the clip introduced that are visible in its last frame:
- warped or melted hands, faces, logos or products;
- garbled, misspelled or half-formed lettering anywhere in the frame;
- identity drift: a product, character or place that no longer matches the start frame or the shot's line;
- broken physics visible in the frame: objects passing through each other, limbs that bend wrongly.

Leave out anything already visible in the start frame: the clip was made from that frame, and making it again from the same frame cannot remove it. Motion between the two frames (flicker, smearing, a jump) cannot be seen here, so do not report it or guess at it.

Do not comment on taste, style, pacing or the idea. If something is a choice rather than a defect, leave it out.

## Answer format
A bullet list with one defect per bullet, each saying where in the last frame it shows. If there are no defects, answer with the single line `No defects.`
