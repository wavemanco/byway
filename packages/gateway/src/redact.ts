import type { Env } from './env.ts';
import { heldKeyCandidates } from './held-key.ts';

export type Redactor = (text: string) => string;

/**
 * Shapes of provider keys, so a key that is not in our environment (say, echoed back by a provider) is still removed.
 * Anthropic `sk-ant-…`, OpenRouter `sk-or-…`, OpenAI `sk-…`/`sk-proj-…`, Google `AIza…`, fal.ai `<key id>:<secret>`, and bearer tokens.
 */
const KEY_SHAPES = [
  /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{8,}/g,
  /(?<![A-Za-z0-9_-])sk-or-[A-Za-z0-9_-]{8,}/g,
  /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{16,}/g,
  /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{20,}/g,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,}/gi,
  /Bearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
];

/** Environment variables whose values are secrets. Values shorter than 8 characters are too generic to scrub safely. */
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD)$/;

/**
 * Build a function that scrubs secrets from the gateway's diagnostic copies: the request and response bodies it
 * stores, provider metadata in the ledger (servedModel, upstreamProvider) and error messages. It is lossy on purpose
 * (key shapes too), which is safe only because those copies are evidence, not product. Product text (prompts, answers,
 * what a person submits) is never rewritten: it is checked with findHeldKey and refused when it holds a key (ADR-0088).
 * Every ':'-part a held key is matched by (held-key.ts) is scrubbed too, so these copies are never narrower than that rule.
 */
export function makeRedactor(env: Env): Redactor {
  const named = Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && value !== undefined && value.trim().length >= 8)
    .map(([, value]) => (value as string).trim());
  const secrets = [...new Set([...named, ...heldKeyCandidates(env).map((c) => c.value)])].sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text;
    for (const secret of secrets) out = out.split(secret).join('[redacted]');
    for (const shape of KEY_SHAPES) out = out.replace(shape, '[redacted]');
    return out;
  };
}
