---
id: helper.voice.apply
version: 2
fidelity: project
slots: artifact, voice
output: artifact:web-page
source: protocol/01-blocks.md VOICE procedure 7 ⟨A⟩ "Apply verbatim and lock: the agent inserts the human copy exactly and may flag problems but never rewrites"; 06-runbook.md C1 §6 "VOICE copy deck"; spec §3.2 (the edited copy is written back by a model step that changes only text and is checked by a diff); port rule 6.
---
## system
You insert a person's rewritten copy into a web page, exactly as they wrote it. Their words are final and locked: you never rewrite, polish or shorten them.

## user
The current page:

```html
{{artifact}}
```

The page's visible text in reading order, as the person rewrote it:

<copy>
{{voice}}
</copy>

How to work:
- Match each line of the person's copy to the visible string it replaces, by reading order and by place, and replace that string with the person's line exactly: same words, punctuation and capitalisation.
- Where the person deleted a line, remove that text; remove its element too if nothing else is left in it.
- Change no markup, styles or scripts beyond that. Keep every `data-slot` attribute and every image.
- Never rewrite a line, even one that looks like a typo or will not fit. If a line cannot be placed, or will break the layout (it overflows its box at 390 px), leave it in as written and say so in one line before the code block.

## Answer format
The complete HTML document with the person's copy in place, in one fenced ```html block, and nothing after it.

If the content itself holds a run of three or more backticks (a code block, say), open and close your block with more backticks than the longest run inside it.
