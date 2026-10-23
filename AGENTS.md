# Notes for agents working on byway

These are for any coding agent, whichever model or provider runs it. The owner keeps byway's upkeep from being tied to
one provider (2026-10-22), so nothing here needs a particular one; a person can follow the same steps. `CLAUDE.md` only
imports this file.

byway's records say what is decided and what is open: `docs/playbook.md` (the duties and the owner's working rules),
`docs/backlog.md` (open work, each row with its trigger) and `docs/adr/` (the decisions, with `docs/adr/README.md` as
their index).

## Keys

The provider keys in the gitignored `.env.agents` file (or the environment) are for development only and must never
ship (ADR-0009). Never read that file, and never print, store, log, commit or render a key; tests use fakes.

## At the start of a session: is the price table due for a re-read?

byway's caps and recorded costs are only as true as its price table, `packages/gateway/src/prices.ts`. The owner chose a
weekly CI report, a monthly re-read and a date in the app (2026-10-21), and a check at the start of each session
(2026-10-22). So, before other work:

1. Read `PRICES_CHECKED` in `prices.ts`, the day of the last full re-read, and the latest weekly price report: the step
   "Do the providers' pages still give byway's prices?" of the scheduled `verify` run on main
   (`gh run list --workflow verify.yml --event schedule --limit 1`, then `gh run view <id> --log`).
2. A re-read is due when `PRICES_CHECKED` is 30 days old or more, or when that report flagged a figure or a page.
3. To re-read:
   - run `node scripts/price-report.ts` (plain Node; it reads no key) to see which recorded figures the providers' pages
     still give and which they do not;
   - open each row's `source` page in `prices.ts` and compare every figure the row records; look for new charges, tiers
     or models too;
   - change the rows that changed, each with its page and the day you read it, and set `PRICES_CHECKED` to that day;
   - on a branch, run `pnpm verify`, and give the change to the owner as for any change to the money path.
4. A page you cannot read is said, never guessed: no figure is written that a provider's page does not give.

This needs a model with web access, from any provider, or a person. Until a re-read lands, estimates and recorded costs
use the table as it is, and Settings shows how long ago prices were checked, with a notice after about 45 days.

At a session's start, also read that week's Playwright pin report beside the price report: the step "Is the Playwright
pin behind npm's latest release?" of the same scheduled run (Claude's proposal, from the backlog row "Nobody reads the
weekly Playwright pin report"; the cadence it serves is ADR-0110's).

## Before a first live run of a new kind

Before the first live run, the first run that makes an image, the first live C5 run and the first run on Best or
OpenAI, go through the "Launch checklist" section of `docs/backlog.md` with the owner. The owner asked for the
checklist on 2026-10-22 at 22:49: "file it somewhere so that it surfaces to me for checks otherwise we will forget it.
Maybe a Launch Checklist within Backlog."

## Checks that clone the repository

A check of the local repository works in its own clone, made with `git clone --no-local`, which copies only the commits
the repository's branches and tags reach. Never use a plain local clone or `--no-hardlinks`: they copy the whole object
store, commits that history rewrites replaced included, and those can hold details the owner asked to keep out of
byway. Delete the clones once the check no longer needs them. The rule comes from the owner's answer of 2026-10-22,
"Delete them after the re-check (Recommended)" (ADR-0107's Later note of 2026-10-22 quotes it).
