export type AdvisorErrorCode =
  /** The intake model's answer could not be read, even after one retry with the parse error. */
  | 'intake-unreadable'
  /** The composer never returned anything shaped like a recipe, even after its repairs. */
  | 'compose-unreadable'
  /** A recipe id that is not one of the eight protocol configurations. */
  | 'unknown-recipe'
  /** A model profile the gateway does not know (estimates price by profile). */
  | 'unknown-profile';

/** A failure the product app can explain in plain words. Gateway errors (budget, keys) pass through unchanged. */
export class AdvisorError extends Error {
  override name = 'AdvisorError';
  readonly code: AdvisorErrorCode;
  constructor(code: AdvisorErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
