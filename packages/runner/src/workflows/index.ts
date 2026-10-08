import { proxyActivities, defineUpdate, setHandler, condition } from '@temporalio/workflow';
import { RESOLVE_UPDATE } from '@byway/contracts';
import { checkResolution } from '@byway/store/resolution';

const acts = proxyActivities<{ hello(name: string): Promise<string> }>({ startToCloseTimeout: '10s' });
const resolve = defineUpdate<void, [{ checkpointId: string; text?: string }]>(RESOLVE_UPDATE);

export async function spike(name: string): Promise<string> {
  let answer: string | undefined;
  setHandler(resolve, (r) => { answer = r.text; }, { validator: (r) => { const c = checkResolution({ id: 'cp', kind: 'react' }, r); if (!c.ok) throw new Error(c.problem); } });
  const hi = await acts.hello(name);
  await condition(() => answer !== undefined);
  return `${hi} ${answer} ${Math.random() < 2}`;
}
