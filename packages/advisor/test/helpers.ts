import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArtifactRecord, ArtifactStore, CompletionRequest, Gateway, LedgerEntry, PromptRenderer, PromptSlot, RenderedPrompt } from '@byway/contracts';
import { createGateway, Ledger, type GatewayOptions, type Responder } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { createAdvisor, type AdvisorOptions } from '../src/index.ts';

/** A content-addressed artifact store in memory (ids are sha256 of the bytes), as the contract describes. */
export class MemoryArtifacts implements ArtifactStore {
  readonly items = new Map<string, { record: ArtifactRecord; bytes: Uint8Array }>();
  async put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord> {
    const id = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const record: ArtifactRecord = { id, mediaType, bytes: bytes.byteLength, createdAt: '2026-10-07T00:00:00.000Z' };
    this.items.set(id, { record, bytes });
    return record;
  }
  putText(text: string, mediaType: string): Promise<ArtifactRecord> {
    return this.put(new TextEncoder().encode(text), mediaType);
  }
  async get(id: string) {
    const item = this.items.get(id);
    if (!item) throw new Error(`no artifact ${id}`);
    return item;
  }
  async getText(id: string): Promise<string> {
    return new TextDecoder().decode((await this.get(id)).bytes);
  }
  async has(id: string): Promise<boolean> {
    return this.items.has(id);
  }
}

/** A fresh ledger path in a temp directory, and a reader for what the gateway wrote there. */
export function tempLedger() {
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'byway-advisor-')), 'ledger.jsonl');
  return { ledgerPath, entries: (): Promise<LedgerEntry[]> => new Ledger({ path: ledgerPath }).entries() };
}

/** The gateway in demo mode: the deterministic mock provider, a ledger in a fresh temp directory, no keys, no network. */
export function demoGateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: tempLedger().ledgerPath,
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => 100 },
    env: {},
    demo: true,
    now: () => new Date('2026-10-07T12:00:00Z'),
    ...over,
  });
}

/** Wraps a gateway and records every completion request (purposes, messages, prompt refs) the advisor sends. */
export function recording(inner: Gateway): Gateway & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    calls,
    // A getter, not a copy: the inner gateway reads demo mode from its environment on every call.
    get demo() {
      return inner.demo;
    },
    complete: (req) => {
      calls.push(req);
      return inner.complete(req);
    },
    image: (req) => inner.image(req),
    video: (req) => inner.video(req),
    spend: (id) => inner.spend(id),
    providers: () => inner.providers(),
    profiles: () => inner.profiles(),
    profileStatus: () => inner.profileStatus(),
    verifyLedger: () => inner.verifyLedger(),
  };
}

/** The real templates (@byway/prompts), loaded once: rendering is pure, so tests can share one library. */
export const PROMPTS = createPromptRenderer();

/**
 * The real prompt renderer, recording each render (id, slots, result) so tests can look at what the advisor filled in.
 * `has` can be narrowed to pretend a template is missing (the composed profile checks that step prompts exist). Using
 * the real templates here, rather than a stand-in, means no advisor test can pass with a slot layout the real
 * templates would refuse or render differently.
 */
export function recordingPrompts(opts: { has?: (id: string) => boolean } = {}) {
  const renders: { id: string; slots: Partial<Record<PromptSlot, string>>; rendered: RenderedPrompt }[] = [];
  const renderer: PromptRenderer = {
    has: opts.has ?? ((id) => PROMPTS.has(id)),
    render(id, slots): RenderedPrompt {
      const rendered = PROMPTS.render(id, slots);
      renders.push({ id, slots, rendered });
      return rendered;
    },
  };
  return { renderer, renders };
}

/** A fenced json answer, as the advisor's output contracts ask for (spec §3.3). */
export const fencedJson = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

/** A responder that answers from a list in order, repeating the last answer. */
export function sequence(...answers: string[]): Responder & { count: () => number } {
  let n = 0;
  return Object.assign((() => answers[Math.min(n++, answers.length - 1)] as string) satisfies Responder, { count: () => n });
}

export const WS = { workspaceId: 'ws-1', profileId: 'demo' };

/**
 * An advisor over a demo gateway (optionally with mock answers replaced) and the real templates, with handles to the
 * recorded calls, the recorded renders and the gateway's ledger.
 */
export function demoAdvisor(o: { responders?: Record<string, Responder>; has?: (id: string) => boolean; advisor?: Partial<AdvisorOptions>; gateway?: Partial<GatewayOptions> } = {}) {
  const ledger = tempLedger();
  const gateway = recording(demoGateway({ ledgerPath: ledger.ledgerPath, ...(o.responders ? { mockResponders: o.responders } : {}), ...o.gateway }));
  const prompts = recordingPrompts(o.has ? { has: o.has } : {});
  const advisor = createAdvisor({ gateway, prompts: prompts.renderer, ...o.advisor });
  return { advisor, gateway, prompts, ledger: ledger.entries };
}
