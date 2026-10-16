/**
 * Prompt renderers for the e2e scenarios, both recorded for assertions:
 * - `fakePrompts()` lays slot values out the way spec §3.3's shared conventions say, so the gateway's demo responders
 *   read them as they would read the real templates: the problem in <problem>…</problem>, labelled options and views as
 *   given ("### A", "### V1"), the GREAT lineup line, the relay brief ("Shot N"), and the current artifact last, as one
 *   fenced block in its medium's language. It names each template with a well-formed hash, as the gateway requires.
 *   For an id that is an image-briefs template in @byway/prompts' library (an ASSET step's prompt), it returns the
 *   image count that template declares (`images:`, ADR-0090), read from the real template, so the harness's ASSET
 *   steps are held to the same count as production's (C3's 1-1 included), and whether it asks for a line of advice
 *   (`advice: yes`, ADR-0101; only C3's), so the harness shows advice exactly where production does.
 * - `recordPrompts(renderer)` wraps any renderer (the real @byway/prompts one in the agreement test) the same way, and
 *   also keeps every render that threw (a missing slot, an unknown template).
 */
import { createHash } from 'node:crypto';
import type { ImageCount, Medium, PromptRenderer, PromptSlot, RenderedPrompt } from '@byway/contracts';
import { createPromptRenderer, type PromptLibrary } from '@byway/prompts';

const FENCE: Record<Medium, string> = { 'web-page': 'html', prose: 'markdown', options: 'json', media: 'json', 'code-diff': 'diff' };

export interface RenderCall {
  id: string;
  slots: Partial<Record<PromptSlot, string>>;
  user: string;
  rendered: RenderedPrompt;
}

export interface RenderFailure {
  id: string;
  slots: Partial<Record<PromptSlot, string>>;
  error: string;
}

export interface RecordingPrompts extends PromptRenderer {
  calls: RenderCall[];
  failures: RenderFailure[];
  /** Ids `has` answers false for (to test missing templates). */
  missing: Set<string>;
}

export const TELLS_CATALOG = '- delve\n- seamless\n- unlock\n- "not just X, but Y"';

/** A stable, well-formed template hash for a fake id ("sha256:<64 hex>", as the gateway checks). */
export const fakeHash = (id: string): string => `sha256:${createHash('sha256').update(`fake:${id}`).digest('hex')}`;

/** Record every render of `inner` (and every render that threw); `missing` hides ids from it. */
export function recordPrompts(inner: PromptRenderer): RecordingPrompts {
  const calls: RenderCall[] = [];
  const failures: RenderFailure[] = [];
  const missing = new Set<string>();
  return {
    calls,
    failures,
    missing,
    has: (id) => !missing.has(id) && inner.has(id),
    render(id, slots): RenderedPrompt {
      try {
        if (missing.has(id)) throw new Error(`Unknown prompt template "${id}"`);
        const rendered = inner.render(id, slots);
        calls.push({ id, slots: { ...slots }, user: rendered.user, rendered });
        return rendered;
      } catch (e) {
        failures.push({ id, slots: { ...slots }, error: (e as Error).message });
        throw e;
      }
    },
  };
}

let library: PromptLibrary | undefined;

/**
 * The image count the real template for `id` (and the medium's variant) declares, when it is an image-briefs template
 * in @byway/prompts' library; undefined for any other id, as the real renderer returns none for them.
 */
export function declaredImages(id: string, medium: string | undefined): ImageCount | undefined {
  library ??= createPromptRenderer();
  if (!library.has(id)) return undefined;
  try {
    const info = library.info(id, medium);
    return info.output === 'image-briefs' ? info.images : undefined;
  } catch {
    // No variant for this medium: the real renderer would refuse it; the fake renders it with no count.
    return undefined;
  }
}

/** Whether the real template for `id` (and the medium's variant) asks for a line of advice (ADR-0101). */
export function declaredAdvice(id: string, medium: string | undefined): boolean {
  library ??= createPromptRenderer();
  if (!library.has(id)) return false;
  try {
    return library.info(id, medium).advice;
  } catch {
    return false;
  }
}

function fakeRenderer(): PromptRenderer {
  return {
    has: () => true,
    render(id, s): RenderedPrompt {
      const images = declaredImages(id, s.medium);
      const meta = {
        id,
        version: 1,
        hash: fakeHash(id),
        fidelity: 'project' as const,
        ...(images !== undefined ? { images } : {}),
        ...(declaredAdvice(id, s.medium) ? { advice: true as const } : {}),
      };
      if (id.startsWith('tells.')) return { ...meta, user: `${TELLS_CATALOG}\n- (${id})` };
      const parts: string[] = [`Prompt: ${id}`];
      if (s.problem !== undefined) parts.push(`<problem>${s.problem}</problem>`);
      if (s.refs) parts.push(`GREAT mode: rank every item, best first.\nThere are ${s.refs} references and 1 of ours (${s.labels}).`);
      if (s.brief) parts.push(`Brief: ${s.brief}`);
      if (s.seed) parts.push(`Seed: ${s.seed}. Interpret it for direction; never reveal it.`);
      if (s.taste) parts.push(`Taste: ${s.taste}`);
      if (s.round) parts.push(`Round: ${s.round}`);
      if (s.voice) parts.push(`Your words:\n${s.voice}`);
      if (s.critique) parts.push(`Critique:\n${s.critique}`);
      if (s.tells) parts.push(`Tells:\n${s.tells}`);
      if (s.images) parts.push(`Images:\n${s.images}`);
      if (s.options) parts.push(`Options:\n${s.options}`);
      if (s.view) parts.push(`View:\n${s.view}`);
      if (s.artifact !== undefined && s.medium) parts.push(`The current work:\n\n\`\`\`${FENCE[s.medium as Medium]}\n${s.artifact.trimEnd()}\n\`\`\``);
      return { ...meta, user: parts.join('\n\n') };
    },
  };
}

export function fakePrompts(): RecordingPrompts {
  return recordPrompts(fakeRenderer());
}
