/**
 * Text helpers for slots and answers, following the shared conventions of product spec §3.3. Slot layouts that the
 * runner and the mock also rely on (the problem slot, labelled options) come from @byway/prompts' pure helpers, so they
 * cannot drift; what is here is the advisor's own: JSON slots and reading answers.
 */

/** The six characters of the JSON escape for a backtick (backslash, u, 0060), built from char codes to be unmistakable. */
const ESCAPED_BACKTICK = String.fromCharCode(92) + 'u0060';

/**
 * A JSON value for a slot the template already puts inside a ```json fence (`questions`, `nearest`, `artifact`):
 * pretty-printed, with every backtick written as the JSON escape \u0060. In JSON a backtick can only occur inside a
 * string, where the escape stands for the same character, so the value parses the same, while no run of backticks in
 * it (a model-written title, say) can close the template's fence early.
 */
export function jsonSlot(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/`/g, ESCAPED_BACKTICK);
}

/** The last fenced block of a language (```json … ```), or undefined when there is none. */
export function lastFenced(text: string, lang: string): string | undefined {
  const re = /(`{3,})([A-Za-z0-9_-]*)[^\n]*\n([\s\S]*?)\n?\1(?!`)/g;
  let found: string | undefined;
  for (const m of text.matchAll(re)) if ((m[2] ?? '').toLowerCase() === lang) found = m[3] ?? '';
  return found;
}

/**
 * The JSON value an answer carries: the last fenced json block, else the whole text (spec §3.3: parsers take the last
 * fenced block of the expected language and fall back to the whole text). Throws a plain message on bad JSON.
 */
export function answerJson(text: string): unknown {
  const body = lastFenced(text, 'json') ?? text.trim();
  try {
    return JSON.parse(body);
  } catch {
    throw new ContractError('the answer holds no valid JSON (expected one fenced json block)');
  }
}

/** An answer that does not meet its output contract; the message goes back to the model on the retry. */
export class ContractError extends Error {
  override name = 'ContractError';
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** At most `max` characters, cut at a word boundary with an ellipsis. */
export function clip(text: string, max: number): string {
  const t = oneLine(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
