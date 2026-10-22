// Block 1 fix round, fx-f3: applies one mutation at a time to apps/web, runs the unit tests that guard it, records
// pass/fail, and restores the file byte for byte. Usage: node mutate-unit.mjs <worktree>
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.argv[2];
const web = join(root, 'apps', 'web');
const T = (...names) => names.map((n) => `test/${n}.test.ts`);

const M = [
  ['baseline', null, null, null, T('run-screen', 'questions', 'api', 'rundata', 'runs', 'start-draft', 'http')],
  ['RS-4: the Failed panel without the cut-off note', 'src/components/run/RunStatusPanel.tsx', "        {/* A failure ends the run, and its other calls byway can stop are cut off as on Cancel (ADR-0111). */}\n        <p className=\"muted\">{CUT_OFF_NOTE}</p>\n", '', T('run-screen')],
  ['RS-6: the note back to its old words', 'src/view/labels.ts', "  'If byway cut off an AI call that may have been billed, Settings lists it under Spending records; it counts at its estimate against the workspace budget, not this run’s, until you clear it.'", "  'If byway cut off an AI call, Settings lists it under Spending records until you clear it.'", T('run-screen')],
  ['RS-5: an ended run is never polled', 'src/view/run.ts', '  if (isEnded(status)) return callsUnderWay > 0 ? 3000 : null;', '  if (isEnded(status)) return null;', T('run-screen')],
  ['RS-5: every call under way in the workspace counted as the run’s', 'src/server/run-data.ts', '    const callsUnderWay = inFlight.filter((c) => c.runId === run.id).length;', '    const callsUnderWay = inFlight.length;', T('api')],
  ['RS-5: the settled cost not read', 'src/server/run-data.ts', '    const settledUsd = (await services.gateway.spend(run.workspaceId)).byRun[run.id] ?? 0;', '    const settledUsd = 0;', T('api')],
  ['RS-5: the book read for a run still going', 'src/server/run-data.ts', '  const ended = isEnded(view.run.status) ? await endedSpend(services, view.run) : undefined;', '  const ended = await endedSpend(services, view.run);', T('api')],
  ['RS-5: an unreadable book fails the poll', 'src/server/run-data.ts', '  } catch {\n    return undefined;\n  }', '  } finally {\n    void 0;\n  }', T('api')],
  ['RS-5: an older answer about calls under way carried forward', 'src/view/rundata.ts', '    ...(next.ended ? { ended: next.ended } : {}),', '    ...(next.ended ?? prev.ended ? { ended: next.ended ?? prev.ended } : {}),', T('rundata')],
  ['RS-5: the meter leaves out the settled cost', 'src/view/meter.ts', '    costUsd: Math.max(run.costUsd, d.totalUsd ?? 0, settledUsd),', '    costUsd: Math.max(run.costUsd, d.totalUsd ?? 0),', T('runs')],
  ['RS-5: the panels never say calls are under way', 'src/view/labels.ts', '  if (calls <= 0) return null;', '  if (calls >= 0) return null;', T('run-screen')],
  ['RS-5: the Failed panel without the under-way line', 'src/components/run/RunStatusPanel.tsx', "        <p className=\"muted\">{CUT_OFF_NOTE}</p>\n        {underWay ? <p className=\"muted\">{underWay}</p> : null}\n        <Link className=\"button\" href=\"/library\">", "        <p className=\"muted\">{CUT_OFF_NOTE}</p>\n        <Link className=\"button\" href=\"/library\">", T('run-screen')],
  ['a11y: the answers not described by the cost', 'src/components/run/panels/ConfirmPanel.tsx', ' unavailable={busy} aria-describedby={costId}>\n            Yes', ' unavailable={busy}>\n            Yes', T('questions')],
  ['a11y: the cost id passed with no cost', 'src/components/run/YourTurn.tsx', '{...(cost ? { costId } : {})}', '{...{ costId }}', T('questions')],
  ['a11y: the cost paragraph without its id', 'src/components/run/YourTurn.tsx', '            <p id={costId} className="turn-cost">', '            <p className="turn-cost">', T('questions')],
  ['SEC-NOTE-2: an edited attachment counts as checked', 'src/components/startDraft.ts', '    if (is && (!was || was.name !== is.name || was.text !== is.text)) next.add(key);', '    if (is && !was) next.add(key);', T('start-draft')],
  ['SEC-NOTE-2: one not sent counts as checked', 'src/components/startDraft.ts', '    if (is && (!was || was.name !== is.name || was.text !== is.text)) next.add(key);', '    if (is && was && (was.name !== is.name || was.text !== is.text)) next.add(key);', T('start-draft')],
  ['SEC-NOTE-2: what was held before is kept again on any check', 'src/components/startDraft.ts', '  for (const key of before) {', '  for (const key of [] as number[]) {', T('start-draft')],
  ['stale number: the place as sent, not on the form now', 'src/view/refusals.ts', '  const places = refusal.sent.map((s) => formKeys.indexOf(s.key) + 1);', '  const places = refusal.sent.map((s, i) => (formKeys.includes(s.key) ? i + 1 : 0));', T('http')],
  ['stale number: a removed attachment still named', 'src/view/refusals.ts', '    const items = p.items.filter((i) => places[i.index] !== 0);', '    const items = p.items;', T('http')],
];

const out = [];
for (const [id, file, from, to, tests] of M) {
  const path = file ? join(web, file) : null;
  let orig = null;
  if (path) {
    orig = readFileSync(path);
    const s = orig.toString('utf8');
    const n = s.split(from).length - 1;
    if (n !== 1) {
      out.push(`${id}: target found ${n} times, skipped`);
      console.log(out.at(-1));
      continue;
    }
    writeFileSync(path, s.replace(from, () => to));
  }
  try {
    const r = spawnSync(`pnpm exec vitest run ${tests.join(' ')}`, { cwd: web, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const text = (r.stdout ?? '') + (r.stderr ?? '');
    const files = /Test Files\s+([^\n]+)/.exec(text)?.[1]?.trim();
    const counts = /\n\s+Tests\s+([^\n]+)/.exec(text)?.[1]?.trim();
    const failed = [...text.matchAll(/FAIL\s+(test\/\S+ > .+)$/gm)].map((m) => m[1].trim()).slice(0, 4);
    out.push(`${id}: exit ${r.status}; files ${files}; tests ${counts}${failed.length ? '\n    ' + failed.join('\n    ') : ''}`);
  } finally {
    if (path) writeFileSync(path, orig);
  }
  console.log(out.at(-1));
}
const st = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
console.log('git status after (only the uncommitted work of this round should show):\n' + st.stdout);
