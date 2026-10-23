# Node's fetch limits (2026-10-22)

The local test the waits design cites ([designs/2026-10-22-answer-waits.md](../../designs/2026-10-22-answer-waits.md)): "Node's fetch gives up after 5 minutes without headers, or 5 minutes between body bytes (my local test: both failed at 304 s)", and, for the image caps, "the local test shows the cap is gone". Claude wrote and ran both scripts on 2026-10-22 for that design, against a server on 127.0.0.1 only, with no provider and no key. They were kept only in the session's scratchpad under Temp (`block2-plan/`). Claude brought them in on 2026-10-22, in block 2's records pass, unchanged.

- [undici-timeouts.mjs](undici-timeouts.mjs) and its output, [undici-timeouts.out.txt](undici-timeouts.out.txt) (Node 24.13.1, undici 7.18.2): Node's built-in fetch against a body that goes silent after one byte, a body kept alive by a small write every 30 s for 7 minutes, and headers held for 330 s, first with Node's default dispatcher and then with an undici Agent whose header and body timeouts are 400 s. With the default, the silent body and the held headers both failed after 304 s (`UND_ERR_BODY_TIMEOUT`, `UND_ERR_HEADERS_TIMEOUT`), and the kept-alive body finished after 420 s; with the raised Agent, the held headers came through after 330 s.
- [undici-symbols.mjs](undici-symbols.mjs): what Node's global dispatcher is once fetch has run, and which of its own fields hold the header and body timeouts. Its output was not kept.

They record what was run; they are not tests that run today. The run that wrote the output took 420 s.

## Run again on 2026-10-23 (block 2's fix round)

In block 2's fix round the web builder moved the gateway's undici from 7.18.2 to 7.30.1 (323145c, SECURITY-1). It ran this probe again, unchanged, and a probe of the same shape on the package the gateway now pins. Both outputs and the second script were kept only in the session's scratchpad under Temp (`undici-audit/`). Claude brought them in on 2026-10-23, in the records pass of block 2's second fix round, unchanged (each has the SHA-256 of its original), after scanning them for the owner's address and the organisation's details: no hits. They are in [rerun-2026-10-23/](rerun-2026-10-23/).

- [evidence-probe-rerun.out.txt](rerun-2026-10-23/evidence-probe-rerun.out.txt): undici-timeouts.mjs run again on Node 24.13.1 with Node's own undici 7.18.2. The same results, with 305 s where the first run gave 304 s.
- [package-timeouts.mjs](rerun-2026-10-23/package-timeouts.mjs) and its output, [package-probe.out.txt](rerun-2026-10-23/package-probe.out.txt): the shape of `packages/gateway/src/providers/fetch.ts` (the undici package's own fetch with an Agent as its dispatcher) on undici 7.30.1, against the same routes and a JSON POST, with the package's default Agent and with one raised to 400 s. The default Agent failed the silent body and the held headers after 306 s; the raised one waited out headers held 330 s and a body silent for 330 s; the JSON POST worked.

The two ran side by side in the background, 420 s each. The advisory listings the builder read for the move (GitHub's advisory database and undici's own repository advisories, 2026-10-23) were left out: they are public, and ADR-0114 item 12 gives what they said.
