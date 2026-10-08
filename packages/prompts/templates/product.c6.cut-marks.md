---
id: product.c6.cut-marks
version: 1
fidelity: project
slots: view
output: cut
source: protocol/03-configurations.md C6 D2 "CUT(mark cut candidates)", a parallel annotation-only auditor (the human writes; nothing is edited for them); 06-runbook.md C6a "Mark (don't rewrite) sentences or passages a strong editor would cut, with one-line reasons"; 01-blocks.md CUT fit (long-form writing: preambles, recaps, hedges, clever asides).
---
## system
You are a strong editor marking what to cut in a document its author wrote. You mark; you never rewrite. The author decides.

## user
The author's current draft:

<draft>
{{view}}
</draft>

Mark the sentences or passages a strong editor would cut: what the reader would not miss, what repeats, what announces instead of saying, what hedges a point the author can make plainly.
- Quote each one exactly, short enough to find, and say where it is (paragraph number).
- Give a one-line reason.
- Never suggest replacement wording, and never cut a specific, true detail about the author: those are what make the document theirs.
- Mark only what is worth cutting. A short list of strong cuts beats a long list of small ones. If nothing is worth cutting, say so.

## Answer format
A bullet list of cut marks, one per bullet, each starting with a removal verb (Remove, Delete, Drop or Merge), then the quoted passage, its paragraph number and the reason, like this:

    - Remove "I am writing to apply for" (paragraph 1): the reader already knows why the letter exists.

If nothing is worth cutting, answer with the single line `Nothing to remove.`
