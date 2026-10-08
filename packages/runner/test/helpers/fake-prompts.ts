/**
 * A fake PromptRenderer that lays slot values out the way spec §3.3's shared conventions say, so the gateway's demo
 * responders read them as they would read the real templates: the problem in <problem>…</problem>, labelled options
 * and views as given ("### A", "### V1"), the GREAT lineup line, the relay brief ("Shot N"), and the current artifact
 * last, as one fenced block in its medium's language. Every render is recorded for assertions.
 */
import type { Medium, PromptRenderer, PromptSlot, RenderedPrompt } from '@byway/contracts';

const FENCE: Record<Medium, string> = { 'web-page': 'html', prose: 'markdown', options: 'json', media: 'json', 'code-diff': 'diff' };

export interface RenderCall {
  id: string;
  slots: Partial<Record<PromptSlot, string>>;
  user: string;
}

export interface FakePrompts extends PromptRenderer {
  calls: RenderCall[];
  /** Ids `has` answers false for (to test missing templates). */
  missing: Set<string>;
}

export const TELLS_CATALOG = '- delve\n- seamless\n- unlock\n- "not just X, but Y"';

export function fakePrompts(): FakePrompts {
  const calls: RenderCall[] = [];
  const missing = new Set<string>();
  return {
    calls,
    missing,
    has: (id) => !missing.has(id),
    render(id, slots): RenderedPrompt {
      if (missing.has(id)) throw new Error(`Unknown prompt template "${id}"`);
      if (id.startsWith('tells.')) return { id, version: 1, hash: 'sha256:fake', fidelity: 'project', user: TELLS_CATALOG };
      const s = slots;
      const parts: string[] = [`Prompt: ${id}`];
      if (s.problem !== undefined) parts.push(`<problem>${s.problem}</problem>`);
      if (s.refs) parts.push(`GREAT mode: rank ours among the references.\nThere are ${s.refs} references and 1 of ours (${s.labels}).`);
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
      const user = parts.join('\n\n');
      calls.push({ id, slots: { ...s }, user });
      return { id, version: 1, hash: 'sha256:fake', fidelity: 'project', user };
    },
  };
}
