// Block 1 fix round, fx-f3: the browser specs' mutation proofs (CC-1, and this round's own spec changes). Each entry
// applies its edits to the committed worktree, runs only the named spec (and test, by -g) with `playwright test` from
// apps/web, which builds the app into .next-e2e and starts its own demo on the ports below, then restores every file
// byte for byte and checks the worktree is clean before the next. One run at a time; nothing else runs meanwhile.
// Usage: node mutate-e2e.mjs <worktree> <out-dir> [ids...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const [root, outDir, ...only] = process.argv.slice(2);
const web = join(root, 'apps', 'web');
mkdirSync(outDir, { recursive: true });

const SANDBOX = 'src/components/SandboxBanner.tsx';
const START = 'src/components/StartForm.tsx';
const C4 = ['e2e/configurations.spec.ts', '-g', 'C4: an optional step you decline'];
const PK_ONE = ['e2e/pasted-key.spec.ts', '-g', 'a refused key in one attachment'];
const PK_FIXED = ['e2e/pasted-key.spec.ts', '-g', 'a refused key in an attachment leaves the text kept'];
const PK_BOTH = ['e2e/pasted-key.spec.ts', '-g', 'a refused key in (an attachment leaves|one attachment)'];
const RS = (g) => ['e2e/renderer-sandbox.spec.ts', ...(g ? ['-g', g] : [])];
const KB = ['e2e/keyboard.spec.ts', '-g', 'Start: each attachment added by keyboard'];
const REC = ['e2e/recovery.spec.ts', '--project=recovery', '--no-deps', '-g', 'F14: after a refused recommendation'];

/** [id, expect 'pass'|'fail', spec args, edits: [file, from, to][] or { revert: commit, paths }] */
const RUNS = [
  ['base-C4', 'pass', C4, []],
  ['base-pasted-key', 'pass', ['e2e/pasted-key.spec.ts'], []],
  ['base-renderer-sandbox', 'pass', RS(), []],
  ['base-keyboard', 'pass', KB, []],
  ['base-recovery', 'pass', REC, []],
  // This round's own changes.
  ['E1 RunScreen passes no cost to YourTurn', 'fail', C4, [['src/components/run/RunScreen.tsx', '                cost={cost}\n', '                cost={null}\n']]],
  ['E3/W7 an edit to a held attachment keeps it again (the old rule)', 'fail', PK_BOTH, [[START, '    setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));\n  }', '    setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));\n    setWithheld((keys) => new Set([...keys].filter((k) => k !== key)));\n  }']]],
  ['E4 an accepted request keeps nothing held again', 'fail', PK_FIXED, [[START, '      setWithheld((keys) => withheldAfterCheck(keys, sent, [], current.current));\n', '']]],
  ['E5/W8 the refusal numbers the attachment by its place in the request', 'fail', PK_ONE, [['src/view/refusals.ts', '  const places = refusal.sent.map((s) => formKeys.indexOf(s.key) + 1);', '  const places = refusal.sent.map((s, i) => (formKeys.includes(s.key) ? i + 1 : 0));']]],
  ['E6 the refusal fixed at its numbers when it came (stale after a removal)', 'fail', PK_ONE, [['src/view/refusals.ts', '  const places = refusal.sent.map((s) => formKeys.indexOf(s.key) + 1);', '  const places = refusal.sent.map((s) => (formKeys.includes(s.key) ? s.key : 0));']]],
  // Batch B's specs (CC-1).
  ['W1 banner: no RENDERER_CHANGED listener', 'fail', RS('the tab whose Settings switch'), [[SANDBOX, '    window.addEventListener(RENDERER_CHANGED, now);\n', '    void now;\n']]],
  ['W1-control: no listener and the spec polls on (the poll alone brings the banner)', 'pass', RS('the tab whose Settings switch'), [[SANDBOX, '    window.addEventListener(RENDERER_CHANGED, now);\n', '    void now;\n'], ['e2e/renderer-sandbox.spec.ts', "with its polls off', async ({ page }) => {\n  await withoutPolls(page);\n", "with its polls off', async ({ page }) => {\n"]]],
  ['W2 banner: the status is never written on a read', 'fail', RS('a tab (open before|with its polls off)'), [[SANDBOX, '      if (said !== null) setNews(said);', '      void said;']]],
  ['W3 banner: its own switch not taken as known', 'fail', RS(), [[SANDBOX, '      if (saved) setNews(announcer.switched(saved));', '      void saved;']]],
  ['W4 settings: the switch sends no saved settings', 'fail', RS(), [['src/components/PageRendererSettings.tsx', '      rendererChanged(saved);', '      rendererChanged(undefined as never);']]],
  ['W5 banner: re-read keyed on a constant, not the pathname', 'fail', RS('a tab with its polls off'), [[SANDBOX, "    pathname,\n    (signal) => get<RendererSettings>('/api/renderer', signal),", "    'banner',\n    (signal) => get<RendererSettings>('/api/renderer', signal),"]]],
  ['U1 view: bannerAnnouncer.read always null', 'fail', RS('a tab (open before|with its polls off)'), [['src/view/renderer.ts', '      return news;', '      return news && null;']]],
  ['W6 start: the save keeps the held attachment', 'fail', PK_ONE, [[START, 'attachments.filter((a) => !withheld.has(a.key)).map(', 'attachments.map(']]],
  ['W9 start: the refusal holds nothing back', 'fail', PK_ONE, [[START, '        setWithheld((keys) => withheldAfterCheck(keys, sent, named, current.current));', '        void named;']]],
  ['U3 start: no note at the five-attachment limit', 'fail', KB, [[START, '  if (count >= MAX_ATTACHMENTS) return <span className="muted small">{ATTACH_LIMIT_NOTE}</span>;', '  if (count >= MAX_ATTACHMENTS) return null;']]],
  ['R1 recommendation: the render makes the first recommendation again (524e057 reverted)', 'fail', REC, { revert: '524e057', paths: ['apps/web/app', 'apps/web/src'] }],
];

const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const env = { ...process.env, BYWAY_E2E_PORT: '3473', BYWAY_E2E_TEMPORAL_PORT: '7473' };
delete env.BYWAY_E2E_BASE_URL;
delete env.BYWAY_E2E_DATA_DIR;

const results = [];
for (const [id, expected, args, edits] of RUNS) {
  if (only.length > 0 && !only.some((o) => id.startsWith(o))) continue;
  if (git('status', '--porcelain').stdout.trim() !== '') throw new Error(`worktree not clean before ${id}`);
  const saved = [];
  let skipped = null;
  try {
    if (Array.isArray(edits)) {
      for (const [file, from, to] of edits) {
        const path = join(web, file);
        const orig = readFileSync(path);
        const s = orig.toString('utf8');
        const n = s.split(from).length - 1;
        if (n !== 1) {
          skipped = `${file}: target found ${n} times`;
          break;
        }
        saved.push([path, orig]);
        writeFileSync(path, s.replace(from, () => to));
      }
    } else {
      const diff = spawnSync('git', ['-C', root, 'show', edits.revert, '--', ...edits.paths], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;
      const applied = spawnSync('git', ['-C', root, 'apply', '-R'], { input: diff, encoding: 'utf8' });
      if (applied.status !== 0) skipped = `revert did not apply: ${applied.stderr}`;
    }
    if (skipped) {
      results.push(`${id}: SKIPPED (${skipped})`);
      console.log(results.at(-1));
      continue;
    }
    const quoted = args.map((a) => (/[\s|()]/.test(a) ? `"${a}"` : a)).join(' ');
    const started = Date.now();
    const r = spawnSync(`pnpm exec playwright test ${quoted} --reporter=list`, { cwd: web, shell: true, encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 });
    const text = (r.stdout ?? '') + (r.stderr ?? '');
    const file = join(outDir, `${id.split(' ')[0].replace(/[^\w-]/g, '_')}.log`);
    writeFileSync(file, text);
    const passed = /(\d+) passed/.exec(text)?.[1] ?? '0';
    const failed = /(\d+) failed/.exec(text)?.[1] ?? '0';
    const got = r.status === 0 ? 'pass' : 'fail';
    // Which test failed, and at which line of the spec.
    const where = [...text.matchAll(/^\s+\d+\) \[[^\]]+\] › (.+)$/gm)].map((m) => m[1].trim());
    const at = [...text.matchAll(/^\s+at (?:.*?)(e2e[\\/][\w.-]+\.ts:\d+:\d+)/gm)].map((m) => m[1]);
    const errors = [...text.matchAll(/^\s+Error: (.+)$/gm)].map((m) => m[1].trim()).slice(0, 3);
    results.push(
      `${id}: expected ${expected}, got ${got} (exit ${r.status}; ${passed} passed, ${failed} failed; ${Math.round((Date.now() - started) / 1000)} s)${got === expected ? '' : '  <-- UNEXPECTED'}` +
        (where.length ? `\n    failed: ${[...new Set(where)].join(' | ')}` : '') +
        (at.length ? `\n    at: ${[...new Set(at)].slice(0, 4).join(', ')}` : '') +
        (errors.length ? `\n    error: ${errors.join(' / ')}` : '') +
        `\n    log: ${file}`,
    );
    console.log(results.at(-1));
  } finally {
    for (const [path, orig] of saved) writeFileSync(path, orig);
    if (!Array.isArray(edits)) spawnSync('git', ['-C', root, 'checkout', '--', ...edits.paths], { encoding: 'utf8' });
    const left = git('status', '--porcelain').stdout.trim();
    if (left !== '') console.log(`  after ${id}, the worktree still shows: ${left}`);
  }
}
writeFileSync(join(outDir, 'summary.txt'), results.join('\n') + '\n');
console.log('done');
