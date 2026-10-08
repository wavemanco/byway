# ADR-0070: Precompile the runner's Temporal workflows with esbuild

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude decided under the user's instruction "go with the product track. complete it first" ([ADR-0062](0062-code-first-work-mode.md)); not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-07 10:52 |
| **Track** | System |

## Context

The Temporal TypeScript SDK bundles workflow code with webpack and transpiles it with SWC. On this machine SWC's native binding refuses its cache folders, because their access lists include a sandbox group. Workspace packages also export TypeScript sources, which Temporal's bundler would hand to SWC.

## Decision

`packages/runner/scripts/build-workflows.ts` compiles the workflow entry with esbuild into one ESM file (`dist/workflows.js`) before the worker starts. All workspace imports are bundled in, and only `@temporalio/*` stays external. The worker points `workflowsPath` at that file. A spike verified this: a workflow with one activity and one human Update completed.

## Alternatives considered

- **Fix the cache-folder permissions** — machine-specific and fragile; another machine could hit the same problem.
- **Prebuilt workflow bundles (`bundleWorkflowCode`)** — this still runs SWC.

## Consequences

**Positive**

- The worker starts on this machine, and the build no longer depends on SWC.

**Negative**

- The workflow bundle has to be rebuilt after workflow changes. `pnpm dev` rebuilds it on start.

## Evidence

- [product v1 spec](../superpowers/specs/2026-10-07-product-v1-design.md) §2 "Temporal on this machine"
