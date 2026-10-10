/**
 * Writes @byway/recipe's table of what each prompt template shows (`template-slots.ts`, ADR-0097): for every template in
 * this library, by medium, the slots its text uses. Admission reads from it which of the ports a model step takes in its
 * prompt shows (@byway/recipe `promptShows`). The recipe package may not load this library: the library reads files,
 * and the recipe semantics are pure, with parts of them in the workflow bundle. So the table is data, generated here and
 * held to the library by a test (packages/prompts/test/template-slots.test.ts): run `pnpm prompts:slots` after editing
 * a template's slots, or adding or removing a template.
 */
import { realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA } from '@byway/protocol';
import { createPromptRenderer, type PromptLibrary } from './renderer.ts';

/** Where the table lives: in @byway/recipe, beside the semantics that read it. */
export const TEMPLATE_SLOTS_FILE = resolve(import.meta.dirname, '../../recipe/src/template-slots.ts');

/** The slots of each template file of an id, by the key the table uses: a medium for a variant, '*' for the base template. */
function entries(library: PromptLibrary, id: string): [string, string[]][] {
  const out: [string, string[]][] = [];
  try {
    out.push(['*', library.info(id).slots]);
  } catch {
    // Variants only (a helper written per medium): no base template.
  }
  for (const medium of MEDIA) if (library.variants(id).includes(medium)) out.push([medium, library.info(id, medium).slots]);
  return out;
}

/** The exact text of `template-slots.ts` for a library. */
export function templateSlotsText(library: PromptLibrary = createPromptRenderer()): string {
  const rows = library.ids().map((id) => {
    const byMedium = entries(library, id)
      .map(([key, slots]) => `'${key}': [${slots.map((s) => `'${s}'`).join(', ')}]`)
      .join(', ');
    return `  '${id}': { ${byMedium} },`;
  });
  return [
    '/**',
    ' * GENERATED from @byway/prompts by `pnpm prompts:slots` (packages/prompts/src/emit-template-slots.ts): do not edit by',
    ' * hand. packages/prompts/test/template-slots.test.ts fails when it is out of date.',
    ' *',
    " * Every prompt template in byway's library, by medium ('*' is the template every medium without a variant of its own",
    ' * uses): the slots its text uses. The library checks that a template declares exactly the slots it uses, and its test',
    ' * that every slot a template uses is one whose value it inserts. Admission reads it for what a model step\'s prompt',
    ' * shows of the ports the step takes in (`promptShows`, ADR-0097). No workflow code reads it, so the workflow bundle',
    ' * does not hold it (the runner\'s build test pins that).',
    ' */',
    "import type { TemplateSlots } from './prompt-shows.ts';",
    '',
    'export const TEMPLATE_SLOTS: TemplateSlots = {',
    ...rows,
    '};',
    '',
  ].join('\n');
}

/** True when this module is the program entry, also when launched through a symlink or junction. */
function isEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    const a = realpathSync(process.argv[1]);
    const b = realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

if (isEntry()) {
  writeFileSync(TEMPLATE_SLOTS_FILE, templateSlotsText());
  console.log(`wrote ${TEMPLATE_SLOTS_FILE}`);
}
