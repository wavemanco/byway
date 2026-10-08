import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArtifactRecord, ArtifactStore, CompletionRequest, Gateway, PromptRenderer, PromptSlot, RenderedPrompt } from '@byway/contracts';
import { createGateway, type GatewayOptions, type Responder } from '@byway/gateway';
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

/** The gateway in demo mode: the deterministic mock provider, a ledger in a fresh temp directory, no keys, no network. */
export function demoGateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: join(mkdtempSync(join(tmpdir(), 'byway-advisor-')), 'ledger.jsonl'),
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => 100 },
    env: {},
    demo: true,
    now: () => new Date('2026-10-07T12:00:00Z'),
    ...over,
  });
}

/** Wraps a gateway and records every completion request (purposes, messages) the advisor sends. */
export function recording(inner: Gateway): Gateway & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    calls,
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

/** Slots each advisor template uses, as the real templates will declare them (WP-P); rendering without one throws. */
const REQUIRED: Record<string, PromptSlot[]> = {
  'advisor.intake': ['problem', 'questions'],
  'advisor.compose': ['problem', 'blocks', 'nearest'],
  'advisor.compose.repair': ['violations'],
};

/**
 * A stand-in for @byway/prompts: renders the problem inside <problem>…</problem> (the shared convention) and every
 * other slot under its own heading, verbatim, and records each render. Strict like the real renderer: unknown ids and
 * missing slots throw.
 */
export function fakePrompts(opts: { has?: (id: string) => boolean } = {}) {
  const renders: { id: string; slots: Partial<Record<PromptSlot, string>> }[] = [];
  const has = opts.has ?? (() => true);
  const renderer: PromptRenderer = {
    has,
    render(id, slots): RenderedPrompt {
      if (!has(id) && !(id in REQUIRED)) throw new Error(`Unknown prompt template "${id}"`);
      for (const s of REQUIRED[id] ?? []) if (slots[s] === undefined) throw new Error(`Prompt "${id}" needs slot "${s}"`);
      renders.push({ id, slots });
      const rest = Object.entries(slots)
        .filter(([k]) => k !== 'problem')
        .map(([k, v]) => `## ${k}\n${v}`)
        .join('\n\n');
      const user = [slots.problem !== undefined ? `<problem>${slots.problem}</problem>` : '', rest].filter(Boolean).join('\n\n');
      return { id, version: 1, hash: `sha256:${'0'.repeat(64)}`, fidelity: 'project', system: `Template ${id}.`, user };
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

/** An advisor over a demo gateway (optionally with mock answers replaced) and the fake prompts, with handles to both. */
export function demoAdvisor(o: { responders?: Record<string, Responder>; has?: (id: string) => boolean; advisor?: Partial<AdvisorOptions> } = {}) {
  const gateway = recording(demoGateway(o.responders ? { mockResponders: o.responders } : {}));
  const prompts = fakePrompts(o.has ? { has: o.has } : {});
  const advisor = createAdvisor({ gateway, prompts: prompts.renderer, ...o.advisor });
  return { advisor, gateway, prompts };
}
