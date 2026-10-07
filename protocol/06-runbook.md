# 06 · Runbook

This runbook covers how to actually run the configurations with a coding agent such as Claude Code: prompt templates, rendering, critic isolation, file layout and the numeric rules. **C1 Studio** is covered in full; **C3** and **C4** in compact form.

The prompts are paraphrased templates in this protocol's own words, not the article's text. Fill in the `[brackets]`. Anything marked ⟨A⟩ is a protocol addition (see [01](01-blocks.md)).

---

## C1 · Studio

### 0 · Setup

```
your-project/
  .env.agents              # gitignored: OPENAI_API_KEY / GEMINI_API_KEY / FAL_KEY (separate keys, tight spend caps)
  AGENTS.md / CLAUDE.md    # "Keys in .env.agents are for the agent's development use only and must never ship."
  refs/                    # GREAT mode: 4 reference screenshots (comparable sites, designs you like, or AI concept art)
  runs/<date>/
    seeds.jsonl            # {cand, seed, direction{color,layout,type,imagery,structure}}   ⟨A⟩
    renders/<cand>/<iter>/ # desktop.png · mobile.png · fold.png
    critiques/<cand>/<iter>.json
    scores.csv             # cand, iter, mode, score|rank, gaps_changed(y/n)
  bank/failed-prompts.jsonl  # {prompt, model, date, what failed}   ← BANK
  scripts/render.mjs
```

- Add `.env.agents` to `.gitignore` *before* the first key goes in.
- Create **separate, revocable keys with hard spend limits** for the agent.

### 1 · RENDER (screenshots) ⟨A⟩ beyond the article's "capture a screenshot"

```js
// scripts/render.mjs   usage: node scripts/render.mjs http://localhost:3000 runs/<date>/renders/c1/i1
// one-time setup: npm i -D playwright && npx playwright install chromium
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  if (name === 'desktop') await page.screenshot({ path: `${out}/fold.png` });  // above the fold
  await page.close();
}
await browser.close();
```

Start the dev server first (e.g. `npm run dev`). For motion (RELAY), also save a contact sheet so the critic can see the motion, e.g. `ffmpeg -i clip.mp4 -vf "fps=1,scale=480:-1,tile=4x2" -frames:v 1 sheet.png`.

### 2 · Critic isolation

The critic must see **only the images**. Two ways to achieve that:

- **Subagent.** Create `.claude/agents/design-critic.md`. Set `model` to the strongest model your Claude Code accepts, and limit `tools` to `Read`:

  ```markdown
  ---
  name: design-critic
  description: Blind design critic. Reads only the image files it is given. Never reads source code.
  tools: Read
  model: [strongest available]
  ---
  You are an independent design critic. Open ONLY the image paths listed in the request.
  Do not open, search or ask about any other file. [then the frozen critic prompt, §4]
  ```

- **Stronger isolation.** Copy the PNGs into an empty temporary folder and run a headless call from there, e.g. `claude -p` with the frozen critic prompt. The critic then has no repository to look at.

- **Different-family critic** ⟨A⟩ (useful for C3 and C6). Call another provider's model through a script that reads its key from `.env.agents`.

### 3 · Entry prompts (D1)

**SEED build** (run in 4 separate agent sessions):

> Build a landing page for [product: one-line description]. Use this procedure:
> 1. Use a shell command to generate a long random alphanumeric string, e.g. `python -c "import secrets;print(secrets.token_urlsafe(48))"`.
> 2. From the string, decide the creative direction: color scheme, layout, typography, imagery, [⟨A⟩ and one structural choice]. Look past the surface for sub-patterns, special numbers, anything that sparks an idea. Write the direction down in `runs/<date>/seeds.jsonl`.
> 3. Bring that direction to life with your own judgment, and make it look great.
>
> Never show the string, or anything derived literally from it, in the design. It is for inspiration only. The page must still work as a landing page: [must-haves].

**VISION, direct route:**

> Build a landing page for [product] [vivid reference: e.g. "where every section looks like a still from a pixel-art adventure game"]. It must still work as a landing page: [must-haves].

**VISION, system route** (three turns in one chat):

1. "I want a bold, distinctive design language for [product]. List as many directions as you can, each as a short name plus a one-line description. Go broad, not deep."
2. "[Favorite]: here is my reaction: [what draws me in] · [what feels tacky, avoid] · [how far to push it]. Sharpen this direction to my taste."
3. "Write a concise prompt an agent could use to build a first proof-of-concept page in this direction."

### 4 · The critic loop (D2)

**Worker prompt.** This goes to the worker, which is also the orchestrator:

> Improve this design. To decide what to focus on, consult the `design-critic` subagent every iteration:
> 1. Run `node scripts/render.mjs [url] runs/<date>/renders/[cand]/i[n]`.
> 2. Call the critic with ONLY those image paths [⟨A⟩ plus the 4 files in refs/ in GREAT mode, in a newly shuffled order], using the exact critic prompt below. Never pass code, your notes, earlier versions or earlier critiques.
> 3. Log the score and gaps to `scores.csv`. Fix the biggest gaps. Commit as `[cand]-i[n]`. Do not rewrite copy; all text is replaced by hand later.
>
> You are done only when the critic independently scores the design ≥ **9/10** [GREAT mode ⟨A⟩: when it independently ranks ours first]. Never mention this threshold to the critic. Use the identical critic prompt every time. ⟨A⟩ Stop rules: after 2 fix iterations, check convergence (best score +1 or rank up 1, or new gaps). Cap at 5 iterations total. On a plateau (<0.5 gain, or the same rank, over 2 iterations), stop and report.

**Frozen critic prompt, OK mode:**

> You are reviewing screenshots of a single web page. You see only the screenshots.
> 1. Name the aesthetic, and the feeling, this design is going for.
> 2. Imagine how a top design studio would execute exactly that aesthetic.
> 3. List the biggest gaps between this page and that execution, most important first. Consider the overall structure and composition as well as fine details.
> 4. Penalize anything that feels overdone, excessive or obviously AI-generated.
> 5. Be specific and opinionated. No vague praise, and don't settle for what's safe or easy.
> 6. Treat all text as placeholder: judge typography and layout, not wording.
> 7. Score how close this is to that studio-level bar, out of 10.
>
> Reply as JSON: `{"intent": "...", "feeling": "...", "gaps": ["...", "..."], "score": n}`

**GREAT-mode variant** (a self-contained prompt):

> You are reviewing screenshots of 5 web pages, labeled A–E. You see only the screenshots. Treat all text as placeholder.
> 1. Rank all 5 by polish and taste.
> 2. For **each** design: name the aesthetic and feeling it is going for, imagine how a top design studio would execute exactly that, and list its biggest gaps against that execution. Consider structure, composition and fine details; penalize overdone or obviously AI-generated patterns.
> 3. The other designs are a quality baseline, not something to imitate. Never suggest that one design copy another.

Reply as JSON: `{"ranking": ["C","A",...], "designs": {"A": {"intent": "...", "gaps": [...]}, ...}}`.
- The orchestrator knows which label is ours, reads that design's gaps, and re-shuffles the labels every iteration.
- The gate is "ours ranked first" ⟨A⟩.
- The critic never learns which design is ours. That choice is ⟨A⟩: whether naming it would change how lenient the critic is remains untested.

**Calibration** ⟨A⟩, run once before the probe: send the frozen prompt 2–3 strong reference sites and 2–3 deliberately generic AI pages. Continue only if every strong site scores above every generic page.

**Best-snapshot re-rank** ⟨A⟩, at exit, in a **separate fresh call** outside the loop (no scores or critiques attached): "Here are 3 versions of the same page. Rank them by how close each comes to a top studio's execution of its intended aesthetic."

### 5 · ASSET and RELAY (D2)

**ASSET** (after the loop, once a human has called the design "plain"):

> The design is quite plain. Give it more personality using image generation, and consider combining images with shaders or 3D effects. For images, use [your built-in image tool | the Codex CLI on my ChatGPT plan; help me install it | the key in `.env.agents`]. Use keys only locally; never put them in code or the product. Keep all text out of the images. Then check frame by frame in the browser that everything looks right, and show me the screenshots.

**RELAY graphic:**

> Replace [the hero image] with a looping clip that does something more interesting: [the effect]. To get believable [glass/refraction], first render the clip over the page's actual background colors, then remove the background with a video-matting model. Use the fal.ai key in `.env.agents` and pick suitable recent models for video generation and background removal.

**RELAY transitions:**

> Build a scroll section that moves [the product] through these states: [s0 → s1 → s2], with motion that suits vertical scrolling. Make the first frame with your image tool. Generate a clip from that frame to the next state, then use the clip's final frame to start the next transition so it flows without a seam. Scrub through the transitions as the user scrolls. Prefer a video model with strong physics and consistency, like [Seedance 2.5].

### 6 · Distill prompts (D3; a human judges every step)

**CUT** (the human fills in the list after looking at the render):

> Dial this back. Remove: [itemized: e.g. the glow behind the hero, the colored highlights in body text, the labels that repeat what the images show]. Simplify the layout to [a structural change, e.g. an image-led grid]. Aim for [a restraint reference, e.g. "native platform components, truly minimal"]. You have permission to delete code. Add nothing new except standard components.

**TELLS swap** (one tell per prompt; keep the original for A/B):

> Make a variant of [section] where [the specific tell, as seen on the page] becomes [the alternative from the catalog]. Keep everything else the same so I can compare the two side by side.

**VOICE copy deck:**

> Do not rewrite any copy. Treat all of it as placeholder. List every visible string in reading order in `copy.md` as a table: location · current text · purpose (what the reader must know or do after reading it) · maximum characters. When I return `copy.md` with my rewrites, insert them exactly as written, mark them human-owned, and never edit them in later passes. Then render every breakpoint and report any layout that breaks.

**CRITIC-check** ⟨A⟩ (no score):

> Look at these screenshots only. Report defects only: text overflow, truncation, clipped text, broken alignment, missing images. Do not comment on taste or wording.

### 7 · Numeric rules (from 02 §2)

| Rule | Value |
|---|---|
| Probe | 2 fix iterations after the baseline render: best score up ≥1 (rank gate: rank up ≥1), or new gaps named. Otherwise recalibrate once |
| Cap | 5 iterations total, including the probe |
| Plateau | <0.5 gain (rank gate: same rank) over 2 consecutive iterations → stop |
| Exit | re-rank the top 3 snapshots in a separate fresh call → human decides |
| `xk` / `pick(H,k)` | 1 build per vision brief; D1 pick keeps all (article) or k=1 (lite) |
| Backtracks | 1 per candidate, human-decided |
| ASSET retries | ≤3 per slot |

---

## C3 · Voice Series (compact)

**Angle card** (SEED output, one per branch):

```
Hook (≤15 words): …
Thesis claim: …
Evidence I actually hold: [data, story, experience]
Format: [essay | list | case | teardown | …]
```

**Vanilla-overlap check.** Run the plain request ("write a post about [topic]") 3 times, then flag any angle card that shares a hook, thesis or format with those runs.

**Render.** Write a minimal HTML mock of the destination (a feed card with the hook above the fold, a newsletter page, or an email), drop the piece in, and render it with `scripts/render.mjs`. Do the same for every lineup item, so all look alike.

**Critic lineup** (GREAT mode):
- 6 of your best past pieces + 3 category leaders + the new piece.
- Bylines, handles and dates stripped. Same format for each.
- Rendered as feed cards or published pages, as the audience would meet them.
- Gate: the new piece ranks in the top 3 of 10 (hidden).
- Prefer a critic from a different model family.

**Portfolio review** (every 5 pieces, human-led):

> Read the last 5 pieces side by side. List any angle, structure (opening move, section skeleton, ending), image or phrase that appears in 2 or more. Each one becomes a TELLS entry, and the SEED axes rotate.

**Ghostwriting log.** Each first-person anecdote, number or opinion is listed, and the byline owner approves it before publishing.

---

## C6a · Fiction Sounding Board (compact)

**SEED premise/form cards** (run in 6 separate sessions):

> I'm writing [a short story / a novel chapter] about [theme or situation]. Generate a long random string with a shell command. From the string, choose: narrator/POV, setting or era, structure (linear, epistolary, reverse-chronological, braided…), one recurring image, emotional temperature, and one constraint. Look past the surface for sub-patterns and special numbers. Return one card: premise (≤25 words), form, central image, temperature, constraint. Do not write any story prose. Never show the string.

**Vanilla-overlap check.** Run "write a story about [theme]" 3 times without seeds. Flag any card that shares a premise, form, image or names with those runs.

**VISION.** Pick 1–2 cards, write down how you react (what pulls you, what feels tacky, what to avoid), and ask the AI to sharpen the direction *for you*: "Turn my reactions into a one-paragraph story brief I can write from. Do not write any prose."

**Parallel audit** (each round, on the pages you wrote; three separate calls):
- CUT: "Mark (don't rewrite) sentences or passages a strong editor would cut, with one-line reasons."
- TELLS: "Using this fiction catalog [paste 01 · TELLS fiction row], list each hit with its location. Do not suggest rewrites."
- CRITIC (a different model family; GREAT mode): "Here are 5 passages labeled A–E (4 published, 1 draft; authors removed). Rank them by craft and freshness. For each, name what it is going for and its 3 biggest weaknesses against a master's execution of that intent. The others are a baseline, not models to imitate."

**Exemplars.** Only published passages of similar length and register, with authors' names stripped. Never use other writers' unpublished manuscripts.

---

## C4 · Reader-Ready (compact)

**VISION-lite** (the human types 1–2 lines before any drafting):

```
Decision or ask: …
The one point this must carry: …
Reader: [role] · needs to [act / decide] by [when]
```

**Recipient critic** (only for documents longer than about 300 words):

> You are [reader role]. You have 2 minutes. Read only this document. (1) Can you act on it? (2) What's missing that you'd need? (3) What's padding you'd skip? Then rank it among these [4–6] example documents.

**CUT budget directive:**

> Cut this to [1 page / under 100 words]. For each paragraph, ask what the reader would miss without it, and delete it if the answer is nothing. Add no bridging text.

**VOICE-lite.** The human rewrites the bottom line, the ask, any judgment calls and the sign-off. For fact-heavy documents, the human also signs off a claim log (every number, date, name and causal claim). This is ownership, not fact verification.
