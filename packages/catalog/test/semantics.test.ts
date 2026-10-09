/**
 * The catalog agrees with the executed semantics (ADR-0092) on every reading: every declaration says what execution
 * does, and the new readings (runs every time, VOICE scope) give the catalog the protections it had before. So the
 * declaration rule and the new rules change no catalog verdict.
 */
import { describe, expect, it } from 'vitest';
import {
  blockAgrees,
  checkpoints,
  declaresVoice,
  machineWrites,
  personWrite,
  PICK_ACTOR,
  PICK_JUDGE_ROLES,
  placements,
  voiceArm,
  voiceScope,
  voiceWrite,
  walk,
  type Node,
  type Recipe,
  type Step,
} from '@byway/recipe';
import { CATALOG } from '../src/index.ts';

/** The composed profile's reading before ADR-0092 (advisor profile.ts alwaysRunSteps), kept here to compare with. */
function alwaysRunBefore(recipe: Recipe): Step[] {
  const out: Step[] = [];
  const visit = (n: Node): void => {
    switch (n.op) {
      case 'step':
        out.push(n);
        return;
      case 'seq':
        n.steps.forEach(visit);
        return;
      case 'optional':
      case 'route':
      case 'pick':
        return;
      case 'audit':
        n.lenses.forEach((l) => visit(l.body));
        return;
      default:
        visit(n.body);
    }
  };
  recipe.stages.forEach((s) => visit(s.body));
  return out;
}
const isHumanVoiceBefore = (s: Step) => s.role === 'voice' && s.block === 'VOICE' && s.actor === 'human' && s.produces.includes('artifact');
const isAuthorshipBefore = (s: Step) => s.role === 'build' && s.actor === 'human' && s.writes === true;

const cases = CATALOG.map((r) => [r.id, r] as const);

describe('every catalog declaration says what execution does', () => {
  it.each(cases)('%s: a VOICE is declared exactly where your words are written, and every block label is its role’s', (_id, r) => {
    for (const { step } of placements(r)) {
      expect(declaresVoice(step), step.id).toBe(voiceWrite(step));
      expect(blockAgrees(step), step.id).toBe(true);
    }
  });

  it.each(cases)('%s: every step that changes the work where it sits declares writes: true', (_id, r) => {
    for (const p of placements(r)) if (!p.contained && (machineWrites(p.step) || personWrite(p.step))) expect(p.step.writes, p.step.id).toBe(true);
  });

  it.each(cases)('%s: no person write or VOICE inside a container or a candidate', (_id, r) => {
    for (const p of placements(r)) {
      if (p.contained) expect(personWrite(p.step) || declaresVoice(p.step), p.step.id).toBe(false);
      if (p.perCandidate) expect(voiceArm(p.step), p.step.id).toBe(false);
    }
  });

  it.each(cases)('%s: picks are made by the actor their mode names, C picks by a judge; a person’s loop ends with them', (_id, r) => {
    walk(r, (n) => {
      if (n.op === 'pick') {
        expect(n.actor, n.id).toBe(PICK_ACTOR[n.mode]);
        if (n.mode === 'C') expect(n.judge && PICK_JUDGE_ROLES.has(n.judge.role) && n.judge.actor === 'model', n.id).toBe(true);
      }
      if (n.op === 'loop' && n.gate.metric === 'human') expect(n.gate.onCap, n.id).toBe('human');
    });
  });

  it.each(cases)('%s: no gate that retries a stage sits inside replicate, each or an audit lens', (_id, r) => {
    const inside = (n: Node, fanOut: boolean): void => {
      if (n.op === 'gate' && n.retry) expect(fanOut, n.id).toBe(false);
      const deeper = fanOut || n.op === 'replicate' || n.op === 'each' || n.op === 'audit';
      if (n.op === 'seq') n.steps.forEach((c) => inside(c, deeper));
      else if (n.op === 'route') n.branches.forEach((b) => inside(b.body, deeper));
      else if (n.op === 'audit') n.lenses.forEach((l) => inside(l.body, deeper));
      else if (n.op !== 'step' && n.op !== 'pick') inside(n.body, deeper);
    };
    r.stages.forEach((s) => inside(s.body, false));
  });
});

describe('the new readings keep the catalog’s protections', () => {
  it.each(cases)('%s: the checkpoints that run every time are the ones the profile counted before', (_id, r) => {
    const before = alwaysRunBefore(r).filter((s) => isHumanVoiceBefore(s) || isAuthorshipBefore(s)).map((s) => s.id);
    expect(checkpoints(r).map((c) => c.placement.step.id)).toEqual(before);
  });

  it('every VOICE covers the copy its configuration documents (03, spec §3.3)', () => {
    const documented: Record<string, string> = {
      'c1/voice': 'all',
      'c2/voice': 'all',
      'c3/voice': 'all',
      // C4 is VOICE-lite: you rewrite the key lines (its declared exception to default rule 9); the optional claim log
      // signs off the claims only.
      'c4/voice': 'all/key-lines',
      'c4/claim-sign-off': 'claims',
      // C5 locks the voice-over script in D1; the late VOICE edits the on-screen copy.
      'c5/vo-script': 'script',
      'c5/voice': 'on-screen',
      'c6/voice': 'all',
      'c6a/voice': 'all',
      'c7/voice': 'all',
    };
    const found: Record<string, string> = {};
    for (const r of CATALOG) {
      for (const { step } of placements(r)) {
        if (!voiceWrite(step)) continue;
        const s = voiceScope(step, r.medium);
        found[`${r.id}/${step.id}`] = `${s.base}${s.keyLines ? '/key-lines' : ''}`;
      }
    }
    expect(found).toEqual(documented);
  });
});
