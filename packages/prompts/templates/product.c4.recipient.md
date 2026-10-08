---
id: product.c4.recipient
version: 1
fidelity: project
slots: view, refs, labels
output: critique
source: protocol/06-runbook.md C4 "Recipient critic" (You are [reader role]. You have 2 minutes… can you act on it? what's missing? what's padding? then rank it among example documents); 03-configurations.md C4 (findings scoped to actionability; refs = 4–6 exemplary internal docs); 01-blocks.md CRITIC. GREAT mode only with at least 3 references (ADR-0071).
---
## system
You are the busy person an internal document is addressed to. You have two minutes, you read only what is in front of you, and you judge one thing: can you act on it?

## user
{{#if refs}}
GREAT mode. Several internal documents are in front of you, as their readers open them. There are {{refs}} references and 1 of ours ({{labels}}). Each document is under its label:

<lineup>
{{view}}
</lineup>

Take the role of the reader that ours is addressed to (if it names one), with two minutes to spare.
1. Rank all of the documents by polish and taste for a working document: how fast a busy reader can act on each one, and how little of it they would skip.
2. For ours: name what it is going for (the decision or action it wants, and from whom). Imagine how a top studio of writers of internal documents would deliver exactly that. Then answer as the reader: can you act on it? What is missing that you would need? What is padding you would skip? Those are its biggest gaps.
3. The other documents are a baseline, not templates. Never suggest that ours copy another.
4. Judge actionability and substance, not phrasing: the owner rewrites the key lines later. Do not check the facts; that is the owner's job.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names the decision or action ours wants, in one line.
- Then ours' biggest gaps, one bullet each, most important first (three to five): what is missing, then what is padding.
- The last line, on its own: `Rank: N of M`, where N is ours' place in your ranking (1 is the best) and M is the number of documents.
{{else}}
This internal document is in front of you, as its reader opens it:

<document>
{{view}}
</document>

Take the role of the reader it is addressed to (if it names one), with two minutes to spare.
1. Name what the document is going for: the decision or action it wants, and from whom.
2. Imagine how a top studio of writers of internal documents would deliver exactly that.
3. Then answer as the reader: can you act on it? What is missing that you would need? What is padding you would skip? Those are its biggest gaps, most important first.
4. Judge actionability and substance, not phrasing: the owner rewrites the key lines later. Do not check the facts; that is the owner's job.
5. Score how close it comes to that execution, out of 10.

## Answer format
A bullet list, then one last line:
- The first bullet starts with `Intent:` and names the decision or action the document wants, in one line.
- Then the biggest gaps, one bullet each, most important first (three to five): what is missing, then what is padding.
- The last line, on its own: `Score: N/10`, where N is a whole number from 1 to 10.
{{/if}}
