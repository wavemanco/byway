/**
 * @byway/gateway: the model gateway (ADR-0030, product spec §2, §3.3, §3.4). Every model, image and video call in the product
 * goes through `createGateway(...)`, which implements the `Gateway` contract from @byway/contracts.
 */
export { createGateway, ModelGateway, type BudgetDetails, type BudgetError, type CapsSource, type GatewayOptions } from './gateway.ts';
export { cleanReason, declineAdvice, declineStory, MAX_REASON_CHARS, notMadeProblem } from './declines.ts';
export { configuredProviders, isConfigured, KEY_VARS, loadEnvFile, namesFromEnvFile, parseEnv, withoutSecrets, type Env, type EnvLoadReport } from './env.ts';
export { DEMO_PROFILE_ID, OPENROUTER_PINS, PROFILES, profileStatus, tierProviders, type ProfileStatus } from './profiles.ts';
export { PRICES, priceFor, tokenCost, type PriceRow } from './prices.ts';
export { DEFAULT_WAIT_MINUTES, minutesMs, modelWaits, WAIT_CHOICES, waitMinutesFor } from './waits.ts';
export { waitedWords } from './waited.ts';
export { estimateInputTokens, imageTokens, maxCompletionCost, maxImageCost, maxVideoCost, textTokens } from './estimate.ts';
export { absorbable, entryHash, GENESIS_HASH, Ledger, LEDGER_START, readLedgerLine, setAsideTails, type GatewayLedgerEntry, type LedgerDraft, type LedgerOptions, type LockedLedger } from './ledger.ts';
export { MemorySpendBook, memorySpendBook } from './memory-book.ts';
export { budgetError, PaidCalls, type PaidCallsOptions } from './paid.ts';
export { makeRedactor, type Redactor } from './redact.ts';
export { findHeldKey, heldKeyError, isHeldKeyError, type HeldKeyError } from './held-key.ts';
export { DEFAULT_RESPONDERS, parsePurpose, reply, respond, responderFor, type MockContext, type MockReply, type Responder } from './mock/responders.ts';
export { composedRecipe } from './mock/compose.ts';
/** The demo's revision markers stripped from text a person sees (UX-6); the mock keeps them in the stored text. */
export { withoutMarks } from './mock/revision.ts';
export { EXPOSURE_FILENAME, ExposureRegister, exposurePath, familyOf, isJudgingPurpose, readExposure, type ExposureEntry } from './exposure.ts';
export { mockAdapter } from './providers/mock.ts';
export { cancelJob, createFalClient, EXTRACT_FRAME_SECONDS_BOUND, FAL_EXTRACT_FRAME, FAL_VIDEO_MODELS, falAdapter, falVideoSeconds, type FalCancel, type FalClientLike } from './providers/fal.ts';
export type { ProviderAdapter } from './providers/types.ts';
