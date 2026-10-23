// node mut.mjs <file> <old-file> <new-file> <vitest filter args...>: replaces the one occurrence of old with new,
// runs vitest, restores the file byte for byte, and prints whether the tests failed (the mutation was caught).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [file, oldF, newF, ...args] = process.argv.slice(2);
const before = readFileSync(file, 'utf8');
const old = readFileSync(oldF, 'utf8'), neu = readFileSync(newF, 'utf8');
const n = before.split(old).length - 1;
if (n !== 1) { console.log(`MUTATION NOT APPLIED: ${n} matches`); process.exit(2); }
writeFileSync(file, before.replace(old, () => neu));
try {
  const r = spawnSync('npx', ['vitest', 'run', ...args], { cwd: 'C:/Users/arvik/code/byway/.worktrees/fx-b2f-prices', encoding: 'utf8', shell: true });
  const out = (r.stdout + r.stderr);
  const failed = out.split('\n').filter((l) => /×|FAIL|Tests /.test(l)).slice(0, 12).join('\n');
  console.log(r.status === 0 ? 'SURVIVED (tests passed)' : 'CAUGHT (tests failed)');
  console.log(failed);
} finally {
  writeFileSync(file, before);
  console.log(readFileSync(file, 'utf8') === before ? 'restored' : 'RESTORE FAILED');
}
