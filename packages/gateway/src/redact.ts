import type { Env } from './env.ts';

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
 * Build a function that scrubs secrets from text bound for errors, logs, the ledger or artifacts.
 * Keys never leave the gateway (spec §2 "Keys"); this is the last line of defence, applied to every outbound string.
 */
export function makeRedactor(env: Env): Redactor {
  const secrets = Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && value !== undefined && value.trim().length >= 8)
    .map(([, value]) => (value as string).trim())
    .sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text;
    for (const secret of secrets) out = out.split(secret).join('[redacted]');
    for (const shape of KEY_SHAPES) out = out.replace(shape, '[redacted]');
    return out;
  };
}
