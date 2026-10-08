import { mockImage } from '../mock/png.ts';
import { parsePurpose, reply, type Responder } from '../mock/responders.ts';
import { seedOf } from '../mock/seed.ts';
import { plain, textOf, type ProviderAdapter } from './types.ts';

export interface MockAdapterOptions {
  /** Replace answers by exact purpose (`critic:prose`) or by role (`critic`). */
  responders?: Readonly<Record<string, Responder>>;
}

/** Mock pictures are small: the requested aspect ratio at a 1/16 scale. */
const MOCK_DIMENSIONS = { '1024x1024': [64, 64], '1536x1024': [96, 64], '1024x1536': [64, 96] } as const;

const tokens = (text: string) => Math.ceil(text.length / 4);

/**
 * The demo-mode provider (spec §5 "Demo mode"): deterministic, plausible answers for every purpose and medium, no
 * network and no cost. It counts calls per run, step and purpose so loops see their iteration number.
 */
export function mockAdapter(opts: MockAdapterOptions = {}): ProviderAdapter {
  const counts = new Map<string, number>();
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
      const { text, truncated } = reply(
        { purpose: req.context.purpose, role, medium, system: req.system ?? '', prompt, images, seed: seedOf(`${req.system ?? ''}\n${prompt}`), iteration },
        opts.responders,
      );
      const requestBody = plain({ model: req.model, system: req.system, purpose: req.context.purpose, messages: req.messages.map((m) => ({ role: m.role, text: textOf(m.content), images: m.content.filter((p) => p.type === 'image').map((p) => (p.type === 'image' ? `artifact:${p.image.artifactId}` : '')) })) });
      return {
        text,
        servedModel: req.model,
        usage: { inputTokens: tokens(`${req.system ?? ''}${prompt}`) + images * 1000, outputTokens: tokens(text) },
        // Only a test responder truncates; the demo's own answers are always whole, whatever maxOutputTokens says.
        ...(truncated ? { truncated: true } : {}),
        requestBody,
        responseBody: { model: req.model, text, ...(truncated ? { truncated: true } : {}) },
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
