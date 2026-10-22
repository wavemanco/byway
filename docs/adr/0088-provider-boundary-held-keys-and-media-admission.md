# ADR-0088: The provider-key promise is enforced at every crossing; provider media is admitted by one rule on every URL and redirect hop

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 16:45 |
| **Track** | Product |

## Context

The gateway is byway's only path out to model providers ([ADR-0030](0030-own-model-gateway-sole-egress.md)). An external review (F16, F17) and its verification found that the gateway enforced its guarantees only on its own diagnostic records, and through advisory checks. It did not check the values that actually cross the boundary.

- **Keys (F16).** [ADR-0074](0074-local-app-security-model.md) and spec §2 promise that keys never reach the database, the ledger, artifacts, logs, prompts, responses or the browser. In code, the redactor ran only on the gateway's stored request and response bodies and on error messages. A key the person pasted was stored as typed (intake, refs, checkpoints), shown back, and sent to the provider in the prompt. A provider's answer that echoed it was returned and memoized. The served model and upstream host went to the ledger unredacted. The redactor's own comment claimed it was "applied to every outbound string".
- **Media (F17).** fal's `download()` checked only that a URL began with `https://`. Redirects were followed to any host, including a downgrade to plain-HTTP loopback, whose body was stored as a billed `video/mp4` clip. The 200 MiB ceiling was enforced through the optional, encoded-length Content-Length header and a check after the whole body was buffered, so a chunked or gzip body was read in full first. The clip was typed from headers. A CDN 401 was classified as a provider 401, so the relay skipped the link with "No video provider key is configured" after the clip was paid for. No record said how far provider-returned media is trusted; [ADR-0069](0069-product-c5-relay-and-honest-skips.md) pointed at a gateway README that does not exist.

## Decision

Values are checked where they cross, with one exact rule per kind of value. Product text is refused, never rewritten. Diagnostic copies and provider labels keep the broader, lossy redaction.

**Held keys (amends ADR-0074's Keys bullet).**

- *The rule.* `findHeldKey` (`@byway/gateway`) names the provider variable (`KEY_VARS`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `FAL_KEY`) whose exact value appears in a text. It matches the whole trimmed value and each `:`-separated part, from 16 characters up, so a FAL_KEY's secret half is caught on its own. It returns the variable name, never the value, and reads the environment at call time.
- *Browser to server.* `parseBody` takes the check as a required parameter and refuses a JSON body holding a key, record property names included, with a 400 naming the variable. This happens before the route stores or sends anything, on all six POST routes and `PATCH /api/settings`, in demo mode too.
- *Gateway to provider.* `complete()` (system text and every text part), `image()` and `video()` (the prompt) refuse a request holding a key with `invalid-request`. The refusal comes after validation and before profile resolution, reservation, the exposure record or any call. This covers every caller of the gateway: the runner, the advisor and anything added later.
- *Provider to gateway.* A billed completion whose text holds a key is ledgered first, with its evidence redacted. It is then rejected as a non-retryable `provider-error`. The text never reaches the result, memos, artifacts or events. The paid answer is kept only as its redacted evidence copy. This is a deliberate exception to [ADR-0080](0080-phase-4-recheck-corrections.md)'s "paid answers are kept": keeping it would keep the key.
- *Provider labels.* The served model and the upstream host are labels, not content. They are scrubbed with the redactor in the ledger, and the results return the scrubbed value. They are never a reason to refuse a paid call, so images and clips gain no billed-failure path.
- *How the failure reads.* Held-key errors carry a `heldKey` marker on the existing `GatewayError` codes, so there is no contracts change. A held-key image refusal stops an ASSET step, under its existing rule that key problems stop the step. The advisor's routes show the gateway's own message (400 for a refused request, 502 for a refused answer). A run step fails with that message.
- *Two secret sets, on purpose.* Refusal uses only the `KEY_VARS` values (whole, or `:`-parts of 16 or more characters), because a false positive blocks the person's submission or a paid answer. Scrubbing diagnostic copies uses every `*_KEY`/`*_TOKEN`/`*_SECRET`/`*_PASSWORD` value of 8 or more characters, the same `:`-parts, and key shapes (`sk-…`, `AIza…`, bearer tokens). A false positive there costs nothing. Shape matching is never applied to product text: it would rewrite a legitimate quoted placeholder.

**What the promise does not cover.**

- Data stored before this change (SQLite, artifacts, Temporal history) is not scanned. A run whose stored material holds a key fails on its next new model call, with a message naming the variable.
- Images are sent unchecked, since there is no OCR. The inbound text check still stops an echo.
- What a person types stays in their own browser tab's session draft on Start until they edit it. byway's server never stores it.

So "keys never enter prompts" holds for text submitted after this change.

**Provider media (extends ADR-0069; supersedes its pointer to a gateway README).**

- *One admission rule.* Every URL fetched, the first and each redirect hop alike, must be `https:` on the default port, with no userinfo, on `fal.media` or a subdomain of it. URL parsing normalises decimal and hex IPv4 and lowercases the host. IP literals, `[::1]`, trailing-dot names (`localhost.`, `v3.fal.media.`), `nip.io` and suffix tricks, other ports, userinfo and plain `http` all fail. With verified TLS to fal's own name on every hop, a loopback or LAN service cannot answer, so no connect-time address pinning is added.
- *Redirects and time.* Redirects are followed by hand, at most 3. A 3xx without a Location is refused. One deadline covers the whole download.
- *Size.* The bytes the reader yields are counted as they stream. These are decoded bytes, so a gzip body is bounded too. The body is cancelled at the 200 MiB cap. A declared Content-Length over the cap is refused before reading.
- *Type.* The clip is typed from its bytes (an MP4 `ftyp` box, or WebM's EBML magic). Anything else is ledgered but not kept.
- *Status.* A media host's HTTP status is a media failure (`provider-error`, retried only for 408, 429 and 5xx), never a provider-API status.
- *Evidence.* The stored response records the origins each download used (`media.clip`, `media.frame`).

## Alternatives considered

- **Shape redaction of product text (the review's repair)**: rejected. It rewrites legitimate content, and filtering only the output leaves the input path open: a pasted key would still be stored and sent.
- **Refusing image or clip results over their metadata**: rejected. It adds billed failures that the ASSET step would buy again; metadata is scrubbed instead.
- **Connect-time IP pinning (a custom dispatcher)**: rejected. It is unnecessary once every hop is verified HTTPS on fal's domain.
- **A deny-list hop rule (IP literals, localhost, single labels)**: rejected. It is bypassable: `localhost.` passes it, and a locally trusted certificate answers.
- **A record-only host allowlist**: rejected. It leaves the boundary switched off until a paid check.
- **Narrowing the documents instead of enforcing them**: rejected. It documents the exposure away.

## Consequences

**Positive**

- A pasted key is refused at submission, never sent to a provider, and never handed on from an answer. Legitimate text is never altered.
- Provider media can come only from fal's media domain, in bounded memory, typed by what it is. A CDN failure no longer reads as a missing key.

**Negative**

- fal's live media host set could not be confirmed offline. The evidence is the client's `fal-cdn-v3` uploads and `v3b.fal.media` examples. If fal serves or redirects a clip outside `fal.media`, that relay link fails after it was billed. The step fails non-retryably with a message naming the host, so the cost is one clip per attempt, and the fix is to add that host. The set can be confirmed at no cost from the stored response of any earlier live link (`video.url`, and `media` from now on).
- A run started before the upgrade whose material holds a key now fails on its next new model call. This follows the spirit of [ADR-0078](0078-runs-from-older-engine-versions-end-plainly.md).

## Evidence

- [External-review verification](../reviews/2026-10-08-external-review-verification.md), cluster G (F16, F17: both "accept, partly", P3), recommendation B.
- The original review: `C:/Users/arvik/code/byway_review/byway-review.md` (outside the repository).
- Tests: `packages/gateway/test/keys.test.ts`, `gateway.test.ts` and `video.test.ts`; `packages/runner/test/memo.test.ts` and `activities.test.ts`; `apps/web/test/http.test.ts`, `services.test.ts` and `api.test.ts`; `apps/web/e2e/pasted-key.spec.ts`.

## Later notes

Notes appended under [ADR-0103](0103-adr-log-rule-and-ci.md) rule 1; the Context and Decision above are unchanged.

- **2026-10-18, from a trace of the external review's findings against main (8401820).** "What the promise does not cover" leaves out a case [ADR-0101](0101-c3-yes-decides-the-header-image.md) names under "Held keys": the gateway checks an answer's raw text, and a JSON answer's `\u` escapes are decoded after that check, so a key a model wrote as escapes would pass. byway never puts a key in a prompt, so a model has none to echo. The check also holds only for routes that read their body through `parseBody` (`apps/web/src/server/http.ts`), which every route does today; no test holds a new route to it ([ADR-0100](0100-corrections-found-by-the-final-re-check.md) item 11). The backlog row "Held keys the checks do not see" tracks both.
