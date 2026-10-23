# Windows CI run 39936616796 (fix/fx-block2 at da1cd21), against run 39913862670 (160c027)

Per-file Windows test durations, ms: this run, the passing run of 160c027, and the ratio. Rows shown: files of 1.5 s or more, or 3x slower. Times are when the file finished (UTC). Made by ci-compare.cjs from 'gh run view <id> --log'.

```
10:08:50 105706 189817 x  0.6 packages/runner/test/pages.test.ts
10:08:55   4199   9934 x  0.4 packages/runner/test/page-copy.test.ts
10:10:27  89839 164493 x  0.5 packages/runner/test/voice.test.ts
10:11:27  59425 131112 x  0.5 packages/runner/test/page-arbiter.test.ts
10:11:34   6300  14621 x  0.4 packages/runner/test/asset-slots.test.ts
10:11:53  16069  40492 x  0.4 packages/runner/test/liveness.test.ts
10:11:57   3586   8448 x  0.4 apps/web/test/api.test.ts
10:12:08   3617   8972 x  0.4 packages/runner/test/critic.test.ts
10:12:14   2944   5837 x  0.5 packages/runner/test/voice-retry.test.ts
10:12:20   4998   7979 x  0.6 packages/runner/test/renderer-check.test.ts
10:12:32  10878  21371 x  0.5 scripts/test/adr-records.test.ts
10:12:40   7641  14961 x  0.5 packages/runner/test/cards.test.ts
10:12:45   2066   4463 x  0.5 packages/advisor/test/diff-semantics.test.ts
10:12:49   1553   2717 x  0.6 packages/runner/test/overlap.test.ts
10:13:01  11031  28750 x  0.4 packages/runner/test/semantics-effects.test.ts
10:13:08   1762   3064 x  0.6 apps/web/test/guard-sandbox.test.ts
10:13:10   1600   3319 x  0.5 packages/runner/test/sandbox.test.ts
10:13:16   4671  10490 x  0.4 packages/runner/test/step-limits.test.ts
10:13:29  11087  21441 x  0.5 packages/advisor/test/corpus.test.ts
10:13:33   3675   4131 x  0.9 packages/runner/test/activities.test.ts
10:13:37   4015   4975 x  0.8 packages/runner/test/restore.test.ts
10:13:48  10124   3629 x  2.8 packages/runner/test/declines.test.ts
10:14:06  17044   2272 x  7.5 apps/web/test/services.test.ts
10:14:26  14978   3782 x  4.0 packages/store/test/checkpoints.test.ts
10:15:12  42261  51081 x  0.8 packages/runner/test/real-prompts.test.ts
10:15:21   3682   5967 x  0.6 packages/runner/test/engine-state.test.ts
10:15:28   4003   8055 x  0.5 packages/runner/test/page-voice-prompt.test.ts
10:15:33   4066   4451 x  0.9 packages/gateway/test/billed.test.ts
10:15:42   1648   2869 x  0.6 packages/runner/test/prompt-shows.test.ts
10:15:52   5633  15531 x  0.4 scripts/test/claims-oracle.test.ts
10:16:13  17924  47289 x  0.4 packages/runner/test/dev-engine.test.ts
10:16:21   2643   6871 x  0.4 packages/runner/test/reconcile-while-running.test.ts
10:17:37  74835  83588 x  0.9 packages/runner/test/worker-loss.test.ts
10:17:43   4849   7269 x  0.7 apps/web/test/dev-server.real.test.ts
10:18:25   7348   8544 x  0.9 packages/store/test/spend-book.test.ts
10:18:35   2495   3674 x  0.7 packages/store/test/concurrency.test.ts
10:18:42   1872   2950 x  0.6 scripts/test/renderer-env.test.ts
10:19:35  48914  53479 x  0.9 packages/runner/test/configurations.test.ts
10:20:01  24710  31051 x  0.8 packages/runner/test/controls.test.ts
```

The two failures (vitest's default 5 s per test):

    2026-10-23T10:20:01.3436667Z  Test Files  2 failed | 230 passed (232)
    2026-10-23T10:20:01.3438259Z  FAIL  apps/web/test/services.test.ts > the service host > opens the store and the ledger in the data directory and recommends through the mock in demo mode
    2026-10-23T10:20:01.3440371Z Error: Test timed out in 5000ms.
    2026-10-23T10:20:01.3448162Z  FAIL  packages/runner/test/declines.test.ts > an image the model declined, when its step runs again (ADR-0102) > a worker lost during the retry: the next attempt makes the retry alone, and the declined image is not bought again
    2026-10-23T10:20:01.3449889Z Error: Test timed out in 5000ms.
    2026-10-23T10:20:01.3469445Z       Tests  2 failed | 5692 passed (5694)
    2026-10-23T10:20:01.3477828Z    Duration  777.61s (tests 91%, import 8%, transform 1%)
    2026-10-23T10:20:01.3664385Z ##[error]Error: Test timed out in 5000ms.
    2026-10-23T10:20:01.6455800Z ##[error]Error: Test timed out in 5000ms.

The same two tests on earlier Windows runs: 0.31-0.32 s (services.test.ts:199) and 0.36-0.61 s (declines.test.ts:268), in runs 39913862670, 39910300316, 39892869973 and 39844909103.
