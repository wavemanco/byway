import type { Each, Gate, Loop, Node, Optional, Pick, Replicate, Route, Seq, Step } from './schema.ts';

/** Small constructors that keep hand-written recipes readable. They add no defaults beyond `op`. */
export const step = (s: Omit<Step, 'op'>): Step => ({ op: 'step', ...s });
export const seq = (...steps: Node[]): Seq => ({ op: 'seq', steps });
export const replicate = (id: string, n: number, body: Node): Replicate => ({ op: 'replicate', id, n, body });
export const each = (id: string, body: Node): Each => ({ op: 'each', id, body });
export const loop = (id: string, body: Node, gate: Gate): Loop => ({ op: 'loop', id, body, gate });
export const optional = (id: string, trigger: string, body: Node): Optional => ({ op: 'optional', id, trigger, body });
export const route = (id: string, on: string, branches: { name: string; body: Node }[]): Route => ({ op: 'route', id, on, branches });
export const pick = (id: string, mode: Pick['mode'], k: number, actor: Pick['actor'], judge?: Step): Pick =>
  judge ? { op: 'pick', id, mode, k, actor, judge } : { op: 'pick', id, mode, k, actor };
