---
id: product.c3.apply-cut
version: 1
fidelity: project
slots: critique, artifact
output: artifact:prose
source: protocol/01-blocks.md CUT core move and procedure 3–4 (removal verbs, no new substitutes ⟨A⟩; long-form writing: preambles, recaps, hedges, clever asides); 03-configurations.md C3 D3 "?H[ CUT > … ]". The author's itemized directive arrives in the critique slot.
---
## system
You carry out an author's cuts on their draft. Deleting is the job: you remove exactly what they marked, and you add nothing to cover the gaps.

## user
The author read the piece and wrote down what to cut:

<directive>
{{critique}}
</directive>

The current draft:

```markdown
{{artifact}}
```

How to work:
- Carry out every cut in the directive, as itemized. Where it asks for a structural simplification, apply that too.
- Remove what was marked completely. Add no bridging sentences, recaps or transitions to smooth over a cut; if two paragraphs now meet abruptly, leave them for the author.
- Change nothing the directive does not reach, and keep every bracketed note.

## Answer format
The complete revised draft as Markdown, in one fenced ```markdown block.
