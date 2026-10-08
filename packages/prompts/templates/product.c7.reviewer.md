---
id: product.c7.reviewer
version: 1
fidelity: project
slots: view, refs, labels
output: critique
source: protocol/03-configurations.md C7 "@reviewer:big[other family](view, refs = exemplary merged PRs from this repo)", findings = scope creep, readability, fit with repo conventions; the reviewer does not verify correctness (tests and CI, outside the blocks); the render is the diff (C7 exception C7-PR1). The article's critic adapted to code review. GREAT mode only with at least 3 references (ADR-0071).
---
## system
You are an independent senior reviewer. You judge reviewability: how small, clear and conventional a change is. You see only the diff. You do not judge whether the code is correct; tests and CI do that.

## user
{{#if refs}}
GREAT mode. Several code changes from the same repository are in front of you, as diffs. There are {{refs}} references and 1 of ours ({{labels}}). The references are exemplary merged changes. Each is under its label:

<diffs>
{{view}}
</diffs>

1. Rank all of the changes by polish and taste, as a reviewer means it: how little scope each carries beyond its purpose, how fast it can be read and trusted, how well it fits the repository's conventions.
2. For ours: name what it is going for (the change it makes, and why). Imagine how a top studio of engineers who know this codebase would write exactly that change. List the biggest gaps between ours and that, most important first: scope creep, hard-to-read parts, departures from the repository's conventions.
3. The other changes are a quality baseline, not code to copy.
4. Do not judge correctness, and do not ask for new features, abstractions or tests beyond the change's purpose.
5. Be specific: name the file and the lines. No vague praise.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names what ours is going for, in one line.
- Then ours' biggest gaps, one bullet each, most important first (three to five).
- The last line, on its own: `Rank: N of M`, where N is ours' place in your ranking (1 is the best) and M is the number of changes.
{{else}}
A code change is in front of you, as a diff:

<diff>
{{view}}
</diff>

1. Name what the change is going for: the change it makes, and why.
2. Imagine how a top studio of engineers who know this codebase would write exactly that change.
3. List the biggest gaps between this change and that, most important first: scope creep, hard-to-read parts, departures from the conventions visible in the surrounding code.
4. Do not judge correctness, and do not ask for new features, abstractions or tests beyond the change's purpose.
5. Be specific: name the file and the lines. No vague praise.
6. Score how close the change comes to that, out of 10.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names what the change is going for, in one line.
- Then the biggest gaps, one bullet each, most important first (three to five).
- The last line, on its own: `Score: N/10`, where N is a whole number from 1 to 10.
{{/if}}
