import { mockImage } from '../mock/png.ts';
import { parsePurpose, reply, type Responder } from '../mock/responders.ts';
import { seedOf } from '../mock/seed.ts';
import { placeholderClip, placeholderFrame, shotNumber } from '../mock/video.ts';
import { LineupMemory, type Attachment } from '../mock/lineup.ts';
import { plain, textOf, type ProviderAdapter, type ProviderCompletionRequest } from './types.ts';

export interface MockAdapterOptions {
  /** Replace answers by exact purpose (`critic:prose`) or by role (`critic`). */
  responders?: Readonly<Record<string, Responder>>;
}

/** Mock pictures are small: the requested aspect ratio at a 1/16 scale. */
const MOCK_DIMENSIONS = { '1024x1024': [64, 64], '1536x1024': [96, 64], '1024x1536': [64, 96] } as const;

const tokens = (text: string) => Math.ceil(text.length / 4);

/**
 * The user messages' images in order, each with the label of the "### X" heading that introduced it (the runner puts
 * a labelled image group after a text part ending in that heading), so a GREAT critic of screenshots can tell items apart.
 */
function attachmentsOf(messages: ProviderCompletionRequest['messages']): Attachment[] {
  const out: Attachment[] = [];
  let label: string | undefined;
  for (const m of messages) {
    if (m.role !== 'user') continue;
    for (const part of m.content) {
      if (part.type === 'text') {
        const heading = /^#{1,6}[ \t]+([A-Z]{1,2})[ \t]*$/.exec(part.text.trimEnd().split('\n').at(-1) ?? '');
        label = heading ? heading[1] : undefined;
      } else {
        out.push({ ...(label ? { label } : {}), artifactId: part.image.artifactId });
      }
    }
  }
  return out;
}

/**
 * The demo-mode provider (spec §5 "Demo mode"): deterministic, plausible answers for every purpose and medium, no
 * network and no cost. It counts calls per run, step and purpose so loops see their iteration number.
 */
export function mockAdapter(opts: MockAdapterOptions = {}): ProviderAdapter {
  const counts = new Map<string, number>();
  const memories = new Map<string, LineupMemory>();
  return {
    id: 'mock',
    async complete(req) {
      const { role, medium } = parsePurpose(req.context.purpose);
      const prompt = req.messages
        .filter((m) => m.role === 'user')
        .map((m) => textOf(m.content))
        .join('\n\n');
      const images = req.messages.reduce((n, m) => n + m.content.filter((p) => p.type === 'image').length, 0);
      const key = `${req.context.runId ?? req.context.workspaceId}|${req.context.stepId ?? ''}|${req.context.purpose}`;
      const iteration = counts.get(key) ?? 0;
      counts.set(key, iteration + 1);
      let lineupMemory = memories.get(key);
      if (!lineupMemory) memories.set(key, (lineupMemory = new LineupMemory()));
      const { text, truncated, declined } = reply(
        {
          purpose: req.context.purpose,
          role,
          medium,
          system: req.system ?? '',
          prompt,
          images,
          seed: seedOf(`${req.system ?? ''}\n${prompt}`),
          iteration,
          attachments: attachmentsOf(req.messages),
          lineupMemory,
        },
        opts.responders,
      );
      const requestBody = plain({ model: req.model, system: req.system, purpose: req.context.purpose, messages: req.messages.map((m) => ({ role: m.role, text: textOf(m.content), images: m.content.filter((p) => p.type === 'image').map((p) => (p.type === 'image' ? `artifact:${p.image.artifactId}` : '')) })) });
      return {
        text,
        servedModel: req.model,
        usage: { inputTokens: tokens(`${req.system ?? ''}${prompt}`) + images * 1000, outputTokens: tokens(text) },
        // Only a test responder truncates or declines; the demo's own answers are always whole, whatever maxOutputTokens says.
        ...(truncated ? { truncated: true } : {}),
        ...(declined ? { refusal: `declined (${declined.reason ?? 'policy'})`, declined } : {}),
        requestBody,
        responseBody: { model: req.model, text, ...(truncated ? { truncated: true } : {}), ...(declined ? { declined } : {}) },
      };
    },
    videoSeconds: (_model, requestedSec) => Math.max(1, Math.round(requestedSec)),
    async video(req) {
      // The label's shot: the request's own (VideoRequest.shot, contracts v4), else the prompt's ("Shot 2: …"), else the
      // call order within the run.
      const key = `video|${req.context.runId ?? req.context.workspaceId}`;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      const shot = req.shot ?? shotNumber(req.prompt) ?? n;
      const seed = seedOf(`${shot}\n${req.prompt}`);
      const svg = placeholderClip({ seed, shot, durationSec: req.durationSec, prompt: req.prompt });
      return {
        clip: { bytes: new TextEncoder().encode(svg), mediaType: 'image/svg+xml' },
        lastFrame: { bytes: placeholderFrame(seed), mediaType: 'image/png' },
        servedModel: req.model,
        usage: { inputTokens: 0, outputTokens: 0, units: req.durationSec },
        requestBody: { model: req.model, prompt: req.prompt, durationSec: req.durationSec, ...(req.startFrame ? { startFrame: `artifact:${req.startFrame.artifactId}` } : {}) },
        responseBody: { model: req.model, placeholder: true, shot },
      };
    },
    async image(req) {
      const [w, h] = MOCK_DIMENSIONS[req.size];
      return {
        bytes: mockImage(seedOf(req.prompt), w, h),
        mediaType: 'image/png',
        servedModel: req.model,
        usage: { inputTokens: tokens(req.prompt), outputTokens: 0, units: 1 },
        requestBody: { model: req.model, prompt: req.prompt, size: req.size },
        responseBody: { model: req.model, width: w, height: h },
      };
    },
  };
}
