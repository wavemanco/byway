/**
 * What a valid answer to each checkpoint kind looks like. Pure (no Node imports) and exported as
 * `@byway/store/resolution`, so the runner can run the same check in its Temporal Update validator — inside workflow
 * code, before the workflow accepts the answer — and the store can re-check it before writing.
 */
import type { CheckpointKind, CheckpointRecord, CheckpointResolution } from '@byway/contracts';

export type ResolutionCheck = { ok: true; resolution: CheckpointResolution } | { ok: false; problem: string };

type Target = Pick<CheckpointRecord, 'id' | 'kind' | 'options' | 'k'>;

const CHOICE_KINDS: readonly CheckpointKind[] = ['pick', 'choose', 'compare'];
const TEXT_KINDS: readonly CheckpointKind[] = ['react', 'write', 'directive'];

/**
 * Checks `res` against the checkpoint it answers and returns it normalized to the one field its kind uses (pick, choose
 * and compare: `choice`; confirm: `approved`; react, write and directive: `text`). Fields that belong to other kinds are
 * dropped rather than refused, so a generic form that sends every field still works.
 *
 * A choice names distinct options, all of them listed when the checkpoint lists options. A pick chooses exactly `k`
 * (any non-empty number when it has no `k`); choose and compare choose exactly one.
 */
export function checkResolution(cp: Target, res: CheckpointResolution): ResolutionCheck {
  const fail = (problem: string): ResolutionCheck => ({ ok: false, problem: `checkpoint "${cp.id}" (${cp.kind}): ${problem}` });
  if (typeof res !== 'object' || res === null) return fail('the resolution must be an object');
  if (res.checkpointId !== cp.id) return fail(`the resolution names checkpoint ${JSON.stringify(res.checkpointId)}`);

  if (CHOICE_KINDS.includes(cp.kind)) {
    const choice: unknown = res.choice;
    if (!Array.isArray(choice) || choice.length === 0 || !choice.every((c) => typeof c === 'string')) {
      return fail('needs `choice`: a non-empty list of option ids');
    }
    if (new Set(choice).size !== choice.length) return fail('`choice` lists an option twice');
    if (cp.options) {
      const known = new Set(cp.options.map((o) => o.id));
      const unknown = choice.filter((c) => !known.has(c));
      if (unknown.length > 0) return fail(`\`choice\` names unknown options ${unknown.map((c) => JSON.stringify(c)).join(', ')}`);
    }
    if (cp.kind === 'pick') {
      if (cp.k !== undefined && choice.length !== cp.k) {
        return fail(`\`choice\` picks ${choice.length} option${choice.length === 1 ? '' : 's'}; exactly ${cp.k} must be picked`);
      }
    } else if (choice.length !== 1) {
      return fail(`\`choice\` must name exactly one option, not ${choice.length}`);
    }
    return { ok: true, resolution: { checkpointId: cp.id, choice: [...choice] } };
  }

  if (cp.kind === 'confirm') {
    if (typeof res.approved !== 'boolean') return fail('needs `approved`: true or false');
    return { ok: true, resolution: { checkpointId: cp.id, approved: res.approved } };
  }

  if (TEXT_KINDS.includes(cp.kind)) {
    if (typeof res.text !== 'string') return fail('needs `text`: a string');
    return { ok: true, resolution: { checkpointId: cp.id, text: res.text } };
  }

  return fail('unknown checkpoint kind');
}
