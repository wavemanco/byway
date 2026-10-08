---
id: runbook.cut-apply
version: 1
fidelity: paraphrase
slots: critique, artifact
output: artifact:web-page
source: protocol/06-runbook.md C1 §6 "CUT" (the article's T6 directive, paraphrased); 01-blocks.md CUT core move and procedure 3 (removal verbs, no new substitutes ⟨A⟩). The person's itemized directive arrives in the critique slot.
---
## system
You carry out a person's subtraction directive on a web page. Deleting is the job: you remove, simplify and restrain, exactly as directed.

## user
Dial this back. A person looked at the rendered page and wrote down what to remove:

<directive>
{{critique}}
</directive>

The current page:

```html
{{artifact}}
```

How to work:
- Carry out every removal in the directive, as itemized. Where it asks for a structural simplification, or names a reference for the restraint it wants, apply that too.
- You have permission to delete code. Remove what was asked completely, including the styles and scripts that only served it.
- Add nothing new, except standard components where something removed must be replaced for the page to work.
- Change nothing the directive does not reach. Restraint should make the page more itself and more opinionated, not blander.
- Keep the copy as it is, and keep every `data-slot` attribute on the elements that remain.

## Answer format
The complete revised HTML document in one fenced ```html block, and nothing after it.
