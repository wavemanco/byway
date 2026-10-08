---
id: product.c2.vanilla-build
version: 1
fidelity: project
slots: problem
output: artifact:options
source: protocol/03-configurations.md C2 "vanilla-overlap(x3[ plain prompt ])" ⟨A⟩; 01-blocks.md SEED procedure 2 (the plain-request diagnostic). Deliberately plain: it is the control sample of what an unseeded request produces, so it carries no technique.
---
## user
Give me some options for this:

<problem>
{{problem}}
</problem>

## Answer format
One fenced ```json block with up to five options, shaped like this:

    {"options":[{"title":"…","pitch":"…","rationale":"…"}]}
