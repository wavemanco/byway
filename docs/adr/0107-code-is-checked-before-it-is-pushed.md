# ADR-0107: Code is adversarially checked before it is pushed, in larger blocks; each further fix round is decided together with the owner

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | User: the owner's words and chosen options, quoted under Decision items 1 to 4 (2026-10-15 to 2026-10-21), item 4's rule for every risky change among them (2026-10-21). Delegated to Claude, reversible: how a check is run and what it may block on (item 5), and reading item 2's two answers as a rule for every fix round |
| **Date (local, UTC−7)** | 2026-10-16 20:17 |
| **Track** | Process |
| **Related** | [ADR-0062](0062-code-first-work-mode.md), [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), [ADR-0103](0103-adr-log-rule-and-ci.md), [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md) |

## Context

The owner set rules 1 to 4 in conversation between 2026-10-15 and 2026-10-21; rule 5 is Claude's practice. Until this record they were kept only in Claude's memory on the owner's machine, so a fresh session or another agent would not see them. [ADR-0103](0103-adr-log-rule-and-ci.md) holds the merge gate (`pnpm verify`) and the step for a risky change (CI on its branch first), and [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md) records the one bounded round 14 the owner chose for F07; neither states these rules. [ADR-0062](0062-code-first-work-mode.md) (code first) is the precedent for recording a working rule the owner set as a Process record.

F07 (ADR-0081) ran 14 fix-and-check rounds between 2026-10-08 and 2026-10-15, its checks free to block on any case they could construct. The rules below came out of that, and out of the checks of D1, D2 and D4.

## Decision

1. **Check before pushing, in larger blocks.** The owner, 2026-10-16 20:17: "please note that I am big on adversarial checks on all code we will push before we push it. That means bigger code blocks so that the time taken by adversarial runs is actually worth it." Every code change gets an adversarial check before it is pushed, and work is grouped into larger blocks so that each check is worth its time. Who runs the check, and how, is item 5.
2. **Each further fix round is decided with the owner.** The owner, 2026-10-15 00:54, during F07's round 13: "once round 13 is done, don't automatically jump to round 14. I want to know exactly what is prompting round 14 (because we can't keep running loops indefinitely)." On 2026-10-17 00:32, asked "May I run one bounded fix round for D1 and D4, then merge both and run one adversarial check on the combined result before pushing?", whose recommended option ended "No second round without asking you.", the owner answered: "run the first round but then report the result instead of unilaterally denying round 2. I would like to take that call together." After each check, Claude reports what it found, and the next round, or none, is decided with the owner. Claude neither starts another round nor rules one out alone. That this holds for every fix round, not only the two these answers were about, is Claude's reading of them and of their stated reason, delegated and reversible.
3. **Proportion.** On 2026-10-15 10:28, for F07's last round, the owner chose the option that read in part: "Agreed in advance: anything new that it finds blocks only if it's a regression or appears on realistic pages; rarer constructed cases go into ADR-0081's 'not checked' list and the backlog." On 2026-10-15 22:05, after the rounds: "I don;t understand why we needed so many fix iterations for what is basically page design. If you look back at the original source on lenny's newsletter, it doesn;t invlve such cimplicated proceedings. design is design."
4. **Merging a risky change after its branch run** (changes [ADR-0103](0103-adr-log-rule-and-ci.md) §3, "merges only when both jobs pass"). For D2, on 2026-10-18:
   - At 14:02, for round 3, the owner chose "Focused 2-lens check, then branch CI, merge (Recommended)", which read: "One lens on code (renderer, banner, Linux script), one on docs; refuters for blocking findings; then one branch CI run; merge to main when Linux passes and Windows passes or fails only on a named timing flake. Report before anything further." In the same answer, asked "Windows CI keeps failing on timing in tests, not in byway. Adopt the CI proposal?", the owner chose "Not now", which read: "Keep CI as it is; timing flakes get named and set aside."
   - At 15:23 the owner chose "Hand-fix docs, quick check + branch CI in parallel, merge (Recommended)", which read in part: "Merge to main when the check is clean and Linux passes (Windows passes or fails only on a named timing flake). If either finds something, I report first."
   - At 15:49, to Claude's "My suggestion: I fix that sentence by hand, rerun the docs checks, and merge D2 if the CI run passes on Linux, and on Windows passes or fails only on the named timing flake. That skips one more check round for a single comment line. Shall I go ahead", the owner answered "go ahead".

   For every risky change, on 2026-10-21 at 13:41: asked "ADR-0107 says D2's merge condition holds for later risky changes, as my reading of your 'Not now' answer. Should it?", the owner chose "Make D2's condition the rule (Recommended)", which read: "A risky change merges when Linux passes and Windows passes or fails only on a timing flake already named in the backlog. Any other failure stops the merge and is reported to you. Recorded as your choice. Windows has failed 6 of 14 runs on timing alone."

   So a risky change run on its branch merges when the Linux job passes and the Windows job passes or fails only on a timing flake already named in the backlog. Any other failure stops the merge and is reported to the owner. The owner chose this for D2 first, on 2026-10-18, and on 2026-10-21 as the rule for every risky change; until then, that it held after D2 was Claude's reading of the "Not now" answer. D2 itself passed on both jobs (run 39172144829), so the looser condition was not used.
5. **Claude's practice, delegated and reversible:**
   - A check is run by a fresh checker that did not build the change. It tries to break the change, reruns the gate, and checks every statement made to the owner and in the records.
   - Fixes Claude makes by hand after a check go into the next batch's check before that batch is pushed.
   - Commits that change only documents (backlog rows, the ADR index) may ride with the next checked batch.
   - A checker blocks only on a regression, a failure on realistic input, or a false statement; rarer constructed cases are recorded as limits, as the owner chose for F07's last round (item 3). When two or three rounds keep finding new kinds of edge case, Claude puts the form of the guarantee back to the owner instead of fixing case by case.
   - A report of a check says whether each item is a wrong result, a false refusal or wording.
   - Briefs and records quote the option the owner chose word for word, and mark what Claude adds. A brief once relayed an owner answer with a condition the owner never chose, and a record took it up (D2 round 2, DOC-R2-1; [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md), Evidence).

## Alternatives considered

- **Leave the rules in Claude's memory.** A fresh session, another agent or a reader of the repository would not see them.
- **A list of working rules in the README's Ground rules.** Shorter, but the README is for people using byway, and the owner's words and their dates belong in the decision log, as ADR-0062 did for code first.
- **Keep ADR-0103 §3's "both jobs pass" for every risky change after D2, and record D2's condition as a one-off.** Put to the owner on 2026-10-21 as "D2 only; later ones need both", which read: "ADR-0103 §3 stays as you chose it on 2026-10-16: a risky change merges only when both jobs pass. ADR-0107 records D2's condition as a one-off, and the README is corrected to say so." The owner chose the other option (item 4). Before that question, Claude had not chosen it: the owner's "Not now" kept CI as it is, with timing flakes named and set aside, so every later risky change would wait on Windows timing flakes CI already names.

## Consequences

- A fresh session or another agent finds the rules in the repository, in the owner's words.
- Checks cost time; batching keeps their number down, and every push waits for one.
- A risky change can merge while its Windows job is red on a named timing flake. A real Windows failure that looks like a known flake could get through; only a flake already named in the backlog counts, and any other failure stops the merge and is reported to the owner.
- No code changes.

## Evidence

- The owner's messages and answers are in this session's transcript, `C:\Users\arvik\.claude\projects\C--Users-arvik-code-byway\67b5b9ac-8595-4cc6-898a-d7d911b9d422.jsonl` (outside the repository), with each option's text as asked: 2026-10-15T07:54:38Z (item 2), 2026-10-15T17:28:07Z (item 3), 2026-10-16T05:05:05Z (item 3, a message the owner queued while Claude worked), 2026-10-17T03:17:31Z (item 1), 2026-10-17T07:32:30Z (item 2), 2026-10-18T21:02:28Z, 22:23:25Z and 22:49:10Z (item 4), and 2026-10-21T20:41:42Z (item 4, the answer to the question asked at 20:39:40Z). The dates above are local (UTC−7). Each is also in [evidence/conversation-continued.md](evidence/conversation-continued.md), under its time.
- F07's rounds: [ADR-0081](0081-voice-writes-the-persons-copy-exactly.md), header and Evidence.
- D2's branch run, run 39172144829: [ADR-0105](0105-renderer-os-sandbox-on-with-an-explicit-off-switch.md), Evidence.

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-21, three more rules that were kept only in Claude's memory.** As rules 1 to 4 were until this record, two of the owner's instructions, and one rule Claude drew from the owner's answers, were kept only in Claude's memory on the owner's machine. Asked "D7. Two of your instructions ("no let it run please. I don;t want to defer anything if I can help it.", 2026-10-19, and "full review folder (do NOT modify anythign in it)", 2026-10-08) and one rule I drew from your answers (keep the organisation's details out of the repository) live only in my memory, which a fresh session doesn't see. Record them?", the owner chose "Record all three (Recommended)", whose description reads "A dated note on ADR-0107 quotes your two instructions word for word, and records the third as Claude's reading of your 2026-10-21 answers, labelled as mine." ([evidence/conversation-continued.md](evidence/conversation-continued.md), 2026-10-21 21:27.)
  - **Let work in progress finish.** The owner, 2026-10-19 01:05, when Claude, four hours into the evidence build, named a quicker way to finish it should it run on (commit the corpus as files with a command to run it by hand, and file the differing verdicts in the backlog): "no let it run please. I don;t want to defer anything if I can help it." Claude reads this, beyond that build, as: slow work under way is left to finish, and an item is deferred only when it truly waits on something else.
  - **The external review's folder is not modified.** The owner, 2026-10-08 04:24, giving the folder of the review to verify: "full review folder (do NOT modify anythign in it): C:\Users\arvik\code\byway_review". Nothing in that folder is changed. That this stands for the folder from then on, not only for that day's verification, is Claude's reading.
  - **The organisation's details stay out of byway's repository (Claude's reading, labelled as Claude's).** The details of the owner's GitHub organisation (the names of its other repositories and their minutes, its plan, seats and price, its included minutes and overages, and byway's share of them) are not written into byway's records, evidence, backlog, playbook or commit messages; a quote that holds one is redacted and says so. The owner's answers this is drawn from were each about one file: at 2026-10-21 13:41, about the D4 brief, "Go with your recommendation but explain to me exactly what is D4 brief and why do Action Minutes and overages feature at all? The quantities of minutes and overages should also be redacted." (its recommended option was "Redact them, and say so (Recommended)"), and at 16:14, about ADR-0103, "Redact it now, and say so (Recommended)". That they make one rule for every file is Claude's reading, recorded as Claude's at the owner's choice above.
