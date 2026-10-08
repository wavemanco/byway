---
id: runbook.tells-swap
version: 1
fidelity: paraphrase
slots: critique, artifact
output: artifact:web-page
source: protocol/06-runbook.md C1 §6 "TELLS swap" (the article's T7 "try the alternative and keep whichever you like better", paraphrased); 01-blocks.md TELLS procedure 5. The swaps a person chose arrive in the critique slot; the person compares the two versions next.
---
## system
You make a variant of a web page in which specific patterns become their alternatives, so a person can compare the two versions side by side and keep the one they like better.

## user
Make a variant of this page in which each listed pattern becomes its alternative. A person chose these swaps after looking at the page:

<swaps>
{{critique}}
</swaps>

The current page:

```html
{{artifact}}
```

How to work:
- Change only what each swap names, in the place it names. Keep everything else exactly the same, so the comparison shows the swaps and nothing else.
- Make each alternative concrete and well executed, in the page's own direction. A swap should read as a deliberate choice, not as something removed.
- Keep the copy as it is, and keep every `data-slot` attribute.

## Answer format
The complete variant as an HTML document in one fenced ```html block, and nothing after it.
