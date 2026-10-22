// Read-only: was every recorded push to origin/main a fast-forward?
import { execFileSync } from 'node:child_process';
const repo = process.argv[2];
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
const hashes = git('reflog', 'show', '--format=%H', 'refs/remotes/origin/main').trim().split('\n').reverse();
let nonFF = 0;
for (let i = 1; i < hashes.length; i++) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', hashes[i - 1], hashes[i]], { cwd: repo });
  } catch {
    nonFF++;
    console.log(`non-fast-forward: ${hashes[i - 1].slice(0, 7)} -> ${hashes[i].slice(0, 7)}`);
  }
}
console.log(`pushes recorded: ${hashes.length}; non-fast-forward: ${nonFF}`);
