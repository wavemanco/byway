// Read-only probe: for every ADR that has ever read "Accepted", compare its Context and Decision sections at HEAD
// with the text at the first commit where its Status row read Accepted (CR14 against git history).
// Usage: node cr14-probe.mjs <repo>
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const t0 = Date.now();

const norm = (s) => s.replace(/\r\n/g, '\n');
function sectionOf(text, name) {
  const lines = norm(text).split('\n');
  const i = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && !/^## /.test(lines[j])) j++;
  return lines.slice(i + 1, j).join('\n').trim();
}
const statusOf = (text) => /\|\s*\*\*Status\*\*\s*\|\s*([^|]*)\|/.exec(norm(text))?.[1]?.trim() ?? '';

const files = readdirSync(join(repo, 'docs/adr')).filter((f) => /^\d{4}-.*\.md$/.test(f));
const results = [];
for (const f of files) {
  const path = `docs/adr/${f}`;
  const head = git('show', `HEAD:${path}`);
  // Oldest first, following renames.
  const commits = git('log', '--follow', '--format=%H', '--reverse', '--', path).trim().split('\n').filter(Boolean);
  let first = null;
  let firstPath = path;
  for (const c of commits) {
    // Find the path at that commit (rename-aware) by listing names.
    let text;
    try {
      text = git('show', `${c}:${path}`);
    } catch {
      const names = git('show', '--name-only', '--format=', c).split('\n').filter((n) => n.startsWith('docs/adr/') && n.includes(f.slice(0, 4)));
      if (!names.length) continue;
      try { text = git('show', `${c}:${names[0]}`); firstPath = names[0]; } catch { continue; }
    }
    if (/^Accepted/.test(statusOf(text))) { first = { c, text }; break; }
  }
  if (!first) { results.push({ f, status: statusOf(head), everAccepted: false }); continue; }
  const changed = [];
  for (const s of ['Context', 'Decision']) {
    const a = sectionOf(first.text, s);
    const b = sectionOf(head, s);
    if (a !== b) changed.push(s);
  }
  results.push({ f, status: statusOf(head), everAccepted: true, firstAccepted: first.c.slice(0, 7), changed });
}
const ever = results.filter((r) => r.everAccepted);
const bad = ever.filter((r) => r.changed.length);
console.log(`ADR files: ${files.length}; ever Accepted: ${ever.length}; Context/Decision changed since first Accepted: ${bad.length}`);
for (const r of bad) console.log(`  ${r.f} (first Accepted ${r.firstAccepted}): ${r.changed.join(', ')}`);
console.log(`Not ever Accepted: ${results.filter((r) => !r.everAccepted).map((r) => r.f.slice(0, 4) + ' ' + r.status).join('; ')}`);
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s`);
