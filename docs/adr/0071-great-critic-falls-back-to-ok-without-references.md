# ADR-0071: In the product, a GREAT-mode critic needs at least three references, and falls back to OK mode without them

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 18:40 |
| **Track** | Product |

## Context

The critics of C2–C7 run in GREAT mode: they rank our version among reference examples, and their loops stop on a hidden rank (`critic-rank`). References come from the user, who may have none. 01 CRITIC sets `bar_mode` to "OK (article's prompt)" by default and to GREAT "whenever you have about 4 references".

## Decision

- The app asks for "examples you admire" before a run whose recipe takes `refs`.
- When a run reaches a GREAT-mode critic with at least 3 references, the critic runs in GREAT mode. It uses up to the step's `refs` count of them, in shuffled positions, and the loop's rank threshold applies.
- With fewer than 3 references, the critic runs in OK mode (the article's prompt, "Score: N/10"). The loop then stops at the hidden OK threshold of 01 (9/10), keeping its plateau and cap. The step's `step-finished` note says so in plain words: "No examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples."
- The fallback applies to that run only. The recipe and its hash do not change.

## Alternatives considered

- **Require references to start** — blocks runs that need none of them to be useful.
- **Rank against imagined references** — invents evidence the protocol does not have.

## Consequences

**Positive**

- Every recipe runs without references, and the switch follows the protocol's own rule for choosing a bar.

**Negative**

- A run without references is a different treatment from the recipe as written. Product runs never feed studies (ADR-0041 rule 3), and the step note makes the difference visible.

## Evidence

- `protocol/01-blocks.md`, CRITIC knobs: `bar_mode` — “OK (article's prompt)” by default; GREAT “whenever you have about 4 references”; OK threshold “score ≥ 9/10, hidden”.
- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §3.2
