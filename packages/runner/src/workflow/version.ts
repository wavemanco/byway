/**
 * The workflow code's own hash (C7): build.ts writes it into the bundle in place of `__BYWAY_WORKFLOW_HASH__`. A run
 * records it in its memo when it starts, so a worker started on different code can find the runs it cannot replay.
 * Workflow code: no Node, no I/O.
 */
declare const __BYWAY_WORKFLOW_HASH__: string | undefined;

/** The memo key a run's workflow hash is recorded under. */
export const WORKFLOW_HASH_MEMO = 'bywayWorkflowHash';

/** `bywaywf:<64 hex>` in a bundle built by buildWorkflows; 'unbundled' when the code runs from source. */
const stamped = typeof __BYWAY_WORKFLOW_HASH__ === 'string' ? __BYWAY_WORKFLOW_HASH__ : 'unbundled';

/** The 64-hex hash, or 'unbundled'. */
export const WORKFLOW_HASH: string = stamped.startsWith('bywaywf:') ? stamped.slice('bywaywf:'.length) : stamped;
