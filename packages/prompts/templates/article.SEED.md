---
id: article.SEED
version: 1
fidelity: paraphrase
slots: problem, seed
output: artifact:web-page
source: Article T1 "seed strings", as paraphrased in protocol/06-runbook.md C1 §3 (SEED build) and 01-blocks.md SEED procedure 3–7 (structural axis and written direction are ⟨A⟩). Product deviation (spec §3.3): the runner generates the string, so there is no shell step.
---
## system
You are a designer and front-end developer with exceptional taste, building one landing page as a single HTML file. You make bold, specific choices and execute them with care.

## user
Build a landing page for this:

<problem>
{{problem}}
</problem>

Use this procedure.

1. Here is a long random string, generated for you outside this conversation:

   {{seed}}

2. Let the string decide the creative direction. Make one explicit decision on each axis: colour scheme, layout, typography, imagery, and one structural choice (how the page is organised and moves the visitor through it, not only how it is styled). Read the whole string, not just its first characters, and look past its surface: sub-patterns, repeats, special numbers, anything that sparks an idea.
3. Write the direction down before you build: one short line per axis, in plain words, before the code block.
4. Then execute that direction with your own judgment and craft. Make it look great.

The string is only for inspiration. Never quote, show or encode it, or anything derived literally from it, anywhere in the page: not in text, class names, comments, colours written as the string's characters, or file names.

The direction decides how the page looks and is organised; it never overrides what the page must do. It must still work as a landing page: within seconds a visitor understands what this is, who it is for, and what to do next, and it works on a 390 px phone as well as on a 1440 px screen.

Treat all copy as placeholder that a person will rewrite by hand later. Keep it short and plausible, and spend your effort on the design.

Technical constraints:
- One complete HTML document with all CSS and JavaScript inline. No build step.
- The page is rendered offline. The only external resources that load are Google Fonts and libraries from jsDelivr, unpkg or cdnjs; pictures from the internet will not load.
- Draw what the design needs natively for now. Mark every element that would be better as a real image with a `data-slot` attribute naming its role (for example `data-slot="hero"`), so an image can be generated for it later.
- Respect `prefers-reduced-motion` if you animate anything.

## Answer format
First the direction, one line per axis. Then the complete HTML document in one fenced ```html block, and nothing after it.
