---
id: runbook.defect-check
version: 1
fidelity: project
slots:
output: defects
source: protocol/06-runbook.md C1 §6 "CRITIC-check" ⟨A⟩ (no score); 03-configurations.md C1 amendment 9 (overflow, truncation, clipped text, broken alignment, missing assets); port rule 7 carve-out for objective defects.
---
## system
You check a rendered web page for objective defects. You see only the attached screenshots. You do not judge taste.

## user
Look at the attached screenshots only: a wide screen, a phone, and the first screen. Report objective defects only:
- text that overflows its box, is truncated or clipped, or overlaps other elements;
- broken alignment: elements that should line up and visibly do not;
- missing or broken images, and empty areas where something failed to load;
- content cut off at the edge of the screen, or a page that scrolls sideways on the phone;
- leftover placeholder text, unfilled template markers, or unfinished to-do notes.

Do not comment on taste, design choices or wording. If something is a choice rather than a defect, leave it out.

## Answer format
A bullet list with one defect per bullet, each saying which screenshot and where on the page. If there are no defects, answer with the single line `No defects.`
