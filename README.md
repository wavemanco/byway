# byway

byway helps you make things with AI one step at a time, the way a careful studio works: the AI drafts and gives feedback, and you make the choices and write the words that matter.

You describe what you are working on in your own words. byway suggests a way of working that fits it (byway calls these *recipes*), shows you every step and who does each one, you or the AI, and then takes you through them. At the end you take away the finished piece: a web page, a memo, a story, a set of ideas, a short video ad, or a tidied-up code change.

byway runs on your own computer, with your own AI accounts.

## What byway can help with

| Recipe | What you get |
|---|---|
| **Landing Page Studio** | Four page drafts, each started from its own random spark and revised against outside feedback. You pick one and rewrite its words yourself. |
| **Idea Generator** | Options sketched separately from random sparks, near-duplicates merged and the obvious ones flagged, laid out side by side for you to choose from. |
| **Series Writer** | One piece of your series at a time: fresh angles, your own point, a draft revised against outside feedback, and every line rewritten by you. |
| **Memo Polish** | A memo drafted from your one-line ask, read as the person receiving it would read it, trimmed by you and finished in your own words. |
| **Ad Video Chain** | A short ad built shot by shot by image and video AI, around a script you lock before anything is made. |
| **Second Reader** | You write every word; three AI readers point out what to cut, what sounds formulaic, and how it compares with strong examples. |
| **Fiction Second Reader** | Story ideas to start from; then you write every sentence while AI readers only point things out. |
| **Lean Code Review** | A code change written by AI, checked for mistakes, cut back to what the task asked for and compared with good examples, with the "why" written by you. Your own tests still decide whether it works. |

If none of them fits, byway can put together a recipe for you from the same building blocks, and it tells you when it has done so.

**A word of honesty.** These ways of working come from a published method for designing with AI, widened to other kinds of work. They have not been tested in a study yet, and byway says so on every recipe. It makes no claim that any of them works better than another way of working.

## What you need

- A Windows or Linux computer. Mac support is planned.
- Two free tools that byway runs on: [Node.js](https://nodejs.org/) version 24 or later, and [pnpm](https://pnpm.io/) version 11 or later.
- To use real AI: an account with at least one AI provider, and a key from it. byway works with Anthropic (Claude), OpenAI, Google (Gemini), OpenRouter, and fal (for video). You can try byway without any of them first.

## Try it without any AI account

In the byway folder, run:

```bash
pnpm install
pnpm demo
```

Then open http://127.0.0.1:3000 in your browser. Everything you see there is sample output: no AI is used and nothing is charged. To stop byway, press Ctrl+C in the window where it runs.

## Use it with your own AI accounts

1. **Make a key just for byway** in each provider's website, one you use for nothing else, so you can cancel it at any time.
2. **Set a spending limit** in each provider's website, or keep only a small prepaid balance there. That caps what a key can ever cost, whatever byway does.
3. **Put your keys in a file named `.env.agents`** in the byway folder. Add only the ones you have:

   ```ini
   ANTHROPIC_API_KEY=...
   OPENAI_API_KEY=...
   GEMINI_API_KEY=...
   OPENROUTER_API_KEY=...
   FAL_KEY=...
   ```

   Never share this file or put it online. byway is already set up to leave it out of its code history.
4. **Start byway:**

   ```bash
   pnpm start
   ```

   and open http://127.0.0.1:3000. Settings shows which providers byway can use, never the keys themselves.

## How byway handles money

- Before a run starts, byway shows what it expects the run to cost, and you set a budget for it. There is also an overall budget for everything you run.
- byway asks you before a run spends past its budget, and it does not go past the overall budget.
- The estimate is a careful guess, so a run can end up costing a little more than shown. Settings keeps a record of every paid step; compare it with your provider's own usage page from time to time.
- byway's prices are copied by hand from each provider's price list. Settings shows when they were last checked.

## What stays on your computer

- byway runs on your computer, and only you can open it.
- Your work, your answers and byway's records stay in byway's data folder on your computer.
- What you write and attach is sent to the AI providers you added keys for, so they can do the AI steps. Their own terms apply to it.
- Your keys are never written into byway's records, shown on screen, or sent anywhere but to the provider they belong to.

## Back up and restore

byway keeps everything in one data folder: `%LOCALAPPDATA%\byway` on Windows, and `~/.byway` on Linux.

- **To back up:** stop byway, wait until it has fully closed, and copy the whole folder somewhere safe.
- **To restore:** stop byway, then put the whole folder back in place of the current one.

Always copy the whole folder. A single file from it is not a backup, and mixing files from different backups is not supported. The [developers' guide](docs/developers.md#back-up-and-restore) has the full steps and what to check.

## Renderer (how byway draws web pages)

For web pages, byway draws each page in a locked-down copy of the Chromium browser on your computer, so a page cannot reach your files. When you start byway, it checks that this works and tells you if it does not. The usual fixes:

- **Chromium is missing.** Run `pnpm --filter ./apps/web exec playwright install chromium` in the byway folder (on Linux, add `--with-deps` before `chromium`).
- **Ubuntu 24.04 or later blocks the lock-down.** Run `sh scripts/linux/allow-chromium-sandbox.sh` in the byway folder. Read what it allows first, in the [developers' guide](docs/developers.md#the-os-sandbox).
- **You run byway inside a container.** Run it outside the container instead.

Settings lets you turn the lock-down off if nothing else works. Pages are then less contained, and byway shows a warning for as long as it is off.

## Contributing

byway is in its early days. While its foundations are still settling, it accepts pull requests only from its existing contributors.

## Licence

byway is open source under the [MIT License](LICENSE).

## For people working on byway

- [Developers' guide](docs/developers.md): how to run, test and build byway, and what it keeps on disk.
- [Decisions](docs/adr/README.md): every design decision, with who made it and why.
- [Backlog](docs/backlog.md): what is planned and open.
- [The protocol](protocol/README.md): the method byway's recipes come from.
