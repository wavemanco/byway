/**
 * The demo gateway: like @byway/gateway in demo mode, every call is answered by a mock that follows the output
 * contracts of spec §3.3, at no cost, with a hash-chained ledger (CR7). It has no provider keys, so only the mock
 * is configured: `profiles()` offers the demo profile alone and `profileStatus()` says what each other profile
 * would need. Video calls return a labelled placeholder clip (contracts VideoResult; ADR-0069).
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  GatewayError,
  type CompletionResult,
  type Gateway,
  type ImageResult,
  type LedgerEntry,
  type ModelProfile,
  type ProfileStatus,
  type ProviderId,
  type ProviderStatus,
  type Store,
  type VideoResult,
} from '@byway/contracts';
import { encodePng } from './png.ts';
import { placeholderClipSvg } from './samples/clip.ts';
import { hashOf } from './samples/text.ts';

/**
 * Display data for demo mode; the verified model table comes from @byway/gateway. Image and video entries say
 * which provider each profile needs; their model ids are never shown.
 */
const PROFILES: ModelProfile[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    tiers: { big: { provider: 'anthropic', model: 'claude-opus-5-5' }, mid: { provider: 'anthropic', model: 'claude-sonnet-5-5' } },
    image: { provider: 'google', model: 'image' },
    video: { provider: 'fal', model: 'video' },
  },
  {
    id: 'best',
    label: 'Best quality',
    tiers: { big: { provider: 'anthropic', model: 'claude-opus-5-5' }, mid: { provider: 'anthropic', model: 'claude-opus-5-5' } },
    image: { provider: 'openai', model: 'image' },
    video: { provider: 'fal', model: 'video' },
  },
  {
    id: 'demo',
    label: 'Demo',
    tiers: { big: { provider: 'mock', model: 'mock-judge' }, mid: { provider: 'mock', model: 'mock-worker' } },
    image: { provider: 'mock', model: 'mock-image' },
    video: { provider: 'mock', model: 'mock-video' },
  },
];

/** The demo has no keys: only the built-in mock answers. */
const CONFIGURED: ReadonlySet<ProviderId> = new Set(['mock']);
const REAL_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'fal'] as const;
const MAX_CLIP_SEC = 60;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Mock answers by purpose role, shaped like the output contracts the runner's parsers expect. */
function answer(purpose: string): string {
  const [role = '', medium = 'prose'] = purpose.split(':');
  const fenced = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
  switch (role) {
    case 'critic':
      return '- The hierarchy is unclear above the fold.\n- Two sections repeat the same point.\nScore: 7/10';
    case 'judge':
    case 'select':
    case 'rerank':
      return 'Draft A keeps the clearest structure.\nChoice: A';
    case 'check':
      return 'No defects.';
    case 'cut':
      return '- Remove the testimonials section.\n- Merge the two calls to action.';
    case 'tells-sweep':
      return fenced('json', JSON.stringify({ hits: [{ pattern: 'stock opener', where: 'headline', alternative: 'say plainly what it is' }] }));
    case 'tells-compare':
      return 'B reads more plainly.\nKeep: B';
    case 'vision':
      return 'A calm, specific direction with one memorable detail.';
    case 'dedupe':
      return fenced('json', JSON.stringify({ keep: ['A', 'B'], merged: [{ into: 'A', from: ['C'] }] }));
    case 'overlap':
      return fenced('json', JSON.stringify({ flags: [{ label: 'A', overlapsWith: 'a plain answer', note: 'Common first idea.' }] }));
    case 'relay':
      return fenced('json', JSON.stringify({ clipPrompt: 'Slow push-in on the opening frame', durationSec: 3 }));
    case 'asset.briefs':
      return fenced('json', JSON.stringify({ images: [{ slot: 'hero', prompt: 'quiet workshop, morning light', alt: 'A workshop in morning light', size: '1536x1024' }] }));
    case 'advisor.intake':
      return fenced('json', JSON.stringify({ answers: [], routes: {} }));
    default:
      break;
  }
  switch (medium) {
    case 'web-page':
      return fenced('html', '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Draft</title></head><body><h1>Draft</h1></body></html>');
    case 'options':
      return fenced('json', JSON.stringify({ options: [{ title: 'Start small', pitch: 'Ship one slice first.', rationale: 'Cheap to test.' }] }));
    case 'media':
      return fenced('json', JSON.stringify({ storyboard: [{ shot: 1, description: 'Open on hands', imagePrompt: 'hands', durationSec: 3 }], voiceover: 'Made slowly.' }));
    case 'code-diff':
      return `${fenced('diff', '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new')}\nWhy: Smaller and clearer.`;
    default:
      return '# Draft\n\nA short sample paragraph.';
  }
}

function status(profile: ModelProfile): ProfileStatus {
  const missing = [...new Set([profile.tiers.big.provider, profile.tiers.mid.provider])].filter((p) => !CONFIGURED.has(p));
  return {
    profile: structuredClone(profile),
    usable: missing.length === 0,
    missing,
    images: profile.image !== undefined && CONFIGURED.has(profile.image.provider),
    video: profile.video !== undefined && CONFIGURED.has(profile.video.provider),
  };
}

/** A small solid PNG standing in for a frame, coloured by the text it stands for. */
function swatch(text: string, width: number, height: number): Uint8Array {
  const h = hashOf(text);
  const [r, g, b] = [h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff];
  return encodePng(width, height, (x, y) => [(r + x * 2) & 0xff, (g + y * 3) & 0xff, b]);
}

export function createDemoGateway(opts: { store: Store }): Gateway {
  const ledger: LedgerEntry[] = [];

  const record = (entry: Omit<LedgerEntry, 'id' | 'seq' | 'at' | 'prevHash' | 'hash'>): LedgerEntry => {
    const prevHash = ledger.at(-1)?.hash ?? 'genesis';
    const base = { ...entry, id: `led-${randomUUID()}`, seq: ledger.length + 1, at: new Date().toISOString(), prevHash };
    const full: LedgerEntry = { ...base, hash: sha(prevHash + JSON.stringify(base)) };
    ledger.push(full);
    return full;
  };

  const profile = (id: string): ModelProfile => {
    const p = PROFILES.find((x) => x.id === id);
    if (!p) throw new GatewayError('unknown-profile', `There is no model profile called "${id}".`);
    return p;
  };

  return {
    async complete(req): Promise<CompletionResult> {
      profile(req.profileId);
      const text = answer(req.purpose);
      const usage = { inputTokens: JSON.stringify(req.messages).length / 4, outputTokens: text.length / 4 };
      const entry = record({
        workspaceId: req.workspaceId,
        ...(req.runId ? { runId: req.runId } : {}),
        ...(req.stepId ? { stepId: req.stepId } : {}),
        purpose: req.purpose,
        kind: 'completion',
        provider: 'mock',
        requestedModel: req.tier === 'big' ? 'mock-judge' : 'mock-worker',
        servedModel: req.tier === 'big' ? 'mock-judge' : 'mock-worker',
        requestSha256: sha(JSON.stringify(req.messages)),
        responseSha256: sha(text),
        usage,
        costUsd: 0,
        latencyMs: 0,
      });
      return { text, stopReason: 'end', servedModel: entry.servedModel, provider: 'mock', usage, costUsd: 0, ledgerEntryId: entry.id };
    },

    async image(req): Promise<ImageResult> {
      profile(req.profileId);
      const art = await opts.store.artifacts.put(swatch(req.prompt, 64, 40), 'image/png');
      const entry = record({
        workspaceId: req.workspaceId,
        ...(req.runId ? { runId: req.runId } : {}),
        ...(req.stepId ? { stepId: req.stepId } : {}),
        purpose: req.purpose,
        kind: 'image',
        provider: 'mock',
        requestedModel: 'mock-image',
        servedModel: 'mock-image',
        requestSha256: sha(req.prompt),
        responseSha256: art.id.replace('sha256:', ''),
        usage: { inputTokens: 0, outputTokens: 0, units: 1 },
        costUsd: 0,
        latencyMs: 0,
      });
      return { artifactId: art.id, mediaType: 'image/png', servedModel: 'mock-image', provider: 'mock', costUsd: 0, ledgerEntryId: entry.id };
    },

    async video(req): Promise<VideoResult> {
      profile(req.profileId);
      if (!(req.durationSec > 0) || req.durationSec > MAX_CLIP_SEC) {
        throw new GatewayError('invalid-request', `A clip lasts more than 0 and at most ${MAX_CLIP_SEC} seconds.`);
      }
      const clip = await opts.store.artifacts.putText(placeholderClipSvg(req.prompt, req.durationSec), 'image/svg+xml');
      const lastFrame = await opts.store.artifacts.put(swatch(`${req.startFrameArtifactId ?? ''}|${req.prompt}`, 64, 36), 'image/png');
      const entry = record({
        workspaceId: req.workspaceId,
        ...(req.runId ? { runId: req.runId } : {}),
        ...(req.stepId ? { stepId: req.stepId } : {}),
        purpose: req.purpose,
        kind: 'video',
        provider: 'mock',
        requestedModel: 'mock-video',
        servedModel: 'mock-video',
        requestSha256: sha(JSON.stringify({ prompt: req.prompt, start: req.startFrameArtifactId ?? null, durationSec: req.durationSec })),
        responseSha256: clip.id.replace('sha256:', ''),
        usage: { inputTokens: 0, outputTokens: 0, units: 1 },
        costUsd: 0,
        latencyMs: 0,
      });
      return { artifactId: clip.id, lastFrameArtifactId: lastFrame.id, servedModel: 'mock-video', provider: 'mock', costUsd: 0, ledgerEntryId: entry.id };
    },

    async spend(workspaceId) {
      const ws = await opts.store.getWorkspace(workspaceId);
      const byRun: Record<string, number> = {};
      let spentUsd = 0;
      for (const e of ledger.filter((x) => x.workspaceId === workspaceId)) {
        spentUsd += e.costUsd;
        if (e.runId) byRun[e.runId] = (byRun[e.runId] ?? 0) + e.costUsd;
      }
      return { workspaceId, spentUsd, capUsd: ws?.budgetUsd ?? 0, byRun };
    },

    providers(): ProviderStatus[] {
      return [...REAL_PROVIDERS.map((provider) => ({ provider, configured: CONFIGURED.has(provider) })), { provider: 'mock', configured: true }];
    },

    profiles: () => PROFILES.map(status).filter((s) => s.usable).map((s) => s.profile),

    profileStatus: () => PROFILES.map(status),

    async verifyLedger() {
      let prev = 'genesis';
      for (const e of ledger) {
        const { hash, ...base } = e;
        if (e.prevHash !== prev || sha(prev + JSON.stringify(base)) !== hash) return e.id;
        prev = hash;
      }
      return null;
    },
  };
}
