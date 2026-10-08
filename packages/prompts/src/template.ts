import { createHash } from 'node:crypto';
import { PROMPT_SLOTS, type PromptSlot, type RenderedPrompt } from '@byway/contracts';
import { MEDIA, type Medium } from '@byway/protocol';
import { z } from 'zod';
import { PromptTemplateError } from './errors.ts';
import { OUTPUT_IDS, type OutputId } from './outputs.ts';
import { parseBody, slotsUsed, type BodyNode } from './syntax.ts';

/**
 * One template file: `<id>.md`, or `<id>@<medium>.md` for a medium's variant.
 *
 *     ---
 *     id: product.c4.draft
 *     version: 1
 *     fidelity: project
 *     slots: problem, brief
 *     output: artifact:prose
 *     source: where the wording comes from
 *     ---
 *     ## system          (optional)
 *     …
 *     ## user
 *     …
 *
 * The front matter is checked strictly, because it is what the ledger records with every call (version, hash,
 * fidelity) and what the tests hold each template to (slots, output contract).
 */
export interface Template {
  id: string;
  /** Set for a variant file; the base template has none. */
  medium: Medium | undefined;
  version: number;
  fidelity: RenderedPrompt['fidelity'];
  /** Exactly the slots the body uses (checked). */
  slots: PromptSlot[];
  output: OutputId;
  source: string;
  /** "sha256:<hex>" of the file, line endings normalized to LF. */
  hash: string;
  file: string;
  system: BodyNode[] | undefined;
  user: BodyNode[];
}

const FrontMatter = z.strictObject({
  id: z.string().regex(/^[a-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/, 'ids are dotted names such as product.c4.draft'),
  version: z.coerce.number().int().positive(),
  fidelity: z.enum(['verbatim', 'paraphrase', 'project']),
  slots: z.string(),
  output: z.enum(OUTPUT_IDS as [OutputId, ...OutputId[]]),
  source: z.string().min(1, 'source must say where the wording comes from'),
});

const SECTION = /^## (system|user)[ \t]*$/m;

function frontMatter(text: string, file: string): { fields: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) throw new PromptTemplateError('bad-template', `${file}: no front matter (a --- block at the top)`);
  const fields: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-z]+):[ \t]*(.*)$/.exec(line);
    if (!kv) throw new PromptTemplateError('bad-template', `${file}: front-matter line "${line}" is not "key: value"`);
    fields[kv[1] as string] = (kv[2] ?? '').trim();
  }
  return { fields, body: text.slice(m[0].length) };
}

function sections(body: string, file: string): { system: string | undefined; user: string } {
  const userAt = /^## user[ \t]*$/m.exec(body);
  if (!userAt) throw new PromptTemplateError('bad-template', `${file}: no "## user" section`);
  const head = body.slice(0, userAt.index);
  const user = body.slice(userAt.index + userAt[0].length);
  const sys = SECTION.exec(head);
  const before = sys ? head.slice(0, sys.index) : head;
  if (before.trim()) throw new PromptTemplateError('bad-template', `${file}: text before the first section ("## system" or "## user")`);
  return { system: sys ? head.slice(sys.index + sys[0].length) : undefined, user };
}

/** Parse and check one template file's text. `name` is its file name, which carries the id and the variant medium. */
export function parseTemplateFile(raw: string, name: string): Template {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const hash = `sha256:${createHash('sha256').update(text).digest('hex')}`;
  const stem = name.replace(/\.md$/, '');
  const at = stem.lastIndexOf('@');
  const baseId = at < 0 ? stem : stem.slice(0, at);
  const suffix = at < 0 ? undefined : stem.slice(at + 1);
  if (suffix !== undefined && !(MEDIA as readonly string[]).includes(suffix)) {
    throw new PromptTemplateError('bad-template', `${name}: "@${suffix}" is not a medium (${MEDIA.join(', ')})`);
  }

  const { fields, body } = frontMatter(text, name);
  const parsed = FrontMatter.safeParse(fields);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || (i as { keys?: string[] }).keys?.join(', ') || 'front matter'}: ${i.message}`);
    throw new PromptTemplateError('bad-template', `${name}: ${issues.join('; ')}`);
  }
  const fm = parsed.data;
  if (fm.id !== baseId) throw new PromptTemplateError('bad-template', `${name}: front-matter id "${fm.id}" does not match the file name`);

  const declared = fm.slots
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of declared) {
    if (!(PROMPT_SLOTS as readonly string[]).includes(s)) throw new PromptTemplateError('bad-template', `${name}: declared slot "${s}" is not a prompt slot`);
  }

  const parts = sections(body, name);
  const system = parts.system !== undefined ? parseBody(parts.system, `${name} (system)`) : undefined;
  const user = parseBody(parts.user, `${name} (user)`);
  const used = slotsUsed(user, system ? slotsUsed(system) : undefined);
  const missing = [...used].filter((s) => !declared.includes(s));
  const unused = declared.filter((s) => !used.has(s as PromptSlot));
  if (missing.length) throw new PromptTemplateError('bad-template', `${name}: uses undeclared slots ${missing.join(', ')}`);
  if (unused.length) throw new PromptTemplateError('bad-template', `${name}: declares slots it never uses: ${unused.join(', ')}`);

  return {
    id: fm.id,
    medium: suffix as Medium | undefined,
    version: fm.version,
    fidelity: fm.fidelity,
    slots: declared as PromptSlot[],
    output: fm.output,
    source: fm.source,
    hash,
    file: name,
    system,
    user,
  };
}
