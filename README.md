# byway

The research program and product built on the **Off-Center protocol**: eight composable blocks, a small grammar and a set of configurations that generalize Anshu Chimala's "How to turn your AI into a world-class designer" (Lenny's Newsletter, Sep 1 2026) beyond design.

Status: design phase. No application code yet.

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
