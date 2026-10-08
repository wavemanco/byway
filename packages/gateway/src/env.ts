import { readFileSync } from 'node:fs';
import type { ProviderId, ProviderStatus } from '@byway/contracts';

/** Where each provider's key lives (product spec §2 "Keys"). Keys are read from the environment only. */
export const KEY_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  fal: 'FAL_KEY',
} as const satisfies Record<Exclude<ProviderId, 'mock'>, string>;

export type Env = Record<string, string | undefined>;

/** Providers in display order. The mock needs no key, so it is always configured. */
const ORDER: ProviderId[] = ['anthropic', 'openai', 'google', 'openrouter', 'fal', 'mock'];

export function keyFor(env: Env, provider: ProviderId): string | undefined {
  if (provider === 'mock') return undefined;
  const value = env[KEY_VARS[provider]]?.trim();
  return value ? value : undefined;
}

export function isConfigured(env: Env, provider: ProviderId): boolean {
  return provider === 'mock' || keyFor(env, provider) !== undefined;
}

/** Which providers have a key. Never returns the keys themselves. */
export function configuredProviders(env: Env): ProviderStatus[] {
  return ORDER.map((provider) => ({ provider, configured: isConfigured(env, provider) }));
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse a double-quoted value, honouring the escapes people actually write in env files. */
function unescapeDouble(body: string): string {
  return body.replace(/\\([nrt"\\])/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' })[c] ?? c);
}

/**
 * Parse dotenv-style text: `KEY=VALUE` lines, optional `export `, `#` comments, single quotes (literal),
 * double quotes (with \n, \t, \" and \\ escapes) and inline comments after whitespace on unquoted values.
 * Written here rather than taken from a dependency so the key path stays small and auditable.
 */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!NAME.test(key)) continue;
    const rest = body.slice(eq + 1).trim();
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const end = rest.indexOf(quote, 1);
      // A double-quoted value may contain escaped quotes; find the first unescaped one.
      let close = end;
      if (quote === '"') {
        close = -1;
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '\\') i++;
          else if (rest[i] === '"') {
            close = i;
            break;
          }
        }
      }
      if (close < 0) continue;
      const inner = rest.slice(1, close);
      out[key] = quote === '"' ? unescapeDouble(inner) : inner;
      continue;
    }
    const hash = rest.search(/\s#/);
    out[key] = (hash >= 0 ? rest.slice(0, hash) : rest).trim();
  }
  return out;
}

export interface EnvLoadReport {
  found: boolean;
  /** Variable names set from the file. */
  loaded: string[];
  /** Variable names already present in the environment, left untouched. */
  kept: string[];
}

/**
 * Load `.env.agents` (ADR-0009: gitignored, never committed) into the environment, setting only variables that are
 * missing or empty, so a key exported in the shell always wins. Returns names only: values never leave this function.
 */
export function loadEnvFile(path: string, env: Env = process.env): EnvLoadReport {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { found: false, loaded: [], kept: [] };
    throw new Error(`could not read env file ${path}: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}`);
  }
  const report: EnvLoadReport = { found: true, loaded: [], kept: [] };
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
      report.loaded.push(key);
    } else {
      report.kept.push(key);
    }
  }
  return report;
}
