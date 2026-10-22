/**
 * Label text. Evidence labels are computed by the advisor from the study registry (CR11); the UI only words
 * them, and never more strongly than the verdict allows.
 */
import type { ChooserAnswer, EvidenceLabel, ProfileStatus, ProviderId, Recommendation, RunStatus } from '@byway/contracts';

/** Provider names as people know them. */
export const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
  fal: 'fal.ai',
  mock: 'Sample outputs',
};

/** Settings: whether the profile can make C5's video clips (ProfileStatus.video, ADR-0069). */
export function videoAvailability(status: Pick<ProfileStatus, 'video' | 'profile'> | undefined): string {
  if (status?.video) return 'Video clips: available';
  const provider = status?.profile.video?.provider;
  const name = provider && provider !== 'mock' ? PROVIDER_NAMES[provider] : PROVIDER_NAMES.fal;
  return `Video clips need a ${name} key`;
}

/** Settings: what a profile still needs before it can run, or null when it can. */
export function profileNeeds(status: Pick<ProfileStatus, 'usable' | 'missing'>): string | null {
  if (status.usable || status.missing.length === 0) return null;
  const names = status.missing.map((p) => PROVIDER_NAMES[p]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Needs a key for ${list}`;
}

const SCOPE_TEXT: Record<EvidenceLabel['scope'], string> = {
  Exact: 'this exact recipe',
  'Derived-from-studied': 'derived from a studied recipe',
  Composed: 'composed',
  Experimental: 'experimental',
  None: '',
};

export function evidenceHeadline(label: EvidenceLabel): string {
  // A composed recipe never inherits its blocks' labels.
  if (label.scope === 'Composed') return 'Composed — not tested';
  if (label.verdict === 'Untested') return 'Untested — not yet studied';
  const scope = SCOPE_TEXT[label.scope];
  return scope ? `${label.verdict} (${scope})` : label.verdict;
}

const STATUS_TEXT: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Working',
  waiting: 'Your turn',
  paused: 'Paused',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function runStatusLabel(status: RunStatus): string {
  return STATUS_TEXT[status];
}

export function fitText(fit: Recommendation['fit']): string {
  return fit === 'strong' ? 'Strong fit' : fit === 'partial' ? 'Partial fit' : 'No clear fit';
}

/** The recommender itself is unstudied (CR11); every recommendation says so. */
export const ROUTING_NOTE = 'How byway picks a recipe has not been tested yet. Treat it as a starting point.';

/** Under each chooser question: why it is answered as it is, and whether a person or the intake model said so. */
export function answerNote(answer: ChooserAnswer): string {
  if (answer.setBy === 'user') return 'You set this.';
  const sure = answer.confidence >= 0.85 ? 'sure' : answer.confidence >= 0.7 ? 'fairly sure' : 'unsure';
  return `${answer.rationale} (AI read, ${sure})`;
}

/**
 * Seven explanations in a row are noise: a yes (it routes), and anything you set, are explained; the intake's
 * plain noes are not, though their answer stays visible and flippable.
 */
export function showAnswerNote(answer: ChooserAnswer): boolean {
  return answer.answer || answer.setBy === 'user';
}

/** The chooser's rule (spec §4): answers are in question order and the first yes decides. */
export function decidingQuestion(answers: ChooserAnswer[]): string | undefined {
  return answers.find((a) => a.answer)?.questionId;
}

export type ControlAction = 'pause' | 'resume' | 'cancel';

/**
 * The Cancel question (ADR-0111): one fixed sentence, true for every profile. byway cuts off a text call to Anthropic,
 * OpenAI or OpenRouter and a video clip; a text call to Google and every image call finish. The run shows Cancelled at
 * once, without waiting for its calls, so a call that finishes does so after the run stops, and its cost is then added
 * to the run. A cut-off call may still be paid for, and so may one that finishes.
 */
export const CANCEL_QUESTION =
  'Cancel this run? What it made so far is kept. An AI call already under way may still be paid for: byway cuts off text and video calls, except Google’s text calls, and other calls finish after the run stops.';

/**
 * Under a cancelled run, and under a failed one, since a failure ends the run and cuts off its other calls the same way:
 * where a call byway cut off is counted (ADR-0111). Only a cut-off call that may have been billed is listed; one stopped
 * before anything was sent, or a fal job removed before it ran, counts nothing, and one whose answer or clip came anyway
 * is settled at its cost, in the run's.
 */
export const CUT_OFF_NOTE =
  'If byway cut off an AI call that may have been billed, Settings lists it under Spending records; it counts at its estimate against the workspace budget, not this run’s, until you clear it.';

/**
 * Under a run that has ended while some of its AI calls are still under way: a call byway does not cut off (Google's text
 * calls, every image call) finishes after the run stops, and its cost is added to the run then. The screen keeps
 * polling until none is left (view/run.ts pollDelay).
 */
export function underWayNote(calls: number): string | null {
  if (calls <= 0) return null;
  return `${calls === 1 ? '1 AI call this run started is' : `${calls} AI calls this run started are`} still under way; the cost shown is brought up to date as ${calls === 1 ? 'it ends' : 'they end'}.`;
}

/** What a run control's button says while its request is on its way (UX-10: feedback at once, not after a second). */
export function controlPendingLabel(action: ControlAction): string {
  return { pause: 'Pausing…', resume: 'Resuming…', cancel: 'Cancelling…' }[action];
}
