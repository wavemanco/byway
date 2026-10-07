# byway

The research program and product built on the **Off-Center protocol**: eight composable blocks, a small grammar and a set of configurations that generalize Anshu Chimala's "How to turn your AI into a world-class designer" (Lenny's Newsletter, Sep 1 2026) beyond design.

Status: engine Milestone 0 (recipe core) is built: the protocol is machine-readable, every Study 1 arm is a hashed recipe, and a validator checks recipes against the grammar's rules.

## Engine quick start

Requires Node 24+ and pnpm 11+.

```bash
pnpm install
pnpm test                                  # unit, rule and conformance tests
pnpm typecheck
pnpm byway validate recipes/c1h.json      # check one recipe (exit 0 ok, 1 violations, 2 unreadable)
pnpm recipes:emit                          # regenerate recipes/*.json after changing the catalog
```

| Package | Role |
|---|---|
| `packages/canonical` | RFC 8785 canonical JSON and SHA-256 content hashes |
| `packages/protocol` | The registry: ports, blocks, glue, rules (with classes) and exceptions |
| `packages/recipe` | Recipe format, hashing, tree walking, leave-one-out and CRITIC-self derivations |
| `packages/validator` | Port-scope typing and rule checks, reported by rule ID |
| `packages/catalog` | C1, C1-H, the Study 1 baselines and ablations; emits `recipes/` |
| `packages/cli` | `byway validate` and `byway hash` |

Design: [engine Milestone 0 spec](docs/superpowers/specs/2026-10-07-engine-recipe-core-design.md).

## What's here

| Path | Contents |
|---|---|
| [protocol/](protocol/README.md) | The protocol: blocks, grammar, configurations C1–C7 and C6a, use-case evidence, More to Explore, runbook, sources, and a visual map |
| [docs/adr/](docs/adr/README.md) | Every architectural decision, with honest provenance (who decided, when, alternatives, evidence) |
| [docs/research/](docs/research/) | Research reports behind the decisions: protocol build reviews, harness and study research, and the credibility red team |

## Two tracks, one engine

1. **Research:** a testing harness and evaluation pipeline, and publishable studies. Paper 1 tests C1 against baselines, with leave-one-block-out ablations. Paper 2 tests generalization.
2. **Product:** a user brings a problem, and the product recommends a configuration or composes one from the blocks ([ADR-0042](docs/adr/0042-product-north-star-recommend-or-compose.md)).

Research credibility comes first, without compromise ([ADR-0043](docs/adr/0043-research-credibility-without-compromise.md)). The credibility charter is ADR-0044 to ADR-0057.

## Ground rules

- API keys never enter this repository ([ADR-0009](docs/adr/0009-api-key-fencing-constraints.md)).
- Accepted ADRs are append-only. A changed decision gets a new ADR that supersedes the old one ([ADR-0057](docs/adr/0057-tamper-evident-record-and-disclosure.md)).
