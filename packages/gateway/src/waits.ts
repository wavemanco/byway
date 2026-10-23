/**
 * How long byway waits for each model's answer (Settings' "How long to wait for an answer"). The owner chose on
 * 2026-10-22, per model ("Per model (Recommended)"):
 * - text: "Build selectable limits for every model/provider: 15, 30, 45, and 60 minutes", default "15 minutes
 *   (Recommended)";
 * - images: "5, 10, 15, 20; default 15 (Recommended)";
 * - video: 30, 45, 60 or 75 minutes, "30 minutes (Recommended)".
 *
 * A model's kind is where the profiles use it: a text tier or another-family critic is text, a profile's image model an
 * image, its video model video. The mock's models have none (the demo waits on nothing). The gateway reads the chosen
 * wait on every call (CapsSource.waitMinutes), and a model with none waits its kind's default, as does a replacement
 * model a profile starts using.
 */
import type { ModelProfile, ModelRef, ModelWait, WaitKind } from '@byway/contracts';

/** The minutes each kind of model offers, shortest first. */
export const WAIT_CHOICES: Readonly<Record<WaitKind, readonly number[]>> = { text: [15, 30, 45, 60], image: [5, 10, 15, 20], video: [30, 45, 60, 75] };

/** What a model of each kind waits while no one has chosen. */
export const DEFAULT_WAIT_MINUTES: Readonly<Record<WaitKind, number>> = { text: 15, image: 15, video: 30 };

/** A wait in milliseconds. */
export const minutesMs = (minutes: number): number => minutes * 60_000;

/**
 * Every model the profiles use, once each by provider and model, in the profiles' order (text tiers, then the other-family
 * critic, then image, then video, profile by profile), with the waits its kind offers. A model a profile uses as two
 * kinds keeps the first.
 */
export function modelWaits(profiles: readonly ModelProfile[]): ModelWait[] {
  const out = new Map<string, ModelWait>();
  const add = (ref: ModelRef | undefined, kind: WaitKind) => {
    if (!ref || ref.provider === 'mock') return;
    const key = `${ref.provider}\u0000${ref.model}`;
    if (!out.has(key)) out.set(key, { provider: ref.provider, model: ref.model, kind, choices: WAIT_CHOICES[kind], defaultMinutes: DEFAULT_WAIT_MINUTES[kind] });
  };
  for (const p of profiles) {
    add(p.tiers.big, 'text');
    add(p.tiers.mid, 'text');
    add(p.otherFamily, 'text');
    add(p.image, 'image');
    add(p.video, 'video');
  }
  return [...out.values()];
}

/**
 * The wait a call of `kind` keeps, in minutes: what was chosen for its model when its kind offers it, else the kind's
 * default. A choice its kind does not offer (one the store holds for a model now used as another kind) is not used.
 */
export function waitMinutesFor(kind: WaitKind, chosen: number | undefined): number {
  return chosen !== undefined && WAIT_CHOICES[kind].includes(chosen) ? chosen : DEFAULT_WAIT_MINUTES[kind];
}
