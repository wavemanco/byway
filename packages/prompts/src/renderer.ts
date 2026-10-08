import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptRenderer, PromptSlot, RenderedPrompt } from '@byway/contracts';
import type { Medium } from '@byway/protocol';
import { PromptTemplateError } from './errors.ts';
import { evaluate } from './syntax.ts';
import { parseTemplateFile, type Template } from './template.ts';

/** What a loaded template looks like from outside (no parsed body). */
export type TemplateInfo = Omit<Template, 'system' | 'user'>;

/** The contract's renderer plus read-only views the runner, the advisor and the tests use. */
export interface PromptLibrary extends PromptRenderer {
  /** Every prompt id, sorted. */
  ids(): string[];
  /** The media an id has variants for, sorted. */
  variants(id: string): Medium[];
  /** The template `render` would use for this id and medium. Throws as `render` does. */
  info(id: string, medium?: string): TemplateInfo;
}

export interface PromptRendererOptions {
  /** The templates directory; defaults to this package's `templates/`. */
  dir?: string;
}

/** The package's own templates, next to `src/`. */
export const DEFAULT_TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

interface Entry {
  base: Template | undefined;
  byMedium: Map<Medium, Template>;
}

/**
 * Load every `*.md` template in the directory and check it (front matter, sections, slots) before anything renders:
 * a broken template fails at startup, not in the middle of a run. Rendering is strict: an unknown id or a missing
 * slot throws a {@link PromptTemplateError}.
 */
export function createPromptRenderer(opts: PromptRendererOptions = {}): PromptLibrary {
  const dir = opts.dir ?? DEFAULT_TEMPLATES_DIR;
  const entries = new Map<string, Entry>();
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
    const t = parseTemplateFile(readFileSync(join(dir, name), 'utf8'), name);
    const entry = entries.get(t.id) ?? { base: undefined, byMedium: new Map() };
    if (t.medium) entry.byMedium.set(t.medium, t);
    else entry.base = t;
    entries.set(t.id, entry);
  }

  const pick = (id: string, medium: string | undefined): Template => {
    const entry = entries.get(id);
    if (!entry) throw new PromptTemplateError('unknown-template', `Unknown prompt template "${id}"`);
    const variant = medium ? entry.byMedium.get(medium as Medium) : undefined;
    const t = variant ?? entry.base;
    if (!t) {
      const have = [...entry.byMedium.keys()].join(', ');
      throw new PromptTemplateError('no-variant', `Prompt template "${id}" has no variant for medium "${medium ?? '(none given)'}" (it has: ${have})`);
    }
    return t;
  };

  return {
    has: (id) => entries.has(id),
    render(id: string, slots: Partial<Record<PromptSlot, string>>): RenderedPrompt {
      const t = pick(id, slots.medium);
      const where = `Prompt "${id}"${t.medium ? ` (${t.medium})` : ''}`;
      const user = evaluate(t.user, slots, where).trim();
      const system = t.system ? evaluate(t.system, slots, where).trim() : undefined;
      return { id: t.id, version: t.version, hash: t.hash, fidelity: t.fidelity, ...(system ? { system } : {}), user };
    },
    ids: () => [...entries.keys()].sort(),
    variants: (id) => [...(entries.get(id)?.byMedium.keys() ?? [])].sort(),
    info(id, medium) {
      const { system: _s, user: _u, ...info } = pick(id, medium);
      return info;
    },
  };
}
