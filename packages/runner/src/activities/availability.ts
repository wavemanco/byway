/**
 * What a run's profile can do with the keys present. In demo mode every call goes to the mock whatever profile the run
 * names, so the 'demo' profile's status answers (contracts v4 Gateway.demo); otherwise the run's own profile does.
 * - Images and video: a profile with no image or video model (or no key for it) makes the step finish skipped with a
 *   plain note (ADR-0069).
 * - A reviewer from another AI family (FID-1, convention C3): a critic whose family knob is 'other' runs on the
 *   profile's `otherFamily` model when its key is present; otherwise a fresh session of the same family reviews, and the
 *   step says so. In demo mode that is the demo profile's mock stand-in, which the gateway serves there.
 */
import type { ModelRef, ProfileStatus } from '@byway/contracts';
import { DEMO_PROFILE_ID } from '@byway/gateway';
import type { RunRef } from '../types.ts';
import type { RunnerDeps } from './deps.ts';

/** The note of a different-family critic that ran on the same family (convention C3, word for word). */
export const OTHER_FAMILY_FALLBACK_NOTE = 'No reviewer from another AI family is configured, so a fresh session of the same family reviewed this.';

function statusOf(deps: Pick<RunnerDeps, 'gateway'>, run: Pick<RunRef, 'profileId'>): ProfileStatus | undefined {
  const profileId = deps.gateway.demo ? DEMO_PROFILE_ID : run.profileId;
  return deps.gateway.profileStatus().find((s) => s.profile.id === profileId);
}

export function mediaStatus(deps: Pick<RunnerDeps, 'gateway'>, run: Pick<RunRef, 'profileId'>): Pick<ProfileStatus, 'images' | 'video'> {
  const status = statusOf(deps, run);
  return { images: status?.images ?? false, video: status?.video ?? false };
}

/** The model a different-family critic runs on, or undefined when the profile has none usable (then: same family). */
export function otherFamilyModel(deps: Pick<RunnerDeps, 'gateway'>, run: Pick<RunRef, 'profileId'>): ModelRef | undefined {
  const status = statusOf(deps, run);
  return status?.otherFamily && status.profile.otherFamily ? status.profile.otherFamily : undefined;
}
