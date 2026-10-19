// Sum claims-oracle reports: runs, claims made, and problem counts by kind.
const fs = require('fs');
const files = process.argv.slice(2);
const out = { files: files.length, variants: 0, runs: 0, claimed: {}, problems: {}, examples: {} };
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  out.variants += r.stats.variants;
  out.runs += r.stats.runs;
  for (const [k, c] of Object.entries(r.stats.claimed)) out.claimed[k] = (out.claimed[k] ?? 0) + c;
  for (const [k, p] of Object.entries(r.problems)) {
    out.problems[k] = (out.problems[k] ?? 0) + p.count;
    if (!out.examples[k]) out.examples[k] = p.examples.slice(0, 2);
  }
}
console.log(JSON.stringify(out, null, 1));
