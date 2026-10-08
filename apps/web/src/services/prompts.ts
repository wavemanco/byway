/**
 * The prompt renderer the app hands the advisor. @byway/advisor fences the `questions` and `nearest` slots itself
 * (```json … ```) and the advisor templates in @byway/prompts fence those slots again, so the rendered prompt holds a
 * fence inside a fence: a real model mostly copes, but the gateway's demo mock cannot read the chooser questions and
 * every recommendation fails in demo mode. Until one side stops fencing (reported for integration), the app collapses
 * a doubled fence of one language into one. A prompt without one is returned unchanged.
 */
import type { PromptRenderer, PromptSlot, RenderedPrompt } from '@byway/contracts';

/** An outer fence whose whole body is one inner fence of the same language: keep the inner one (it fits its body). */
const DOUBLE_FENCE = /(`{3,})([\w-]*)[ \t]*\n(`{3,})\2[ \t]*\n([\s\S]*?)\n\3[ \t]*\n\1(?!`)/g;

export function collapseDoubleFences(text: string): string {
  return text.replace(DOUBLE_FENCE, (_all, _outer: string, lang: string, inner: string, body: string) => `${inner}${lang}\n${body}\n${inner}`);
}

export function singleFenced(renderer: PromptRenderer): PromptRenderer {
  return {
    has: (id) => renderer.has(id),
    render(id: string, slots: Partial<Record<PromptSlot, string>>): RenderedPrompt {
      const out = renderer.render(id, slots);
      return { ...out, user: collapseDoubleFences(out.user), ...(out.system !== undefined ? { system: collapseDoubleFences(out.system) } : {}) };
    },
  };
}
