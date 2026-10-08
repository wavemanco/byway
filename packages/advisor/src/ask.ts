import type { ChatMessage, CompletionRequest, CompletionResult, Gateway, PromptRef, RenderedPrompt } from '@byway/contracts';
import { ContractError } from './text.ts';

export const userText = (text: string): ChatMessage => ({ role: 'user', content: [{ type: 'text', text }] });
export const assistantText = (text: string): ChatMessage => ({ role: 'assistant', content: [{ type: 'text', text }] });

/** The template behind a call, as the ledger records it (spec §3.3 provenance): only the four PromptRef fields. */
export function promptRef(rendered: RenderedPrompt): PromptRef {
  return { id: rendered.id, version: rendered.version, hash: rendered.hash, fidelity: rendered.fidelity };
}

/**
 * The parts of a completion request that come from one rendered template: its provenance, its system prompt and its
 * user turn. Every advisor call is built from this, so none can reach the gateway without naming its template, and the
 * name always matches the text sent (a call never mixes two templates under one ref).
 */
export function fromTemplate(rendered: RenderedPrompt): Pick<CompletionRequest, 'prompt' | 'system' | 'messages'> {
  return { prompt: promptRef(rendered), ...(rendered.system ? { system: rendered.system } : {}), messages: [userText(rendered.user)] };
}

/** The follow-up turn that hands a model its own parse error (spec §3.3: one automatic retry, the error appended). */
export function retryNote(problem: string): string {
  return `That answer could not be used: ${problem}. Answer again, meeting the output format exactly.`;
}

/** Why an answer cannot be parsed before even trying: a cut-off answer is never trusted (CompletionResult.stopReason). */
export function truncation(result: CompletionResult): string | undefined {
  return result.stopReason === 'max-tokens' ? 'the answer was cut off at the output limit; keep it shorter' : undefined;
}

export type Asked<T> = { ok: true; value: T; text: string } | { ok: false; problem: string; text: string };

/**
 * One gateway call whose answer must meet an output contract, with one retry: the model sees its own answer and the
 * parse error, as the runner's parsers do. Gateway errors (budget, credentials) propagate untouched.
 */
export async function askParsed<T>(gateway: Gateway, req: CompletionRequest, parse: (text: string) => T): Promise<Asked<T>> {
  let messages = req.messages;
  let last: Asked<T> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await gateway.complete({ ...req, messages });
    const cut = truncation(result);
    try {
      if (cut) throw new ContractError(cut);
      return { ok: true, value: parse(result.text), text: result.text };
    } catch (e) {
      if (!(e instanceof ContractError)) throw e;
      last = { ok: false, problem: e.message, text: result.text };
      // Providers reject empty text blocks, so an empty answer is shown to the model as such.
      messages = [...messages, assistantText(result.text.trim() ? result.text : '(empty answer)'), userText(retryNote(e.message))];
    }
  }
  return last as Asked<T>;
}
