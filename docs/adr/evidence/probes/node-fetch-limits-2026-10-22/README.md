# Node's fetch limits (2026-10-22)

The local test the waits design cites ([designs/2026-10-22-answer-waits.md](../../designs/2026-10-22-answer-waits.md)): "Node's fetch gives up after 5 minutes without headers, or 5 minutes between body bytes (my local test: both failed at 304 s)", and, for the image caps, "the local test shows the cap is gone". Claude wrote and ran both scripts on 2026-10-22 for that design, against a server on 127.0.0.1 only, with no provider and no key. They were kept only in the session's scratchpad under Temp (`block2-plan/`). Claude brought them in on 2026-10-22, in block 2's records pass, unchanged.

- [undici-timeouts.mjs](undici-timeouts.mjs) and its output, [undici-timeouts.out.txt](undici-timeouts.out.txt) (Node 24.13.1, undici 7.18.2): Node's built-in fetch against a body that goes silent after one byte, a body kept alive by a small write every 30 s for 7 minutes, and headers held for 330 s, first with Node's default dispatcher and then with an undici Agent whose header and body timeouts are 400 s. With the default, the silent body and the held headers both failed after 304 s (`UND_ERR_BODY_TIMEOUT`, `UND_ERR_HEADERS_TIMEOUT`), and the kept-alive body finished after 420 s; with the raised Agent, the held headers came through after 330 s.
- [undici-symbols.mjs](undici-symbols.mjs): what Node's global dispatcher is once fetch has run, and which of its own fields hold the header and body timeouts. Its output was not kept.

They record what was run; they are not tests that run today. The run that wrote the output took 420 s.
