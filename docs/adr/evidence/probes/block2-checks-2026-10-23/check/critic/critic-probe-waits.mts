import { PROFILES } from './critic/packages/gateway/src/profiles.ts';
import { modelWaits } from './critic/packages/gateway/src/waits.ts';
import { relayLimitMs } from './critic/packages/runner/src/workflow/acts.ts';
const w = modelWaits(PROFILES);
console.log(w.length, w.map((m) => `${m.provider}/${m.model}:${m.kind}`).join(' '));
