/**
 * Errors the renderer throws, with a code the runner can branch on: a bad template is a packaging bug (fail the
 * deployment), an unknown id or a missing slot is a wiring bug in the caller (fail the step with the message).
 */
export type PromptErrorCode = 'unknown-template' | 'no-variant' | 'missing-slot' | 'bad-template';

export class PromptTemplateError extends Error {
  override name = 'PromptTemplateError';
  readonly code: PromptErrorCode;
  /** The missing slot, for 'missing-slot'. */
  readonly slot: string | undefined;
  constructor(code: PromptErrorCode, message: string, slot?: string) {
    super(message);
    this.code = code;
    this.slot = slot;
  }
}
