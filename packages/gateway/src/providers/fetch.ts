/**
 * The fetch byway's text and image clients send their requests with (the waits design of 2026-10-22, section 2).
 *
 * Node's own fetch gives up on a request that has sent no headers for five minutes, or nothing of its body for five
 * minutes: undici's headersTimeout and bodyTimeout, 300 s each (undici is the library inside Node's fetch; the design's
 * local test saw both fail at 304 s). That would cut every Google call and every image off at about five minutes,
 * under any wait chosen in Settings' "How long to wait for an answer", and close an OpenAI or OpenRouter stream that
 * sends nothing for five minutes. So the Anthropic, OpenAI, OpenRouter and Google clients fetch through an undici Agent
 * (its connection pool) whose two timeouts are PROVIDER_TIMEOUT_MS, above the longest wait anyone can choose (75
 * minutes); byway's own deadlines do the timing: the stall bound on a stream (StreamIdle), the whole-call deadline of a
 * Google call or an image (Deadline), fal's from its job's acceptance. The Agent and its fetch are undici 7.18.2's, the
 * version Node 24.13.1 bundles, used as a package rather than by reaching into Node's internals.
 *
 * fal keeps Node's default fetch: its requests are short (a status poll every two seconds, a submission answered at
 * once), and its upload and result reads have no deadline of their own, so Node's limits are what bound them.
 */
import { Agent, fetch as undiciFetch } from 'undici';

/** How long the provider Agent waits for headers, and between body bytes: 80 minutes, above the longest wait (75). */
export const PROVIDER_TIMEOUT_MS = 80 * 60_000;

/** The one pool every text and image client shares, as Node's own fetch shares its global one. */
export const providerAgent = new Agent({ headersTimeout: PROVIDER_TIMEOUT_MS, bodyTimeout: PROVIDER_TIMEOUT_MS });

/**
 * Node's fetch on the provider Agent: undici's own fetch with the Agent as its dispatcher. The SDKs call it with the
 * request's URL as text and plain init fields (a JSON body, headers, a signal), which undici's fetch takes as Node's does.
 */
export const providerFetch: typeof fetch = (input, init) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: providerAgent }) as unknown as Promise<Response>;
