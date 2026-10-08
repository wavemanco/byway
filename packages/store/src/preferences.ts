/**
 * Per-workspace Settings (Preferences). A workspace with no row has never changed a setting and reads as the defaults,
 * which the contract fixes; a patch writes the whole merged row, so a later change of default does not alter a
 * setting the user already chose.
 */
import type { SQLOutputValue } from 'node:sqlite';
import type { Preferences } from '@byway/contracts';
import { invalid, nonEmpty } from './validate.ts';

/** The contract's defaults (Store.getPreferences): the balanced profile, real models when keys exist, plain names. */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({ profileId: 'balanced', demoMode: false, showTechnicalNames: false });

export const PREFERENCE_KEYS = ['profileId', 'demoMode', 'showTechnicalNames'] as const satisfies readonly (keyof Preferences)[];

function flag(what: string, value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid(`${what} must be true or false, got ${JSON.stringify(value)}`);
  return value;
}

/** `current` with the checked fields of `patch` applied; undefined fields keep their value. */
export function mergePreferences(current: Preferences, patch: Record<string, unknown>): Preferences {
  return {
    profileId: patch.profileId === undefined ? current.profileId : nonEmpty('profileId', patch.profileId),
    demoMode: patch.demoMode === undefined ? current.demoMode : flag('demoMode', patch.demoMode),
    showTechnicalNames: patch.showTechnicalNames === undefined ? current.showTechnicalNames : flag('showTechnicalNames', patch.showTechnicalNames),
  };
}

export function toPreferences(r: Record<string, SQLOutputValue> | undefined): Preferences {
  if (!r) return { ...DEFAULT_PREFERENCES };
  return { profileId: String(r.profile_id), demoMode: Number(r.demo_mode) === 1, showTechnicalNames: Number(r.show_technical_names) === 1 };
}
