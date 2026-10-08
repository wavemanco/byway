/**
 * Stand-in provider keys for the end-to-end run. They are not real keys and demo mode never sends them anywhere; they
 * are set so there is something to leak, and the suite fails if any value shows up in a page, a response or a request.
 * Set in the server's environment, they also keep a real `.env.agents` from being loaded (it only fills missing keys).
 */
export const E2E_KEYS = {
  ANTHROPIC_API_KEY: 'sk-ant-e2e-SENTINEL-not-a-real-key-7f3a',
  OPENAI_API_KEY: 'sk-e2e-SENTINEL-not-a-real-key-91c2',
  GEMINI_API_KEY: 'e2e-SENTINEL-gemini-not-a-real-key-5d18',
  OPENROUTER_API_KEY: 'sk-or-e2e-SENTINEL-not-a-real-key-2b6e',
  FAL_KEY: 'e2e-SENTINEL-fal-not-a-real-key-c4a9',
} as const;

/** The part every stand-in key shares: a cheap first test before comparing each value. */
export const SENTINEL = 'SENTINEL';
