# tooling

## Summary
Reuse the plumbing and build the science and the UX yourself. The recommended split has six reuse pieces and one build list.

1. **Inspect AI as the inner engine.** It is MIT-licensed, from UK AISI, and runs every configuration stage plus all AI-judge and automated-metric scoring. It already provides:
   - sandboxed coding-agent workers (Claude Code, Codex CLI) via its sandbox agent bridge, with every model call captured;
   - model roles, so worker, critic and a multi-model judge panel are separate;
   - image inputs, eval-set retry and resume, and batch APIs;
   - open .eval logs that load into pandas dataframes.
2. **DBOS Transact as the outer orchestrator.** It is an MIT library on Postgres, or SQLite locally. It sequences stages, holds human checkpoints and budget gates, runs the rater-study lifecycle and keeps rate-limited queues per provider. Temporal is the heavier fallback.
3. **Direct provider APIs.** Anthropic, OpenAI and Gemini go through Inspect's own providers; fal.ai is called directly. OpenRouter is used only for long-tail models, with one pinned provider and fallbacks off. Keep LiteLLM out of the trust path.
4. **Rendering and sandboxing.** Use local Docker sandboxes and a version-pinned Playwright image for deterministic renders, tiled to stay under each model's image limits.
5. **Rater recruitment.** Use the Prolific API to recruit, but a custom rater app to show stimuli and randomize them.
6. **Analysis.** Use R brms for the confirmatory analysis and Python Bambi for exploration.

**Build in-house only what is the contribution or the UX:**
- the recipe layer that hides the block grammar;
- the human-checkpoint binding (live / policy / AI proxy / replay);
- a content-addressed run ledger and a replication-package exporter;
- a pre-run cost estimator with hard budget caps;
- the render service;
- the rater app;
- the study designer (power simulation, preregistration, budget);
- the app front-end itself.

**Do not make a SaaS eval platform the system of record.** Braintrust (14/30-day retention), LangSmith (14-day base retention) and W&B Weave (self-hosting needs a licence plus Kubernetes) all conflict with archival reproducibility. OpenAI's cookbook says it is winding down its Evals product.

**Two time-sensitive findings shape paper 1:**
- Claude Haiku 4.5 may retire as soon as 2026-10-15, and Sonnet 4.5 retires 2026-11-30. Neither should be in the design.
- Claude 4.7+ models reject non-default temperature. So reproducibility has to mean archived outputs plus replicates, not bit-identical reruns.

## Recommendations
### Overall build-vs-reuse split [high]
Reuse for execution, judging, durability, sandboxing, rendering, recruitment and statistics: Inspect AI, DBOS, Docker, Playwright, Prolific API, brms and Bambi. Build only these:
1. A recipe/spec layer: typed YAML per configuration (C1–C7, C6a) plus ablation toggles, compiled into Inspect tasks and DBOS stage graphs. The UI shows recipe cards, never block notation.
2. A human-checkpoint binding layer.
3. A content-addressed run ledger with a replication-package exporter.
4. A cost estimator with hard budget gates.
5. A deterministic render service.
6. A rater app.
7. A study designer (power simulation, preregistration export).
8. The Apple-grade front-end.
Keep the system of record in open formats you own: Inspect .eval logs, Parquet/JSONL manifests, and SHA-256-addressed blobs.
- Why: The reused tools are open-source and cover generic needs: retries, sandboxes, model adapters, logging, recruitment, modelling. The custom parts are where the research contribution and the UX live, and no tool provides them. Examples: ablating one block by flipping a recipe toggle, or replaying a recorded human pick under a different condition. Three of the commercial or semi-commercial options changed owner in 2026:
- OpenAI bought promptfoo.
- ClickHouse bought Langfuse.
- W&B pricing now sits under CoreWeave.
Owning the data format is what keeps a 2027 replication possible.
- Src: https://inspect.aisi.org.uk/; https://github.com/dbos-inc/dbos-transact-py; https://www.promptfoo.dev/blog/promptfoo-joining-openai/; https://langfuse.com/blog/announcing-acquisition; https://coreweave.com/forge-pricing

### Inspect AI as the inner execution engine and judge harness [medium]
Each configuration stage is one Inspect Task. Each sample is one cell: task brief × condition (C1 / plain / 'be creative' / leave-one-out ablation) × replicate.

C1's critic loop is a custom solver that the harness drives:
1. The worker (Claude Code or Codex CLI) runs in a Docker sandbox through sandbox_agent_bridge.
2. The harness renders the page.
3. The harness calls the 'critic' model role with the images only.
4. The harness applies the hidden threshold and the stop rules.

Use a separate judge-stage Task over frozen artifacts:
- bind several models to a 'judge' role;
- use epochs for repeated judgments;
- use batch mode for cheaper judging.

Run everything with eval-sets for retry and resume. Pull results with samples_df/events_df into Parquet.

Do a 2-day spike first to confirm two things: how image-gen/fal.ai calls get logged as custom events inside a sample, and that 30–60-minute agent samples hold up.
- Why: Inspect already provides:
- an open MIT license (2.9k stars, active);
- 20+ providers, including OpenRouter;
- model roles with multi-model panels (majority vote, votes kept in metadata);
- image inputs for Anthropic, OpenAI and Google;
- Docker/k8s/Modal/Daytona sandboxes;
- capture of every model call made by Claude Code, Codex or Gemini CLI inside a sandbox;
- eval-set retries that reuse completed samples;
- turn-boundary checkpointing;
- logs that convert straight to dataframes.

That is most of a reproducible agent-eval harness. Its logs are also a recognised artifact format in the AI-evaluation community.

Limits:
- The human agent is for humans doing tasks, not rating outputs.
- Checkpointing is crash recovery, not a way to wait for a person.
- There is no built-in screenshot tool.

So raters, human checkpoints and rendering stay outside Inspect.
- Src: https://inspect.aisi.org.uk/agent-bridge.html; https://inspect.aisi.org.uk/providers.html; https://inspect.aisi.org.uk/model-graded.html; https://inspect.aisi.org.uk/eval-sets.html; https://inspect.aisi.org.uk/eval-logs.html; https://inspect.aisi.org.uk/dataframe.html; https://inspect.aisi.org.uk/checkpointing.html; https://inspect.aisi.org.uk/human-agent.html; https://inspect.aisi.org.uk/sandboxing.html; https://inspect.aisi.org.uk/multimodal.html; https://github.com/UKGovernmentBEIS/inspect_ai

### Outer orchestration and durability (multi-day studies, human checkpoints) [medium]
Use DBOS Transact (Python) as the study-level orchestrator. Each study is a durable workflow:
1. Preflight cost gate.
2. Stage-1 Inspect eval-set.
3. Human checkpoint (wait on a DBOS message from the app, or apply the bound policy).
4. Stage-2 eval-set.
5. Judge eval.
6. Prolific study create, publish and poll.
7. Analysis render.

Use DBOS queues with per-provider partitions and rate limits so Anthropic, OpenAI, Gemini and fal.ai each stay under their limits.

Keep each step a pure function of content-addressed inputs, so the engine stays swappable.

Fallback: Temporal, if the team grows or workloads spread across machines. Locally that means `temporal server start-dev --db-filename`; Temporal Cloud costs $50 per million actions. Do not use BullMQ, Inngest or Vercel Workflow as the core engine.
- Why: DBOS is a library, not a server:
- MIT, with Python, TypeScript, Go and Java SDKs;
- runs on Postgres, or SQLite for local-first use;
- durable workflows and steps;
- send/recv and events for human-in-the-loop;
- queues with global and per-worker concurrency, rate limits, priority, deduplication and per-partition concurrency.

That suits one owner on one machine today who wants to deploy later by pointing at a hosted Postgres.

How the alternatives compare:
- Temporal is more battle-tested and also MIT. It needs a separate server, its start-dev mode is not for production, and workflow code must be deterministic.
- BullMQ is an MIT Redis queue with at-least-once delivery in the worst case and no step memoization.
- Inngest's server is SSPL, with delayed Apache release.
- Vercel Workflow is beta, TypeScript-only, and its Postgres World is community-maintained.
- Prefect (Apache-2.0) fits batch Python pipelines, but its human-input flow lives in Prefect's own UI.
- Src: https://docs.dbos.dev/; https://docs.dbos.dev/python/tutorials/workflow-communication; https://docs.dbos.dev/python/tutorials/queue-tutorial; https://github.com/temporalio/temporal; https://docs.temporal.io/cli/server; https://temporal.io/pricing; https://docs.bullmq.io/; https://github.com/inngest/inngest; https://github.com/vercel/workflow; https://workflow-sdk.dev/docs/deploying; https://github.com/PrefectHQ/prefect; https://docs.prefect.io/v3/get-started

### Hosted eval/observability platforms (Braintrust, LangSmith, W&B Weave, MLflow, Langfuse) [high]
None of these is the system of record.

Phase 1: Inspect View plus your own ledger viewer is enough.

Phase 2 (optional): add Langfuse as a debugging and trace UI. Either use Langfuse Cloud (Hobby is free at 50k units/month; research use gets up to 100% off), or self-host it. Feed it from OpenTelemetry, or from OpenRouter Broadcast for OpenRouter calls.

Skip Braintrust, LangSmith and Weave for this project. MLflow is the acceptable OSS alternative if you ever need a model/prompt registry, but it adds little over Inspect plus Langfuse here.
- Why: Paper-grade archives need indefinite retention and open export:
- Braintrust: free tier keeps 14 days; Pro is $249/month with 30-day retention; on-prem only on Enterprise.
- LangSmith: base traces keep 14 days (180 days costs extra); Plus is $39/seat; self-hosting only on Enterprise.
- Weave self-managed: needs a Weave-enabled licence from W&B plus Kubernetes 1.29+. It does have a free academic tier with 25 GB/month ingestion.
- MLflow: Apache-2.0 and self-hostable, with tracing, LLM judges and human feedback.
- Langfuse: all core features are MIT (tracing, evals, experiments, annotation). Self-hosting needs Postgres, ClickHouse, Redis and S3, which is heavy for one person. Use the Cloud tier until you deploy.
- Src: https://www.braintrust.dev/pricing; https://www.langchain.com/pricing; https://docs.coreweave.com/weave/guides/platform/weave-self-managed; https://coreweave.com/forge-pricing; https://github.com/wandb/weave; https://mlflow.org/docs/latest/genai/; https://mlflow.org/docs/latest/genai/assessments/feedback/; https://langfuse.com/docs/open-source; https://langfuse.com/self-hosting; https://langfuse.com/pricing; https://openrouter.ai/docs/guides/features/broadcast

### OpenAI Evals and promptfoo [high]
Do not build on OpenAI Evals.

Use promptfoo only as an optional CI regression check on frozen prompts. Example: a nightly run that confirms the frozen critic prompt still ranks the calibration set correctly, i.e. every strong reference site scores above every generic AI page. Do not use it as the experiment engine.
- Why: OpenAI Evals:
- OpenAI's own cookbook says it is winding down the Evals product and points users to promptfoo.

promptfoo:
- It is MIT and very popular (25.7k stars), and was acquired by OpenAI on 2026-03-09. The team has promised to keep it open source and multi-provider.
- Its model is a prompt × provider matrix, which suits single calls but not multi-stage agent pipelines with sandboxes, renders and human checkpoints.
- Of its model-graded assertions, only llm-rubric accepts images.
- Src: https://developers.openai.com/cookbook/examples/evaluation/moving-from-openai-evals-to-promptfoo; https://github.com/openai/evals; https://www.promptfoo.dev/blog/promptfoo-joining-openai/; https://github.com/promptfoo/promptfoo; https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/

### Model access, routing, cost tracking and version pinning [high]
1. Call Anthropic, OpenAI and Gemini directly through Inspect's native providers. Call fal.ai directly for image and video.
2. Use OpenRouter only for models you cannot reach directly. On every request set provider.order=[one provider] and allow_fallbacks=false, and log the serving provider.
3. Keep the price table in the repo, versioned, and compute cost from logged token counts. Use the image-token formula ⌈w/28⌉×⌈h/28⌉ for Claude.
4. Do not put a LiteLLM proxy in the trust path. If you ever need one, use its pinned Docker image, not a PyPI install.
5. If you go all-in on Vercel later, Vercel AI Gateway is the best single-gateway alternative: zero token markup, BYOK, per-request cost and finalProvider metadata. Set only=[provider], and note that BYOK failures can fall back to system credentials.
- Why: Direct calls give the cleanest provenance for reviewers: the exact model ID, the provider-native features (batch, Files API), and no hidden routing.

Gateways route across providers by default:
- Claude can also be served by Bedrock or Vertex, and Anthropic notes that those platforms set their own retirement schedules.
- OpenRouter does support exact pinning (order + allow_fallbacks:false). It charges 5.5% on card credit purchases and does not log prompts by default.

LiteLLM: PyPI releases 1.82.7 and 1.82.8 were compromised on 2026-03-24 with a credential stealer that harvested environment variables and keys. That is exactly what an eval box full of API keys holds. Its Docker image was unaffected.
- Src: https://openrouter.ai/docs/guides/routing/provider-selection; https://openrouter.ai/docs/faq; https://vercel.com/docs/ai-gateway; https://vercel.com/docs/ai-gateway/models-and-providers/provider-filtering-and-ordering; https://docs.litellm.ai/blog/security-update-march-2026; https://docs.litellm.ai/docs/proxy/cost_tracking; https://docs.litellm.ai/docs/proxy/logging; https://platform.claude.com/docs/en/build-with-claude/vision; https://platform.claude.com/docs/en/docs/about-claude/model-deprecations

### Model lifecycle and sampling controls (reproducibility) [high]
For Claude, choose only models whose retirement date is no earlier than mid-2027:
- claude-opus-5-5 (not before 2027-09-22)
- claude-sonnet-5-5 (not before 2027-09-28)
- claude-fable-5-1 (not before 2027-09-01)

Exclude Haiku 4.5 (could retire from 2026-10-15) and Sonnet 4.5 (retires 2026-11-30).

For Gemini, use stable model IDs, never 'latest' aliases. For OpenAI, record the model string returned in each response.

Do not set temperature, top_p or top_k on Claude 4.7+: they return a 400 error. Record 'provider default sampling' in the methods section, and handle randomness with N independent replicates per cell, reporting variance.
- Why: Anthropic gives at least 60 days' notice and lists tentative retirement dates. Models retired in 2025–26 have already broken earlier comparative work, and Anthropic itself notes that researchers lose access.

Gemini's 'latest' aliases get swapped out on each new release.

With fixed sampling unavailable, a re-run cannot reproduce outputs bit for bit. Reproducibility therefore has to mean:
1. archived artifacts and judgments, so anyone can re-analyse;
2. a re-runnable harness, so anyone can run a conceptual replication on new models.
- Src: https://platform.claude.com/docs/en/docs/about-claude/model-deprecations; https://ai.google.dev/gemini-api/docs/models

### Headless rendering (Playwright) for critics and raters [high]
Turn the runbook's render.mjs into a render service.

Environment:
- run it in the version-pinned official Playwright image (e.g. v1.63.0-noble);
- bundle the fonts.

Capture settings:
- emulateMedia({reducedMotion:'reduce'});
- screenshot with animations:'disabled', caret:'hide', scale:'css';
- fixed viewports;
- networkidle plus a fixed settle delay.

Input handling:
- slice full-page captures into viewport-height tiles, so no image is downscaled past legibility;
- log the exact post-resize pixels each judge saw;
- in GREAT mode, keep each request at 20 images or fewer.

Use the same tiles for human raters, shown in a scrolling frame.
- Why: Playwright warns that rendering varies with OS, version, hardware, power source and headless mode. It recommends pinning the Docker image version.

A 1440×7000 full-page PNG goes above Claude's high-resolution limit (2576 px long edge, 4784 visual tokens) and is shrunk to roughly 530 px wide. The critic would then judge a thumbnail.

Above 20 images per request, a stricter 2000 px per-image limit applies. Five designs × three captures in GREAT mode is already 15 images.
- Src: https://playwright.dev/docs/test-snapshots; https://playwright.dev/docs/api/class-page#page-screenshot; https://playwright.dev/docs/docker; https://platform.claude.com/docs/en/build-with-claude/vision

### Sandboxing agent-generated code [medium]
Default: local Docker through Inspect's built-in Docker sandbox.
- Use pinned images, one container per sample, and non-root users.
- Allow outbound network only to package registries during the build, then cut it off.
- Use separate spend-capped keys.

On Windows, run the harness inside WSL2 with Docker Desktop.

To scale out, use Inspect's existing k8s, Modal or Daytona sandbox providers.

Only if you standardise on Vercel later: write a small custom Inspect sandbox provider for Vercel Sandbox. E2B also needs a custom provider.
- Why: Docker is free and reproducible through image digests, and Inspect supports it out of the box. Inspect's provider list (docker, k8s, daytona, modal, ec2, proxmox, vagrant, openshell, local) includes neither Vercel Sandbox nor E2B.

Vercel Sandbox:
- Firecracker microVMs;
- Pro rates of $0.128 per active-CPU hour and $0.0212 per GB-hour of memory;
- 24-hour sessions and up to 10,000 concurrent sandboxes.

E2B:
- $0.000014 per vCPU-second;
- Hobby sessions capped at 1 hour, Pro ($150/month) at 24 hours;
- infra is Apache-2.0 but complex to self-host.

Both are good burst options, but neither is needed for paper 1's scale.
- Src: https://inspect.aisi.org.uk/sandboxing.html; https://vercel.com/docs/vercel-sandbox; https://vercel.com/docs/sandbox/pricing; https://e2b.dev/pricing; https://github.com/e2b-dev/infra; https://playwright.dev/docs/docker

### Human-rating collection [high]
Build a rater app with:
- blinded stimulus display;
- balanced incomplete-block assignment, with each rater seeing a counterbalanced subset;
- pairwise and/or anchored-scale trials;
- attention and consistency checks;
- per-trial timing;
- an expert-panel mode.

Use jsPsych (MIT) for the trial timeline, or write it in React. Store responses in your own Postgres.

Use the Prolific API to:
- create draft studies;
- pass PROLIFIC_PID, STUDY_ID and SESSION_ID through the external URL;
- set completion codes, approve submissions and pay bonuses.

Use Prolific's AI Task Builder only for quick pilots. Skip Label Studio Community and Argilla.
- Why: The study needs randomised, counterbalanced, multi-rater designs over tall web-page stimuli. Off-the-shelf tools fall short:
- Label Studio Community has no task overlap, agreement metrics or reviewer workflow (those are Starter Cloud/Enterprise), and no automatic assignment (Enterprise only).
- Argilla is in maintenance mode, with no new features.
- Prolific's AI Task Builder supports pairwise use cases and configurable overlap, but its docs don't cover counterbalancing or timing.

Prolific charges a 33.3% platform fee to academic/non-profit customers and 42.8% to corporate ones. Minimum pay is $8/hour; $12/hour is recommended.

jsPsych has documented Prolific integration and a JOSS citation (de Leeuw et al., 2023). Reviewers in behavioural fields recognise it.
- Src: https://www.prolific.com/pricing; https://docs.prolific.com/api-reference/introduction; https://docs.prolific.com/api-reference/studies/create-study; https://docs.prolific.com/api-reference/ai-task-builder; https://www.jspsych.org/latest/overview/prolific/; https://github.com/jspsych/jsPsych; https://labelstud.io/guide/label_studio_compare; https://labelstud.io/templates/pairwise_comparison; https://github.com/HumanSignal/label-studio; https://github.com/argilla-io/argilla

### Analysis stack [high]
Confirmatory analysis in R brms (cmdstanr backend):
- ordinal cumulative models for rating scales;
- crossed random effects for rater, task brief and generation run;
- the same design for pairwise outcomes.

Use brms simulation to drive the power analysis behind the budget.

Exploratory work in Python with pandas, DuckDB and Bambi, starting from Inspect's dataframes.

Use statsmodels only for quick checks.

Publish the analysis as a single rendered script inside the replication package.
- Why: brms (GPL-2) covers ordinal families, crossed multilevel structures, distributional models, priors, LOO and Bayes factors in standard (1|rater) syntax. That is exactly a crossed rater × item rating design.

Bambi (MIT, built on PyMC) has cumulative and sratio families, but its ordinal tutorial shows only fixed effects.

statsmodels MixedLM handles only some crossed models (the whole dataset as one group) and has no ordinal mixed models.
- Src: https://paulbuerkner.com/brms/; https://bambinos.github.io/bambi/; https://bambinos.github.io/bambi/notebooks/ordinal_regression.html; https://www.statsmodels.org/stable/mixed_linear.html; https://inspect.aisi.org.uk/dataframe.html

### Cost estimation and budget gates (build) [medium]
Build a preflight estimator that multiplies cells × replicates × expected calls × tokens, including image tokens, by a versioned price table. Add sandbox minutes and Prolific (participant pay + 33.3% or 42.8% fee). Show this itemized total before any spend.

Enforce hard per-study and per-run caps inside the runner, which aborts on the next step.

Run a 5% pilot first, then refit the estimator from the pilot's measured usage.

Use provider-side spend limits only as a backstop.
- Why: No reviewed tool gives a pre-spend itemized estimate across LLM, image, sandbox and human costs.

Gateway budgets are not enough. Vercel's budgets have soft-cap semantics and do not cover BYOK spend.

Critic cost grows with image tokens: ⌈w/28⌉×⌈h/28⌉ per image, up to 4784 tokens on Claude 4.7+.
- Src: https://vercel.com/docs/ai-gateway; https://platform.claude.com/docs/en/build-with-claude/vision; https://www.prolific.com/pricing; https://vercel.com/docs/sandbox/pricing

### Human checkpoints and replication package (build) [high]
End every stage at each human checkpoint (pick, CUT list, TELLS swap, VOICE copy). Store the decision as a typed, hashed artifact that becomes the next stage's input.

Bind each checkpoint per study to one of:
- **live:** the owner acts in the app;
- **policy:** a preregistered rule (keep all, blind-random, first);
- **ai-proxy:** a held-out model decides;
- **replay:** a recorded decision is reused.

Export a replication package containing:
- code at a git SHA and image digests;
- recipe YAML and price table;
- all prompts by hash;
- Inspect .eval logs and Parquet ledgers;
- renders and tiles;
- rater data, de-identified;
- the analysis script.
- Why: Splitting stages at checkpoints means the engine never has to wait days inside a running sample, and Inspect checkpointing is not built for that anyway. It also makes human influence an explicit, controllable variable, which leave-one-out ablations and 'C1 vs plain' comparisons need.

Inspect eval-sets reuse completed samples on retry, so a stage can be resumed on its own.
- Src: https://inspect.aisi.org.uk/checkpointing.html; https://inspect.aisi.org.uk/eval-sets.html; https://docs.dbos.dev/python/tutorials/workflow-communication

## Options
### Inner execution and evaluation framework (generation stages + AI judges/metrics) -> Inspect AI
- Inspect AI (MIT, UK AISI): + - Sandboxed coding-agent workers with every model call captured
- Model roles and multi-model judge panels
- Image inputs and batch mode
- Eval-set retry and resume
- Open .eval logs that load into dataframes
- Free | - - Python only
- No rater UI (the human agent is for task performance)
- No screenshot tool
- Image-gen calls must be logged as custom events (needs a spike)
- promptfoo (MIT, now OpenAI-owned): + - Fast config-driven prompt × provider matrices
- Good fit for CI
- Runs locally | - - Single-call model, not built for multi-stage agent pipelines
- Only llm-rubric grades images
- Acquired by OpenAI in March 2026
- OpenAI Evals: + - MIT repo
- Familiar YAML model-graded evals | - - OpenAI is winding down the Evals product
- Single-provider orientation
- MLflow GenAI (Apache-2.0): + - Self-hostable
- Tracing, LLM judges, human feedback
- Linux Foundation governance | - - Generic MLOps shape
- No sandbox/agent-bridge equivalent
- More glue code for agent runs
- Braintrust / LangSmith / W&B Weave: + - Polished UIs, datasets, experiments, annotation | - - SaaS-first
- 14–30-day base retention (Braintrust, LangSmith)
- Self-hosting is Enterprise or licensed (Weave also needs Kubernetes)
- Weak archival story
- Fully custom harness: + - Total control | - - Re-implements retries, provider adapters, sandboxes and logs
- Slower
- Less credible to reviewers than a known framework
### Outer orchestration / durable execution for multi-day studies with human checkpoints -> DBOS Transact (Temporal as fallback)
- DBOS Transact (MIT library on Postgres/SQLite): + - No separate server; local-first
- Python and TypeScript
- Durable steps
- send/recv for humans
- Queues with partitioned concurrency and rate limits | - - Smaller community (about 1.6k stars)
- Managed Conductor pricing not checked
- Long recv waits need confirming in a spike
- Temporal (MIT; Cloud $50/M actions): + - Most battle-tested
- Signals and updates for humans
- Python and TypeScript SDKs
- OpenAI Agents SDK integration | - - Separate server (start-dev is not for production)
- Deterministic workflow-code constraints
- Steeper learning curve
- Inngest: + - Great developer experience
- waitForEvent-style human steps
- Free tier of 50k executions | - - Server is SSPL (delayed Apache), a concern if this becomes a product
- Free tier limited to 5 concurrent steps
- Vercel Workflow (Apache-2.0): + - Elegant 'use workflow' directives
- Natural with Next.js on Vercel | - - Beta
- TypeScript only
- Self-host Postgres World is community-maintained
- Pulls toward Vercel
- Prefect 3 (Apache-2.0): + - Python
- Caching and retries
- Pause for human input
- Self-hosted server | - - Batch/data-pipeline shape
- Human input lives in Prefect's own UI, not yours
- BullMQ (MIT, Redis): + - Simple, fast queues
- Parent-child flows | - - No durable step memoization
- At-least-once delivery in the worst case
- You hand-roll resume logic
### Model access and routing -> Direct provider APIs via Inspect + pinned OpenRouter for long-tail + fal.ai direct
- Direct provider APIs via Inspect providers + OpenRouter pinned for long-tail + fal.ai direct: + - Cleanest provenance
- Exact model IDs
- Native batch and Files API
- No hidden fallbacks | - - Several keys and invoices
- Cost meter must be built in-house
- Vercel AI Gateway for everything: + - Zero markup, BYOK
- Per-request cost and finalProvider metadata
- Budgets
- Image and video modalities | - - Routes across providers unless only=[x] is set
- BYOK can fall back to system credentials
- Budgets are soft caps
- OpenRouter for everything: + - One key, many models
- order + allow_fallbacks:false pinning
- Broadcast to Langfuse and others | - - 5.5% fee on card credit purchases
- One more intermediary between you and the model
- Self-hosted LiteLLM proxy: + - MIT core
- Spend tracking per key
- Many logging sinks | - - PyPI supply-chain compromise on 2026-03-24
- Enterprise features need a licence
- One more service to secure
### Sandbox for agent-generated code -> Local Docker via Inspect; scale with Inspect's existing providers
- Local Docker via Inspect (pinned images): + - Free and built in
- Reproducible through image digests
- Works offline | - - Limited by local machine capacity
- Windows needs WSL2 and Docker Desktop
- Inspect k8s / Modal / Daytona providers: + - Scale-out without custom code | - - Extra accounts and infrastructure
- Vercel Sandbox: + - Firecracker microVMs
- Active-CPU billing (~$0.128 per CPU-hour)
- 24-hour sessions
- High concurrency | - - Needs a custom Inspect sandbox provider
- Pulls toward Vercel
- E2B: + - Per-second billing
- Apache-2.0 infra | - - Needs a custom Inspect provider
- Hobby sessions capped at 1 hour
- Self-hosting is complex
### Human-rating collection -> Custom rater app + Prolific API
- Custom rater app (jsPsych or React) + Prolific API: + - Full control of blinding, counterbalancing, attention checks and timing
- Same app serves expert panels
- Recognised in behavioural research | - - Must be built and tested (ethics and consent screens included)
- Prolific AI Task Builder: + - Zero hosting
- Pairwise and model-evaluation use cases
- Configurable overlap | - - Counterbalancing, timing and export not documented
- Less control over tall-page stimuli
- Label Studio Community: + - Apache-2.0
- Pairwise/ranking templates | - - Overlap, agreement metrics and reviewer workflow are Starter Cloud/Enterprise only
- Automatic assignment is Enterprise only
- Argilla: + - Apache-2.0
- Hugging Face ecosystem | - - Maintenance mode; no new features
### Analysis stack -> R brms + Python Bambi
- R brms (confirmatory) + Python Bambi/pandas (exploratory): + - Ordinal and crossed random effects
- Priors, LOO and power simulation
- Widely accepted by reviewers | - - Two languages
- Stan compile times
- Python only (PyMC/Bambi): + - One language | - - Bambi's ordinal tutorial shows only fixed effects
- More custom PyMC code
- statsmodels (frequentist): + - Simple and fast | - - Only some crossed models
- No ordinal mixed models
### How human checkpoints run inside experiments -> Stage-split + binding
- Stage-split + binding (live / policy / ai-proxy / replay): + - Human influence becomes an explicit variable
- Engine-agnostic
- Replayable | - - More stage plumbing
- Recipes must declare their checkpoints
- Durable in-workflow waits (signals): + - Natural for interactive app runs | - - Hides human variance inside runs
- Harder to swap in a policy
- Inspect intervention/approval: + - Built in | - - Meant for tool approvals, not multi-day taste decisions
- Checkpointing is not for long waits
### C1 worker implementation in experiments -> Coding-agent CLIs via Inspect agent bridge with a harness-driven loop
- Coding-agent CLIs (Claude Code / Codex) in a sandbox via Inspect agent bridge; harness drives the critic loop and hidden threshold: + - Faithful to the article's workflow
- Every model call logged
- Harness enforces isolation and stop rules | - - CLI versions and system prompts must be pinned and recorded
- Long samples
- Agent-orchestrated loop exactly as in the article (worker calls a critic subagent): + - Maximum fidelity | - - The worker controls the loop; threshold secrecy and isolation are hard to verify
- Custom API tool-loop agent: + - Maximum control and cheaper | - - Not the article's setup, which weakens the replication claim

## Risks
- Model retirement breaks re-runs before or after publication. Claude Haiku 4.5 could retire from 2026-10-15; Sonnet 4.5 retires 2026-11-30. => - Use only models whose retirement is no earlier than mid/late 2027 (Opus 5.5, Sonnet 5.5, Fable 5.1, stable Gemini IDs).
- Archive every artifact and judgment.
- Define replication as re-analysis of the frozen data, plus a conceptual re-run on successor models.
- Sampling cannot be fixed. Claude 4.7+ rejects non-default temperature/top_p/top_k, so reruns are not bit-identical. => - Run N replicates per cell and model run-level random effects.
- Report variance.
- Log 'provider default sampling'.
- Never rely on seeds for Claude.
- Silent provider fallback or model drift through gateways (e.g. Claude served via Bedrock or Vertex, whose schedules differ). => - Prefer direct APIs.
- On OpenRouter, set order=[x] and allow_fallbacks=false.
- On Vercel, set only=[x].
- Log the serving provider and model string on every call; fail the sample if it doesn't match.
- Critic or judge sees downscaled thumbnails, because full-page screenshots exceed long-edge or visual-token limits (and >20 images triggers the 2000 px rule). Cross-family judges also see different pixels. => - Tile captures to viewport height.
- Cap images per request.
- Log the post-resize image hashes.
- Equalize tiles across judges and human raters.
- Render variance across machines (fonts, GPU, headless mode) confounds conditions. => - Render only inside the pinned Playwright image with bundled fonts.
- Disable animations, set reduced motion, use fixed viewports and a settle delay.
- Re-render a random 5% as a determinism check.
- Supply-chain or credential theft from generated code or dependencies. LiteLLM 1.82.7/1.82.8 were malicious on PyPI in March 2026. => - Run generated code only in containers, as non-root, with egress limited after the build.
- Give the agent separate spend-capped keys, never mounted into sandboxes.
- Use hash-pinned lockfiles and pinned image digests.
- No LiteLLM PyPI installs.
- Vendor ownership or pricing changes (promptfoo→OpenAI, Langfuse→ClickHouse, W&B→CoreWeave, SaaS retention windows) strand data. => - Keep the system of record in your own open formats (.eval, Parquet, content-addressed blobs).
- Treat any SaaS as a mirror or UI only.
- Orchestrator immaturity or learning curve (DBOS has a smaller community; Temporal has determinism rules). => - Keep steps pure and stage-split so the engine is swappable.
- Run a 2-day spike covering crash-resume, multi-day recv waits and rate-limited partitions before committing.
- Human checkpoints confound the C1-vs-baseline and ablation contrasts. A live human picking or editing in only some arms biases results. => - Bind checkpoints to preregistered policies in confirmatory arms.
- Test live-human effects in a separate, smaller arm.
- Record every human decision as an artifact.
- Rater-data quality and cost overruns (Prolific fee 33.3% academic vs 42.8% corporate; pay floor $8/hour). => - Build attention and consistency checks.
- Pilot at about 5% of N and refit the cost model.
- Hard budget caps in the runner.
- Confirm academic eligibility early.
- Inspect gaps: no rater UI, no screenshot tool, and image-gen calls are not native model calls. => - Build the render service and the rater app.
- Log fal.ai and other non-chat calls as custom events plus ledger rows.
- Validate in the spike before scaling.

## Questions
- Is a Python backend acceptable, with Inspect, DBOS and the analysis in Python and only the app UI in TypeScript? An all-TypeScript stack would push toward Vercel Workflow and a custom harness, at a cost to reproducibility.
- Do you expect to deploy the eventual product on Vercel? If yes, it becomes worth writing a custom Inspect sandbox provider for Vercel Sandbox and considering Vercel AI Gateway. If not, stay cloud-agnostic with Docker plus Inspect's k8s, Modal or Daytona providers.
- Are you, or a planned co-author, affiliated with an academic institution that has an ethics board (IRB/REC)? It sets Prolific's fee (33.3% vs 42.8%), unlocks the Langfuse and W&B research tiers, and reputable venues will expect ethics approval or exemption for the rater studies.
- For C1 experiments, should the worker be the real coding-agent CLIs, as in the article (my recommendation, via Inspect's agent bridge with a harness-driven critic loop)? Or an API-driven agent loop you fully control?
- Are you willing to publish the full replication package: prompts, generated pages, screenshots, judge outputs and de-identified rater data? This affects consent wording and a review of provider and asset terms before data collection.
- Are open-weight models in scope for paper 1? That adds OpenRouter or self-hosting, and it changes the routing and pinning setup.
- For paper 1, may live human checkpoints (pick, CUT, VOICE) be replaced by preregistered policies in the confirmatory arms, with a smaller live-human arm alongside? This decides how much of each configuration the harness must automate.
