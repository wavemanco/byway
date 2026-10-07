/** The sixteen typed ports of 02-grammar §3. `option_set` only ever holds artifacts in this milestone. */
export const PORT_TYPES = [
  'intent',
  'seed',
  'option_set<artifact>',
  'taste',
  'brief',
  'artifact',
  'view',
  'refs',
  'critique',
  'score',
  'asset',
  'anchor',
  'tells',
  'voice',
  'cred',
  'failed',
] as const;

export type PortType = (typeof PORT_TYPES)[number];

export const OPTION_SET: PortType = 'option_set<artifact>';
