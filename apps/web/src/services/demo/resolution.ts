/**
 * The store's structural check of an answer, as @byway/store makes it before writing (a pick chooses exactly k
 * distinct listed options; choose and compare exactly one; confirm a yes or no; text kinds a string). The answer
 * comes back normalised to the one field its kind uses. The runner checks answers first with friendlier messages
 * (runner.ts validateResolution); this is the last line, so a bad answer can never be stored.
 */
import type { CheckpointKind, CheckpointRecord, CheckpointResolution } from '@byway/contracts';

const CHOICE_KINDS: readonly CheckpointKind[] = ['pick', 'choose', 'compare'];

export function checkResolution(cp: Pick<CheckpointRecord, 'id' | 'kind' | 'options' | 'k'>, res: CheckpointResolution): CheckpointResolution {
  const fail = (problem: string) => new Error(`checkpoint ${cp.id} (${cp.kind}): ${problem}`);
  if (CHOICE_KINDS.includes(cp.kind)) {
    const choice = res.choice;
    if (!Array.isArray(choice) || choice.length === 0) throw fail('needs a non-empty choice');
    if (new Set(choice).size !== choice.length) throw fail('the choice lists an option twice');
    if (cp.options) {
      const known = new Set(cp.options.map((o) => o.id));
      const unknown = choice.filter((c) => !known.has(c));
      if (unknown.length > 0) throw fail(`the choice names unknown options ${unknown.join(', ')}`);
    }
    if (cp.kind === 'pick') {
      if (cp.k !== undefined && choice.length !== cp.k) throw fail(`exactly ${cp.k} must be picked, not ${choice.length}`);
    } else if (choice.length !== 1) {
      throw fail('exactly one option must be chosen');
    }
    return { checkpointId: cp.id, choice: [...choice] };
  }
  if (cp.kind === 'confirm') {
    if (typeof res.approved !== 'boolean') throw fail('needs a yes or no');
    return { checkpointId: cp.id, approved: res.approved };
  }
  if (typeof res.text !== 'string') throw fail('needs text');
  return { checkpointId: cp.id, text: res.text };
}
