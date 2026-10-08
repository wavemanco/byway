/**
 * Whether a run can make images or video. In demo mode every call goes to the mock whatever profile the run names, so
 * the 'demo' profile's status answers (contracts v4 Gateway.demo); otherwise the run's own profile does, and a profile
 * with no image or video model (or no key for it) makes the step finish skipped with a plain note (ADR-0069).
 */
import type { ProfileStatus } from '@byway/contracts';
import { DEMO_PROFILE_ID } from '@byway/gateway';
import type { RunRef } from '../types.ts';
import type { RunnerDeps } from './deps.ts';

export function mediaStatus(deps: Pick<RunnerDeps, 'gateway'>, run: Pick<RunRef, 'profileId'>): Pick<ProfileStatus, 'images' | 'video'> {
  const profileId = deps.gateway.demo ? DEMO_PROFILE_ID : run.profileId;
  const status = deps.gateway.profileStatus().find((s) => s.profile.id === profileId);
  return { images: status?.images ?? false, video: status?.video ?? false };
}
