import { createHash } from 'node:crypto';
import type { ArtifactRecord, ArtifactStore } from '@byway/contracts';
import type { AnthropicClientLike, AnthropicMessageLike } from '../src/providers/anthropic.ts';
import type { GoogleClientLike, GoogleResponseLike } from '../src/providers/google.ts';
import type { ChatCompletionLike, ImagesResponseLike, OpenAIClientLike } from '../src/providers/openai.ts';

/** A content-addressed artifact store in memory, as the contract describes (ids are sha256 of the bytes). */
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
  /** Every stored text artifact, for leak checks. */
  allText(): string {
    return [...this.items.values()].map((i) => new TextDecoder().decode(i.bytes)).join('\n');
  }
}

type Step<T> = T | Error | (() => T | Error);
const next = <T>(queue: Step<T>[], fallback: () => T): T => {
  const item = queue.length ? queue.shift() : undefined;
  const value = typeof item === 'function' ? (item as () => T | Error)() : item;
  if (value instanceof Error) throw value;
  return value ?? fallback();
};

export const anthropicMessage = (over: Partial<AnthropicMessageLike> = {}): AnthropicMessageLike => ({
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '- Tighten the hero.\nScore: 6/10' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1000, output_tokens: 500 },
  ...over,
});

/** A fake Anthropic client: replies (or throws) from a queue, then repeats a default reply. */
export function fakeAnthropic(queue: Step<AnthropicMessageLike>[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client: AnthropicClientLike = {
    beta: {
      messages: {
        stream(body) {
          calls.push(body as unknown as Record<string, unknown>);
          return { finalMessage: async () => next(queue, () => anthropicMessage()) };
        },
      },
    },
  };
  return { client, calls };
}

export function fakeOpenAI(chat: Step<ChatCompletionLike>[] = [], images: Step<ImagesResponseLike>[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client: OpenAIClientLike = {
    chat: {
      completions: {
        async create(body) {
          calls.push(body as unknown as Record<string, unknown>);
          return next(chat, () => ({
            model: body.model,
            choices: [{ finish_reason: 'stop', message: { content: 'Choice: A' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 100 },
          }));
        },
      },
    },
    images: {
      async generate(body) {
        calls.push(body as unknown as Record<string, unknown>);
        return next(images, () => ({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }], output_format: 'png', usage: { input_tokens: 20, output_tokens: 4000 } }));
      },
    },
  };
  return { client, calls };
}

export function fakeGoogle(queue: Step<GoogleResponseLike>[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client: GoogleClientLike = {
    models: {
      async generateContent(params) {
        calls.push(params as unknown as Record<string, unknown>);
        return next(queue, () => ({
          modelVersion: params.model,
          candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: Buffer.from('jpeg-bytes').toString('base64'), mimeType: 'image/jpeg' } }] } }],
          usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 1290 },
        }));
      },
    },
  };
  return { client, calls };
}

/** An error shaped like the SDKs' API errors. */
export const httpError = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });
