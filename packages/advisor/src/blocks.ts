import { BLOCK_CODES, BLOCKS, GLUE_CODES, PORT_TYPES, ROLE_KNOBS, type BlockCode, type KnobDef } from '@byway/protocol';
import { steps, type Recipe } from '@byway/recipe';

/**
 * The `blocks` slot of the composer prompt (product spec §4): the block registry in plain text — codes, purposes,
 * knobs with their ranges, and port signatures.
 *
 * The protocol registry has no port signatures of its own (a block's ports depend on how a configuration wires it),
 * so they are read from the canonical recipes: every way each block is wired in the catalog, by actor. That keeps the
 * listing true to what validates, instead of inventing signatures.
 */

export function describeKnob(name: string, def: KnobDef): string {
  switch (def.type) {
    case 'enum':
      return `${name}: one of ${def.values.join(', ')}`;
    case 'enum[]':
      return `${name}: a list of distinct values from ${def.values.join(', ')}`;
    case 'int':
      return `${name}: a whole number from ${def.min} to ${def.max}`;
    case 'bool':
      return `${name}: true or false`;
    case 'string':
      return `${name}: text`;
    case 'string[]':
      return `${name}: a list of texts`;
  }
}

const knobLines = (knobs: Record<string, KnobDef>) => Object.entries(knobs).map(([n, d]) => `  - ${describeKnob(n, d)}`);

/** How each block is wired in the canonical recipes: "<actor> (<role>): consumes → produces", distinct, in catalog order. */
export function portSignatures(recipes: readonly Recipe[]): Map<BlockCode, string[]> {
  const out = new Map<BlockCode, string[]>(BLOCK_CODES.map((b) => [b, []]));
  for (const r of recipes) {
    for (const { step } of steps(r)) {
      if (!step.block) continue;
      const sig = `${step.actor} (${step.role}): ${step.consumes.join(', ') || 'nothing'} → ${step.produces.join(', ') || 'nothing'}`;
      const list = out.get(step.block)!;
      if (!list.includes(sig)) list.push(sig);
    }
  }
  return out;
}

/** The block registry as plain text, for the composer. */
export function blocksListing(recipes: readonly Recipe[]): string {
  const sigs = portSignatures(recipes);
  const lines: string[] = ['Blocks (the only blocks a recipe may use):'];
  for (const code of BLOCK_CODES) {
    const b = BLOCKS[code];
    lines.push(`- ${code} (default stage ${b.stage}): ${b.purpose}`);
    const knobs = knobLines(b.knobs);
    lines.push(knobs.length ? '  Knobs:' : '  Knobs: none');
    lines.push(...knobs.map((l) => `  ${l}`));
    const wired = sigs.get(code) ?? [];
    if (wired.length) lines.push('  Wired in the canonical recipes as:', ...wired.map((s) => `    - ${s}`));
  }
  lines.push('', 'Knobs of steps that are not blocks:');
  for (const [role, knobs] of Object.entries(ROLE_KNOBS)) lines.push(`- ${role}:`, ...knobLines(knobs as Record<string, KnobDef>).map((l) => `  ${l}`));
  lines.push('', `Glue (not blocks; no knobs): ${GLUE_CODES.join(', ')}`);
  lines.push(`Ports: ${PORT_TYPES.join(', ')}`);
  return lines.join('\n');
}
