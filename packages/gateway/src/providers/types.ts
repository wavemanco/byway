import type { ImageRequest, MediaType, ProviderId, ProviderJobRole, SpendContext, Tier, Usage } from '@byway/contracts';
import type { TokenBreakdown } from '../prices.ts';

/** An image part with its bytes loaded from the artifact store. */
export interface ResolvedImage {
  artifactId: string;
  mediaType: MediaType;
  base64: string;
}

export type ResolvedPart = { type: 'text'; text: string } | { type: 'image'; image: ResolvedImage };

export interface ResolvedMessage {
  role: 'user' | 'assistant';
  content: ResolvedPart[];
}

/** Who is asking: the mock answers by purpose and counts critic iterations by run and step. */
export type CallContext = SpendContext & { tier?: Tier; profileId: string };

export interface ProviderCompletionRequest {
  model: string;
  system?: string;
  messages: ResolvedMessage[];
  maxOutputTokens: number;
  responseFormat: 'text' | 'json';
  context: CallContext;
  /**
   * Aborts when the call's run is ending (SpendContext.operation.stop; ADR-0111). The gateway passes it only to an
   * adapter whose `cutsOff.complete` is true, and that adapter then cuts the call off when it aborts (its stream is
   * closed) and throws; the gateway counts what that leaves.
   */
  signal?: AbortSignal;
  /**
   * How long a streamed answer may go without a chunk before the adapter closes it as stalled (StreamIdle): the call's
   * model's wait, chosen in Settings or read by a relay step for it (the gateway's waitMs). Read by the streamed adapters
   * (Anthropic, OpenAI, OpenRouter); absent, they wait STREAM_IDLE_MS. Never sent to the provider.
   */
  streamIdleMs?: number;
  /**
   * The whole-call deadline (Deadline): the call's model's wait, for a call answered whole (ProviderAdapter.answersWhole:
   * a Google text call). The adapter hands its signal to the SDK; it never carries the run's stop. Each send has its own.
   */
  deadline?: WholeCallDeadline;
}

/** What an adapter reads of a whole-call deadline (providers/deadline.ts): its signal, and the wait it is at. */
export interface WholeCallDeadline {
  readonly signal: AbortSignal;
  readonly afterMs: number;
}

export interface ProviderCompletion {
  text: string;
  servedModel: string;
  /** Total tokens across every attempt the provider billed for this call. */
  usage: TokenBreakdown;
  /**
   * Per-model usage when the provider's answer lists more than one billed attempt, each with the model that ran it, for
   * pricing. byway asks no provider for a fallback model (ADR-0102), so this is not expected; when it happens, each
   * attempt is still priced at its own model's rates.
   */
  usageByModel?: { model: string; usage: TokenBreakdown }[];
  /** Cost the provider itself reports (OpenRouter `usage.cost`), preferred over the price table. */
  reportedCostUsd?: number;
  /** The host that actually served a routed call (OpenRouter). */
  upstreamProvider?: string;
  /** Set when the provider declined: the call is still ledgered (it may be billed) before the gateway raises 'refused'. */
  refusal?: string;
  /**
   * Set with `refusal` when the provider declined (its safety system or the model said no), with the reason it stated, if
   * any: the gateway asks the same model once more (ADR-0102). Every completion refusal is a decline.
   */
  declined?: { reason?: string };
  /** True when the answer was cut off at the output limit; the gateway reports it as stopReason 'max-tokens'. */
  truncated?: boolean;
  /** The request as sent, with image bytes replaced by artifact references. Stored by hash, never inline. */
  requestBody: unknown;
  /** The provider's response as plain JSON. */
  responseBody: unknown;
}

export interface ProviderImageRequest {
  model: string;
  prompt: string;
  size: ImageRequest['size'];
  context: CallContext;
  /** The whole-call deadline at the image model's wait, for an adapter whose images are answered whole (every image adapter but the mock). */
  deadline?: WholeCallDeadline;
}

export interface ProviderImage {
  bytes: Uint8Array;
  mediaType: MediaType;
  servedModel: string;
  usage: Usage;
  /** Why no image came back: a decline (`declined` is set too) or an answer with no usable image. Refused, not retryable. */
  refusal?: string;
  /** Set when the provider declined the image, with the reason it stated, if any: the gateway asks once more (ADR-0102). */
  declined?: { reason?: string };
  requestBody: unknown;
  /** The provider's response as plain JSON, with image bytes removed (they go to the artifact store). */
  responseBody: unknown;
}

/** Bytes with their media type, as a provider returned them or as the gateway loaded them from the artifact store. */
export interface MediaBytes {
  bytes: Uint8Array;
  mediaType: string;
}

export interface ProviderVideoRequest {
  model: string;
  prompt: string;
  /** Already snapped to a length the model makes (`videoSeconds`), so the estimate and the bill agree. */
  durationSec: number;
  /** The storyboard shot (VideoRequest.shot, 1-based), when the caller named it: the mock labels its placeholder with it. */
  shot?: number;
  /** The relay anchor the clip starts from, loaded from the artifact store. */
  startFrame?: MediaBytes & { artifactId: string };
  context: CallContext;
  /**
   * Runs one free round trip (an upload, a status poll, a result, a download) under the gateway's retry policy and
   * error mapping. A video call makes several, and only the failed one is repeated.
   */
  attempt<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Runs one billable job submission (ADR-0091): retried only after failures that were certainly not billed (billingOf
   * 'none', such as fal's own 503 body). After one that may have been, it is never sent again: the call fails, not
   * retryable, saying the provider may have accepted `what` ("the clip").
   */
  submit<T>(fn: () => Promise<T>, what: string): Promise<T>;
  /**
   * A queue job the provider accepted, by role and its request id (ADR-0095): recorded in the spend book before the job
   * is polled, so a call interrupted from here on is listed with the ids to look up in the provider's dashboard.
   */
  accepted?(role: ProviderJobRole, requestId: string): Promise<void>;
  /**
   * Queue jobs an earlier attempt of this call submitted and the provider accepted (stage 3, ADR-0099): the adapter polls
   * them by these ids and submits only the jobs not listed here, so a retried relay link never buys its clip twice.
   */
  resume?: Partial<Record<ProviderJobRole, string>>;
  /**
   * When each of the `resume` jobs was accepted, in milliseconds since the epoch, as the spend book recorded it: a resumed
   * clip's wait keeps counting from fal's acceptance. A job without one (accepted before the book kept the time) counts
   * from the resume.
   */
  acceptedAt?: Partial<Record<ProviderJobRole, number>>;
  /**
   * The clip's wait (the video model's, chosen in Settings or read by a relay step for it; the gateway's waitMs): how
   * long byway waits for the clip from fal's acceptance before it cancels the job (the waits design of 2026-10-22,
   * section 2). Absent, the clip waits as long as its step does.
   */
  waitMs?: number;
  /**
   * Aborts when the call's run is ending (ADR-0111), passed only to an adapter whose `cutsOff.video` is true. The adapter
   * then submits nothing more and cancels the queue job under way, and says what that left: thrown as a cutOffError
   * whose billing says how it is counted, or, when the clip was already made, returned with the clip's usage and a
   * `failure`, so the gateway settles it as made and billed.
   */
  signal?: AbortSignal;
}

export interface ProviderVideo {
  /** The clip; absent only when `failure` is set. */
  clip?: MediaBytes;
  /** Its last frame, the next relay link's anchor; absent only when `failure` is set. */
  lastFrame?: MediaBytes;
  /** A frame from its middle, for the shot check (F10 (a)): best effort, absent when it could not be taken. */
  middleFrame?: MediaBytes;
  /**
   * Set when the clip was generated (and billed) but a later round trip failed. The gateway keeps what arrived,
   * ledgers the spend and then raises this error. Failures before anything is billed are thrown instead.
   */
  failure?: unknown;
  servedModel: string;
  /** units = seconds of video billed. */
  usage: Usage;
  requestBody: unknown;
  responseBody: unknown;
}

/**
 * The one small interface every provider adapter implements. Adapters translate requests and parse responses; the
 * gateway owns credentials, budgets, retries, the ledger and storage. SDK clients are injected, so tests use fakes.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  complete(req: ProviderCompletionRequest): Promise<ProviderCompletion>;
  image?(req: ProviderImageRequest): Promise<ProviderImage>;
  video?(req: ProviderVideoRequest): Promise<ProviderVideo>;
  /** The seconds a video model makes (and bills) for a requested length; models offer only some lengths. */
  videoSeconds?(model: string, requestedSec: number): number;
  /**
   * Helper endpoints billed per second that every video call also uses (fal.ai's last- and middle-frame extractions),
   * with an upper bound on their seconds. The gateway prices them from the price table, in the estimate and in the ledger.
   */
  readonly videoExtras?: readonly { model: string; seconds: number }[];
  /**
   * Which of this adapter's calls a stop can cut off (ADR-0111): the gateway hands the call's stop signal only to these.
   * Set where cutting a call off can save money and still leaves an honest count: a stream the provider stops generating
   * when it is closed (Anthropic, OpenAI and OpenRouter chat), a queue job the provider can cancel (fal), and the demo's
   * mock, so the demo and the tests take the same path. Absent for calls that would still be billed in full and only lose
   * their exact cost (Google's SDK abort is client-side only; every image call).
   */
  readonly cutsOff?: { readonly complete?: boolean; readonly video?: boolean };
  /**
   * Which of this adapter's calls are answered whole rather than streamed, and so are handed a whole-call deadline at
   * their model's wait (the waits design of 2026-10-22, section 2): Google's text and images, OpenAI's images. A call
   * whose deadline ran out is not sent again (waited.ts). Streamed calls are bounded by their silence instead (StreamIdle).
   */
  readonly answersWhole?: { readonly complete?: boolean; readonly image?: boolean };
}

/** Concatenated text of a message's text parts. */
export function textOf(parts: ResolvedPart[]): string {
  return parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n');
}

/** Image data as sent (inline base64) or as logged (a reference to the artifact that holds the bytes). */
export function imageData(image: ResolvedImage, inline: boolean): string {
  return inline ? image.base64 : `artifact:${image.artifactId}`;
}

/** A plain-JSON copy (class instances and undefined fields dropped), safe to canonicalize and hash. */
export function plain(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export const IMAGE_ASPECT: Record<ImageRequest['size'], string> = {
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3',
};
