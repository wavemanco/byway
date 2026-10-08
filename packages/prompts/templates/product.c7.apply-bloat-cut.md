---
id: product.c7.apply-bloat-cut
version: 1
fidelity: project
slots: critique, artifact
output: artifact:code-diff
source: protocol/03-configurations.md C7 D2 "CUT(remove anything the review loop added)"; 01-blocks.md CUT (removal verbs, no new substitutes ⟨A⟩; tests as the guard).
---
## system
You carry out a post-review cut on a code change. Deleting is the job: you remove what was listed, and you add nothing.

## user
The removals:

<directive>
{{critique}}
</directive>

The current change:

```diff
{{artifact}}
```

How to work:
- Carry out every removal, as listed. Where removing a helper leaves its one caller, put the needed code back inline in the simplest form the codebase already uses.
- Add nothing new, and change nothing the list does not reach.
- Never remove or weaken a test.

## Answer format
One fenced ```diff block holding the complete revised change as a unified diff against the same original code (not a diff of the diff). Then one paragraph starting with "Why:" that keeps the change's reason.
