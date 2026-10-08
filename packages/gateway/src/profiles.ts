import type { ModelProfile, ModelRef, ProfileStatus, ProviderId } from '@byway/contracts';
import { isConfigured, type Env } from './env.ts';

/** The contract's profile status, re-exported where this package has always exported it. */
export type { ProfileStatus };

const ref = (provider: ProviderId, model: string): ModelRef => ({ provider, model });

/**
 * Model profiles: data, chosen per run (judgment uses the big tier, execution the mid tier: default rule 5).
 * Every model id was checked against its provider's documentation on 2026-10-07:
 * - Anthropic: platform.claude.com/docs/en/about-claude/models/overview (claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5).
 * - OpenAI: developers.openai.com/api/docs/models (gpt-6-astra, gpt-6.1-sol, gpt-image-2.5-flare, gpt-image-2.5-sunburst).
 * - Google: ai.google.dev/gemini-api/docs/models (gemini-3.1-pro-preview, gemini-3.8-flash, gemini-nano-banana-2.1).
 * - OpenRouter: openrouter.ai/api/v1/models (anthropic/claude-opus-5.5, anthropic/claude-sonnet-5.5).
 * - fal.ai: fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video and fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video
 *   (also listed in @fal-ai/client 1.10.1's endpoint types).
 */
export const PROFILES: readonly ModelProfile[] = [
  {
    id: 'balanced',
    label: 'Balanced: Claude Opus 5.5 judges, Claude Sonnet 5.5 builds',
    tiers: { big: ref('anthropic', 'claude-opus-5-5'), mid: ref('anthropic', 'claude-sonnet-5-5') },
    // The cheapest verified image model ($0.0336 per 1K image); needs a Gemini key.
    image: ref('google', 'gemini-nano-banana-2.1'),
    // C5 relay links: Kling 2.5 Turbo Pro image-to-video at $0.07 per second; needs a fal.ai key.
    video: ref('fal', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'),
  },
  {
    id: 'best',
    label: 'Best: Claude Fable 5.1 judges, Claude Opus 5.5 builds',
    tiers: { big: ref('anthropic', 'claude-fable-5-1'), mid: ref('anthropic', 'claude-opus-5-5') },
    // OpenAI's "most capable model for image generation and editing"; needs an OpenAI key.
    image: ref('openai', 'gpt-image-2.5-sunburst'),
    // C5 relay links: Kling 3 Pro image-to-video (3–15 s clips, audio off) at $0.112 per second; needs a fal.ai key.
    video: ref('fal', 'fal-ai/kling-video/v3/pro/image-to-video'),
  },
  {
    id: 'openai',
    label: 'OpenAI: GPT-6 Astra judges, GPT-6.1 Sol builds',
    tiers: { big: ref('openai', 'gpt-6-astra'), mid: ref('openai', 'gpt-6.1-sol') },
    image: ref('openai', 'gpt-image-2.5-flare'),
  },
  {
    id: 'google',
    label: 'Google: Gemini 3.1 Pro judges, Gemini 3.8 Flash builds',
    tiers: { big: ref('google', 'gemini-3.1-pro-preview'), mid: ref('google', 'gemini-3.8-flash') },
    image: ref('google', 'gemini-nano-banana-2.1'),
  },
  {
    id: 'openrouter',
    label: 'Claude through OpenRouter, pinned to Anthropic',
    tiers: { big: ref('openrouter', 'anthropic/claude-opus-5.5'), mid: ref('openrouter', 'anthropic/claude-sonnet-5.5') },
  },
  {
    id: 'demo',
    label: 'Demo: sample outputs, no AI calls',
    tiers: { big: ref('mock', 'mock-big'), mid: ref('mock', 'mock-mid') },
    image: ref('mock', 'mock-image'),
    video: ref('mock', 'mock-video'),
  },
];

export const DEMO_PROFILE_ID = 'demo';

/**
 * OpenRouter upstream pins: each OpenRouter model is served only by the named provider slug, with fallbacks off, so
 * a run never silently moves to another host. A base slug matches that provider's regions but not its service tiers
 * (`anthropic/fast` must be named explicitly), per openrouter.ai/docs/guides/routing/provider-selection, 2026-10-07.
 */
export const OPENROUTER_PINS: Readonly<Record<string, string>> = {
  'anthropic/claude-fable-5.1': 'anthropic',
  'anthropic/claude-opus-5.5': 'anthropic',
  'anthropic/claude-sonnet-5.5': 'anthropic',
};

/** Providers a profile's text tiers need. */
export function tierProviders(profile: ModelProfile): ProviderId[] {
  return [...new Set([profile.tiers.big.provider, profile.tiers.mid.provider])];
}

/** Whether each profile can run with the keys in the environment. Reports provider names only, never keys. */
export function profileStatus(profiles: readonly ModelProfile[], env: Env): ProfileStatus[] {
  return profiles.map((profile) => {
    const missing = tierProviders(profile).filter((p) => !isConfigured(env, p));
    return {
      profile,
      usable: missing.length === 0,
      missing,
      images: profile.image !== undefined && isConfigured(env, profile.image.provider),
      video: profile.video !== undefined && isConfigured(env, profile.video.provider),
    };
  });
}
