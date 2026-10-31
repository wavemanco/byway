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

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-28, the by-hand script is gone.** The Decision's `packages/runner/scripts/build-workflows.ts` "before the worker starts" no longer describes how the bundle is built. The worker builds `dist/workflows.js` itself on every start (`buildWorkflows`, `packages/runner/src/build.ts`, called from `worker.ts` when no `workflowsPath` is given), and `scripts/serve.ts` builds the bundle named by `BYWAY_WORKFLOWS_BUNDLE` for the e2e suite, so it never rebuilds under a byway that is running. The script, kept "for checking the bundle by hand", was checked by no tsconfig, so it was deleted with its `build:workflows` line in `packages/runner/package.json` (ponytail audit BUILD-8, backlog row B-169). The esbuild build itself, its single ESM file with only `@temporalio/*` external, and `build.test.ts`'s cover of it are unchanged. The v1 spec's §2 "Temporal on this machine" names the script too; read it as this note says.
- **2026-10-31, the prompt id lists stay out of the bundle (backlog row B-176).** Workflow code imports `labelOf` from `@byway/prompts/pure`, which also re-exports `ids.ts`. Its lists built by calls (`MEDIA.map`, `TELLS_DOMAINS.map`, `Object.values(HELPER_PROMPTS)`, and the spread that joins them) are kept by esbuild, which cannot tell a call is pure, though no workflow code reads them, so each new prompt id an activity calls changed the bundle's hash and would end every run open at an upgrade ([ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md)); F12 (b)'s two did. They are now marked `/* @__PURE__ */`, and `PROMPT_IDS` is built with one marked `concat` (a spread of the lists in an array literal is kept even with the marks). The bundle drops `ids.ts` whole, and with it the media and tell-domain lists of `@byway/protocol` that only `ids.ts` brought in, so it takes nothing from `@byway/protocol` now; its hash moved once more, on purpose, from f5cb3d64… to 1d8d5728…, with no workflow code changed. `packages/runner/test/build.test.ts` holds it: a new prompt id leaves the hash alone, with a control that an edit to `slots.ts`, which workflow code reads, moves it; and the protocol test's control, which edited the media list that has now left the bundle, became a record of the edits esbuild really made. Claude's, as the row proposed.
