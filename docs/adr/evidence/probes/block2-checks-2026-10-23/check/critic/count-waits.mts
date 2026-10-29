import { modelWaits } from '../lens-records/packages/gateway/src/waits.ts';
import * as p from '../lens-records/packages/gateway/src/profiles.ts';
const profiles = (p as any).PROFILES ?? Object.values(p).find((v: any) => Array.isArray(v));
const list = modelWaits(Array.isArray(profiles) ? profiles : Object.values(profiles));
console.log(list.length);
for (const m of list) console.log(m.provider, m.model, m.kind);
