/**
 * @byway/gateway: the model gateway (ADR-0030, product spec §2, §3.3, §3.4). Every model and image call in the product
 * goes through `createGateway(...)`, which implements the `Gateway` contract from @byway/contracts.
 */
export { createGateway, ModelGateway, type BudgetDetails, type BudgetError, type CapsSource, type GatewayOptions } from './gateway.ts';
export { configuredProviders, isConfigured, KEY_VARS, loadEnvFile, parseEnv, type Env, type EnvLoadReport } from './env.ts';
export { DEMO_PROFILE_ID, OPENROUTER_PINS, PROFILES, profileStatus, tierProviders, type ProfileStatus } from './profiles.ts';
export { PRICES, priceFor, tokenCost, type PriceRow } from './prices.ts';
export { estimateInputTokens, imageTokens, maxCompletionCost, maxImageCost } from './estimate.ts';
export { entryHash, GENESIS_HASH, Ledger, type GatewayLedgerEntry, type LedgerDraft, type LedgerOptions } from './ledger.ts';
export { makeRedactor, type Redactor } from './redact.ts';
export { DEFAULT_RESPONDERS, parsePurpose, reply, respond, type MockContext, type MockReply, type Responder } from './mock/responders.ts';
export { composedRecipe } from './mock/compose.ts';
export { mockAdapter } from './providers/mock.ts';
export type { ProviderAdapter } from './providers/types.ts';
