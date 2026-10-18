/**
 * The page renderer's settings (RendererSettings; ADR-0105): one row for the data directory. No row means never set: the
 * OS sandbox on and no check. The sandbox is switched only by setRendererSandbox, which Settings calls; recording the
 * start-up check never touches it.
 */
import type { SQLOutputValue } from 'node:sqlite';
import type { RendererCheckRecord, RendererSettings } from '@byway/contracts';
import { invalid, isPlainObject, nonEmpty, oneOf } from './validate.ts';

/** Never set: the sandbox on (ADR-0105). */
export const DEFAULT_RENDERER_SETTINGS: Readonly<RendererSettings> = Object.freeze({ osSandbox: true });

const CHECK_KEYS = ['at', 'osSandbox', 'ready', 'sandbox', 'message', 'why', 'fix'] as const satisfies readonly (keyof RendererCheckRecord)[];
const SANDBOX_FINDINGS = ['starts', 'fails', 'unknown'] as const satisfies readonly RendererCheckRecord['sandbox'][];

export function sandboxFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid(`the OS sandbox setting must be true or false, got ${JSON.stringify(value)}`);
  return value;
}

/** A start-up check as the store keeps it: exactly the record's fields, each of its type. */
export function rendererCheck(value: unknown): RendererCheckRecord {
  if (!isPlainObject(value)) throw invalid('a renderer check must be a plain object');
  const extra = Object.keys(value).filter((k) => !(CHECK_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) throw invalid(`a renderer check has only ${CHECK_KEYS.join(', ')}; got ${extra.join(', ')}`);
  const flag = (what: string) => {
    if (typeof value[what] !== 'boolean') throw invalid(`a renderer check's ${what} must be true or false`);
    return value[what];
  };
  const words = (what: 'message' | 'why' | 'fix') => (value[what] === undefined ? {} : { [what]: nonEmpty(`a renderer check's ${what}`, value[what]) });
  return {
    at: nonEmpty("a renderer check's time", value.at),
    osSandbox: flag('osSandbox'),
    ready: flag('ready'),
    sandbox: oneOf('sandbox finding', value.sandbox, SANDBOX_FINDINGS),
    ...words('message'),
    ...words('why'),
    ...words('fix'),
  };
}

export function toRendererSettings(r: Record<string, SQLOutputValue> | undefined): RendererSettings {
  if (!r) return { ...DEFAULT_RENDERER_SETTINGS };
  return {
    osSandbox: Number(r.os_sandbox) === 1,
    ...(r.changed_at ? { changedAt: String(r.changed_at) } : {}),
    ...(r.last_check ? { lastCheck: rendererCheck(JSON.parse(String(r.last_check))) } : {}),
  };
}
