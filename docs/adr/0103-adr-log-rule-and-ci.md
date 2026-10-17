# ADR-0103: The decision log's rule is checked against git history, and CI runs `pnpm verify` on Windows and Linux, reporting only

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User (the owner approved D4 on 2026-10-16: "proceed", Windows and Linux only, macOS later) |
| **Date (local, UTC−7)** | 2026-10-16 22:00 |
| **Track** | Process |
| **Related** | [ADR-0001](0001-record-architecture-decisions-as-adrs.md), [ADR-0041](0041-shared-engine-pinned-research-versions.md), [ADR-0055](0055-instrument-firewall-and-exposure.md), [ADR-0057](0057-tamper-evident-record-and-disclosure.md), [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md), [ADR-0060](0060-repository-byway-private-remote.md), [ADR-0068](0068-contracts-first-parallel-build.md), [ADR-0100](0100-corrections-found-by-the-final-re-check.md) |

## Context

Until this record, nothing ran byway's checks automatically. `pnpm verify` (the typecheck, the unit tests, then the browser tests) was run by hand before merging, and the README said no CI service ran it. The suite had only ever run on Windows, although the README said "Windows, macOS and Linux".

Several records said "a CI check" does what only that manual command did:

- CR14 ([ADR-0057](0057-tamper-evident-record-and-disclosure.md)): "Accepted ADRs are append-only: CI fails any edit to their Context or Decision sections". Nothing checked this.
- [ADR-0055](0055-instrument-firewall-and-exposure.md): "A CI import check blocks product code from importing these instruments".
- [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md): a claims linter "in site and docs CI", "A CI import check in product code", and release CI.
- The product spec, §4 (a claims scan of `apps/web`) and §6 (the import boundary).
- [ADR-0068](0068-contracts-first-parallel-build.md)'s merge gate: "Branches are merged into `main` only when all tests and the typecheck pass."

A read of main's history found:

- One edit to an Accepted record after it reached main. ADR-0100's Decision item 7 was rewritten in f69b3da, 56 seconds after the merge 1cef8d0 that brought the record. It was a merge race: the code fix 730ebc7 reached main in 4559fe8 at 05:53:13, and ADR-0100 arrived 14 seconds later, so its item 7 was already false on arrival. Both commits reached GitHub in the same push.
- [ADR-0041](0041-shared-engine-pinned-research-versions.md) reads Accepted, but its Decision opens "Proposed, not decided." Six files cite "ADR-0041 rule 3".
- 49 of the 90 commits on main's first-parent history at 7ce21cb are direct commits, not merges, and 25 of them edit the decision index. A rule to run `pnpm verify` "before merging" never covered them. ADR-0100's edit came in that way.
- None of the 31 "changed by" links in the index was added in the same commit as the record that makes the change; each came in a later commit.

The D4 brief offered four options: keep the honour system; protect main and add a local history test; that plus a Windows CI job that reports and blocks nothing (recommended); or the full design, with a blocking check, a Linux job and structured relation rows in every record. Its skeptic kept the recommendation and added: a check for Accepted records that still read as proposals, the dependency on `--no-ff` merges, a rule that the accepting commit may finalise a Decision, a reader for red runs (`gh run list`), a weekly run, tag protection, and an honest account of what a ruleset on a private repository does.

The owner's answers on 2026-10-16. On D2 (the renderer's sandbox, which needs Linux): "go with revised design but only Windows and Linux for now. MacOS later (so you might want to make certain accommodations now for that)." On D4, asked as "the CI and branch-protection plan; the Linux and macOS runs above would be its first use": "proceed. but remember my earlier point: no macOS for now."

## Decision

### 1. The log's rule

1. **Final on main.** A record's Context and Decision are final once it reaches main's first-parent history as Accepted. Main's first-parent history is the chain of commits made on main itself: each direct commit, and the merge commit of each merged branch. The header table (its Status row included) and the other sections may change, and notes may be appended as new sections. A changed decision is still recorded in a new ADR (CR14).
2. **Merge branches with `--no-ff`.** A branch's own commits are drafts: a record may be revised on its branch before the merge. A fast-forward would put the branch's commits on main's first-parent history, and each of them would then count.
3. **The accepting commit may finalise the Decision.** The text is fixed as it stands in the first first-parent commit in which the record reads Accepted. The commit that changes a record from Proposed to Accepted should also remove its proposal wording ("Proposed, not decided."). ADR-0034 to ADR-0038 are due for acceptance before Stage 0.
4. **The "changed by" link comes in the same commit.** A record that corrects, supersedes, amends or extends an Accepted one reaches main in the same commit as the index's "changed by" link to it. For a branch, either add the index row and the links in the branch's last commit, or merge with `git merge --no-ff --no-commit <branch>`, add them, then commit. An index commit made after the merge breaks the rule. The rule applies from this record on.

### 2. The check

`scripts/test/adr-records.test.ts`, with `scripts/test/adr-log.ts`, runs in `pnpm vitest run` and so in `pnpm verify`. It reads main's first-parent history up to where the checked-out commit meets main (`refs/heads/main`, or `refs/remotes/origin/main` in a CI checkout of another branch), and it reads the files in the working tree, so an edit fails before it is committed. It fails when:

- an Accepted record's Context or Decision changed after the record reached main as Accepted, or the record was removed;
- from ADR-0103 on, a "changed by" link first appears in a different commit from the record it names;
- an Accepted record's Decision opens with "Proposed";
- an index row's status differs from its record's header; a "changed by" link names a record that does not exist, reached main before the record it changes, or does not name it; or a record on main has no index row.

The known exceptions are named in the test, each with its reason. An exception that matches nothing fails, so the list cannot go out of date.

- **ADR-0100's edit in f69b3da** is kept. Restoring item 7 and appending a note after it was considered and rejected: the restored sentence would be false on main. Its text after f69b3da is fixed like any other.
- **ADR-0041's proposal wording** stays, with the note in §7.

The check needs the whole history. A shallow clone fails with a message saying so. On this repository the history scan takes about 150 ms. With its temporary-repository cases (an edited Decision fails, an appended note passes, a draft revised on a `--no-ff` branch passes and the same branch fast-forwarded fails, a named exception lets one edit through, a late link fails), the file takes about 1 s on GitHub's Linux machine and 7 to 11 s on Windows, where starting git is slower.

It cannot see a missing "changed by" link: no record says, in a form a test can read, which records it changes. It sees a fast-forward only through the edits that then show up on main.

### 3. CI, reporting only, on Windows and Linux

- **What runs.** `.github/workflows/verify.yml` runs `pnpm verify` on GitHub's `windows-2025` and `ubuntu-24.04` machines.
- **When.** On every push to main, by hand (`workflow_dispatch`), and weekly (Mondays 06:17 UTC). The tests download Chromium and the Temporal CLI, so the weekly run catches a broken download in a week with no pushes. A newer push cancels a run still going on the same branch.
- **Pinned.** Node 24.13.1 (`.node-version`) and pnpm 11.12.0 (`packageManager` in package.json), the versions on the owner's machine; every third-party action by commit SHA. npm marks pnpm 11.12.0 deprecated as a broken release (its standalone build, `@pnpm/exe`, shipped without a binary), and pnpm's own installers refuse it. CI installs the npm package with npm, as the owner's machine has it, and that package runs. Moving the pin is in the backlog.
- **Locked down.** A read-only token, not kept after checkout, and no secrets. The browser tests use stand-in keys and fail if one leaks, so a run never reaches a paid provider.
- **Reporting, not blocking.** A red run puts a red mark on the commit, and GitHub notifies the account that pushed it (for the weekly run, the account that last changed its schedule). Nothing is refused. Agents push with the owner's account, so the notice reaches the owner, who has asked not to be drawn into administration; the reader is whoever merges next. Before merging a branch or pushing to main, check the last run on main: `gh run list --branch main --limit 1`. A red main is fixed, or a flaky test is named and set aside, before more merges.
- **Linux needs two things set up** besides Chromium's system libraries, both in the Linux job only:
  - **Noto CJK in place of WenQuanYi Zen Hei.** Playwright's Linux dependencies make WenQuanYi Zen Hei the fallback font for Japanese. With it, Chromium lays out the first item of a vertical row at no height, so one renderer test (a vertical Japanese page in `packages/runner/test/voice.test.ts`) reads a page no person would see. With Noto CJK, which Ubuntu's desktop ships, or IPAGothic, the page lays out as it does on Windows with Yu Gothic.
  - **An AppArmor profile for Playwright's Chromium.** Ubuntu 23.10 and later restrict unprivileged user namespaces, which Chromium's OS sandbox needs; the runner has `kernel.apparmor_restrict_unprivileged_userns = 1`. One renderer test (`packages/runner/test/pages.test.ts`, F18) starts Chromium inside its sandbox as a control. A profile that allows user namespaces for Playwright's Chromium binaries only lets both the headless shell and full Chromium start inside their sandbox, while the rest of the machine stays restricted. The renderer's own sandbox stays off, as before.
- **No code needed changing.** The code that had never run on Linux works there unchanged. `scripts/e2e.ts` starts byway through `scripts/serve.ts` and stops it over the IPC channel, as on Windows, and the suite ends "byway stopped cleanly"; their SIGTERM and SIGKILL fallbacks, which run only when a clean stop fails, were not needed. `apps/web/test/dev-server.real.test.ts` lists the process tree's listeners with `ps` and `lsof` and finds only the guarded port. Windows behaviour is unchanged.
- **macOS later.** The job matrix has one entry per operating system, and each step reads only its own entry; the two Linux-only steps are marked so. macOS is one more entry (`macos-15`, with `playwright install chromium`). Until it runs, byway does not claim macOS.

### 4. Supported platforms

Windows and Linux, the systems CI runs on. macOS later. The README says so, and a test holds the README's claim to the workflow's job matrix.

### 5. What "CI" means in the older records

- CR14's "CI fails any edit to their Context or Decision sections" is the check in §2, which CI runs on every push to main. It reports a failing edit; it does not refuse the push.
- The "CI import check" of [ADR-0055](0055-instrument-firewall-and-exposure.md) and [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md) is `apps/web/test/guard-boundaries.test.ts`, in `pnpm verify` and run by CI. It reports; it does not block.
- ADR-0059's "claims linter runs in site and docs CI" is `apps/web/test/guard-claims.test.ts`, which covers the app's screens and strings, the recipe presentations, the prompt templates and the READMEs; byway has no site. ADR-0059's release CI and replication-kit release CI do not exist, because byway has no release process yet. They stay as written for when it does.
- The spec's §4 and §6 now name these tests and say that CI runs them.

### 6. ADR-0068's merge gate, restated

A branch is merged into main only when `pnpm verify` passes: the typecheck, every unit test (the decision-log check included) and the browser tests. A commit made directly on main is checked by CI after it is pushed. For a commit that changes only documents, `pnpm vitest run scripts/test` runs the decision-log and README checks in seconds.

### 7. A note on ADR-0041 (not a ratification)

This note is not a ratification. It ratifies neither ADR-0041 nor any rule in it, and changes nothing ADR-0041 decided. ADR-0041 reads Accepted: it was approved on 2026-10-07 as part of design section 1, revision 2, and its header says its rules "were not individually discussed". Its Decision still opens "Proposed, not decided." and calls design section 1 "awaiting approval". That text predates the rule in §1.3 and stays as it is.

"ADR-0041 rule 3", cited in the README, spec §6, ADR-0066, ADR-0071, `packages/contracts/src/store.ts` and `packages/store/src/datadir.ts`, is the third item of the list that design section 1 "adds five rules and one default" to: "Product usage data never enters a confirmatory study; it may feed future studies only with separate consent and a separate preregistration."

### 8. Branch protection, and what CR14 still lacks

- **Branch protection is the owner's setting,** made by the owner or by Claude when the owner explicitly asks: a ruleset on main that blocks force pushes and deletion, and one that blocks moving or deleting tags (CR14's milestone snapshots will be tags). It is not part of this record's change. It stops accidents and makes a rewrite of history deliberate and logged. It does not make one impossible: an organization admin can lift a ruleset, and on a private repository it gives an outside reader nothing to check ([ADR-0060](0060-repository-byway-private-remote.md)).
- **CR14 still lacks** signed commits, the public mirror of the research record, DOI snapshots at each milestone, and published hashes of the private product ADRs. They stay on the playbook's "Public record for the charter" row, due before the brief draw (about November 2026). Signed commits are decided at the mirror step. Once the mirror exists, the decision-log check runs there too.

### 9. When a blocking check comes

CI stays reporting only until a second person merges to main, or a public mirror is about to go live, whichever comes first. Then `verify` becomes a required check in a ruleset on main.

### 10. Records this one changes

Read with this record: [ADR-0001](0001-record-architecture-decisions-as-adrs.md) (the log's rules, §1 and §2), [ADR-0041](0041-shared-engine-pinned-research-versions.md) (the note, §7), [ADR-0055](0055-instrument-firewall-and-exposure.md) and [ADR-0059](0059-engine-requirements-for-composition-and-credibility.md) (what their CI checks are, §5), [ADR-0057](0057-tamper-evident-record-and-disclosure.md) (how CR14's CI check is met and what it still lacks, §2, §5 and §8) and [ADR-0068](0068-contracts-first-parallel-build.md) (the merge gate, §6). None of them is edited.

## Alternatives considered

- **Keep the honour system.** No cost, but CR14's check stays unmet and the "CI check" sentences stay untrue.
- **A local history test and branch protection, with no CI.** The check would run only when someone remembers, and never for direct commits to main.
- **A Windows job only (the brief's recommendation).** The owner's D2 answer brings Linux in, and Linux is where the renderer's sandbox question lies. Both jobs are cheap enough to run on every push to main.
- **The full design: a required check, structured "Changes" and "Later records" rows in every record, and a back-fill of all relations.** A blocking check on GitHub guards GitHub's copy, not the local checkout byway runs from, and would force every merge through a pull request. The relation rows are a reading aid; the index already holds the links. Kept in the backlog with triggers.
- **Linux on every push, Windows nightly** (the verification report's design). Windows is where byway has always run, so it runs on every push too.
- **A pre-push hook running the fast checks.** Not added now; in the backlog.
- **Moving the pnpm pin to 11.13.1 or later.** pnpm would then switch the owner's local pnpm to that version on the next command in this repository. Left to the owner (backlog).

## Consequences

- **Time.** Measured on GitHub's 2-CPU machines in the two full runs of the bring-up:
  - Linux: 13 to 17 minutes a run. About 1 minute to set up, 7.5 to 10 minutes of unit tests, 4.6 to 6 minutes of browser tests.
  - Windows: 29 to 36 minutes a run. About 2 minutes to set up, 14 to 16 minutes of unit tests, 14 to 18 minutes of browser tests.
  - A regression shows as a red mark about 15 minutes after a push (Linux) and about 30 minutes after it (Windows).
- **Money.** GitHub bills each job in whole minutes: Linux at $0.006 a minute and Windows at $0.010 (2-CPU machines, list price). One run is about 14 to 18 Linux minutes and 30 to 36 Windows minutes: about $0.40 to $0.47, the price of 65 to 80 Linux minutes. At 20 to 70 pushes to main a month plus the weekly runs, that is about $10 to $35 a month at list price, 3% to 12% of the 50,000 minutes the organization's plan includes each month. The included minutes are shared with the organization's other repositories; in a month when they run out, as they did in September 2026 when another repository used them all, byway's runs are billed at these prices. The bring-up used 59 Linux minutes and 88 Windows minutes, about $1.23 at list price.
- **False alarms.** A reporting check raises false alarms on flaky tests. The known ledger-timestamp flake is fixed on main (3822920). A new timing flake on GitHub's 2-CPU machines is named and set aside quickly.
- **The coordinator's merge procedure changes** (§1.4): the index row and the "changed by" links reach main in the record's own commit.
- **No product behaviour changes.**

## Evidence

- The D4 brief and its challenge (C:/Users/arvik/AppData/Local/Temp/byway-fixes/designs/owner-decisions.json, analyse:D4 and challenge:D4), and the owner's answers of 2026-10-16.
- History: `scripts/test/adr-log.ts` run on main 7ce21cb found one edit to a fixed section (ADR-0100, f69b3da) across 90 first-parent commits and 94 Accepted records; the probes in the D4 brief found the same.
- CI bring-up on branch fix/fx-d4-ci, 2026-10-16 (runs 38997893076, 39000217628, 39001395283, 39001866770 and 39002069426 in wavemanco/byway's Actions):
  - Before the Linux setup: on Linux every unit test passed except the vertical Japanese page and the sandbox control in §3 (and the ADR-0041 note check, written before this record), and all 53 browser tests passed. Windows passed everything except that note check.
  - The runner reported `kernel.apparmor_restrict_unprivileged_userns = 1` (uid 1001). Chromium inside its sandbox failed with "No usable sandbox" without the AppArmor profile, and started with it (headless shell 284 ms, full Chromium 642 ms).
  - Chromium's font for the vertical Japanese row was WenQuanYi Zen Hei (the first item laid out at 0 px high); with IPAGothic, Noto Sans CJK JP or Noto Serif CJK JP it was 64 px, as with Yu Gothic on Windows.
  - With both set up: 4,751 of 4,753 unit tests and 53 of 53 browser tests passed on each system. The two failures were `scripts/test/ci.test.ts` checking that the workflow runs `pnpm verify` as one step and only for main; the bring-up shape failed them, as intended, and the final workflow passes them.
- Files: `.github/workflows/verify.yml`, `.node-version`, `package.json` (`packageManager`), `scripts/test/adr-records.test.ts`, `scripts/test/adr-log.ts`, `scripts/test/ci.test.ts`, `scripts/test/readme.test.ts`, the README (Quick start, Scripts, Back up, Tests, CI, Ground rules), spec §4 and §6, and the playbook's public-record row.
