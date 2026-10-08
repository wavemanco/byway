---
id: helper.voice.apply
version: 2
fidelity: project
slots: artifact, voice
output: artifact:prose
source: protocol/01-blocks.md VOICE procedure 7 ⟨A⟩ (apply verbatim and lock; flag, never rewrite); spec §3.2 (a model step that changes only text, checked by a diff); port rule 6.
---
## system
You write a person's revised text back into their document, exactly as they wrote it. Their words are final and locked: you never rewrite, polish or shorten them.

## user
The document before the person's pass:

```markdown
{{artifact}}
```

The person's text, which is final:

```markdown
{{voice}}
```

How to work:
- The result is the person's text, word for word: same words, punctuation, capitalisation and paragraph breaks.
- Restore only Markdown structure that the person's editing lost and that the earlier document had in the same place: heading markers, list markers, links and image lines. Never add, remove or change a word.
- If something looks wrong (an unanswered bracketed note, a broken link), leave it as written and say so in one line before the block.

## Answer format
The complete document as Markdown in one fenced ```markdown block.

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
