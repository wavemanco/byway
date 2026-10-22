// Merge the fresh corpora (every variant main admits, with the branch's verdict), dedupe across files, index them, and
// write: all, refused (by the branch), admitted (by the branch), and the variants refused by COMPOSED-PROMPT alone.
// Every branch refusal is new (main admits every variant here): `added` holds them as rule:clause@path, as the oracle's
// classifier reads them. Usage: node merge-pr.cjs <outPrefix> <in.json>...
const fs = require('fs');
const [prefix, ...inputs] = process.argv.slice(2);
const ANSWER = /critique-unapplied|critique-per-candidate|human-critique/;
const seen = new Set();
const all = [];
const stats = { read: 0, unique: 0, refused: 0, admitted: 0, refusedByAnswerClause: 0, refusedByPromptOnly: 0, refusedByPromptAndAnswer: 0, refusedOther: 0, keys: {}, answerRefusals: 0, answerRefusalsByClause: {}, promptByPort: {}, promptByRolePort: {}, byNearest: {}, refusedByNearest: {}, mainRefusedBranchAdmits: 0 };
for (const f of inputs) {
  for (const v of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    stats.read++;
    const k = `${v.nearest}|${JSON.stringify(v.recipe)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    stats.unique++;
    stats.byNearest[v.nearest] = (stats.byNearest[v.nearest] ?? 0) + 1;
    const keys = [...new Set(v.refusals.map((x) => `${x.ruleId}:${x.clause}`))].sort();
    const answer = v.refusals.filter((x) => ANSWER.test(x.clause));
    const prompt = v.refusals.filter((x) => x.ruleId === 'COMPOSED-PROMPT');
    const other = v.refusals.filter((x) => !ANSWER.test(x.clause) && x.ruleId !== 'COMPOSED-PROMPT');
    if (v.refusals.length) {
      stats.refused++;
      stats.refusedByNearest[v.nearest] = (stats.refusedByNearest[v.nearest] ?? 0) + 1;
    } else stats.admitted++;
    if (answer.length) stats.refusedByAnswerClause++;
    if (prompt.length && !answer.length && !other.length) stats.refusedByPromptOnly++;
    if (prompt.length && answer.length) stats.refusedByPromptAndAnswer++;
    if (other.length) stats.refusedOther++;
    for (const k2 of keys) stats.keys[k2] = (stats.keys[k2] ?? 0) + 1;
    for (const a of new Map(answer.map((x) => [`${x.stepId}`, x])).values()) {
      stats.answerRefusals++;
      stats.answerRefusalsByClause[`${a.ruleId}:${a.clause}`] = (stats.answerRefusalsByClause[`${a.ruleId}:${a.clause}`] ?? 0) + 1;
    }
    for (const p of prompt) {
      const m = /takes in the (\S+) port, but its prompt "([^"]+)"/.exec(p.message);
      if (!m) continue;
      stats.promptByPort[m[1]] = (stats.promptByPort[m[1]] ?? 0) + 1;
      const role = (() => {
        let found;
        const visit = (n) => {
          if (!n || found) return;
          if (n.op === 'step' && n.id === p.stepId) found = n.role;
          (n.steps ?? []).forEach(visit);
          if (n.body) visit(n.body);
          if (n.judge) visit(n.judge);
          (n.branches ?? []).forEach((b) => visit(b.body));
          (n.lenses ?? []).forEach((l) => visit(l.body));
        };
        v.recipe.stages.forEach((s) => visit(s.body));
        return found;
      })();
      const rk = `${role} ${m[1]}`;
      stats.promptByRolePort[rk] = (stats.promptByRolePort[rk] ?? 0) + 1;
    }
    all.push({ idx: all.length, nearest: v.nearest, muts: v.muts, recipe: v.recipe, branchOk: !v.refusals.length, keys, refusals: v.refusals, added: v.refusals.map((x) => `${x.ruleId}:${x.clause}@${x.path}`), answerRefused: answer.length > 0, promptOnly: prompt.length > 0 && !answer.length && !other.length });
  }
  const side = f.replace(/\.json$/, '-mainrefused-branchadmits.json');
  if (fs.existsSync(side)) stats.mainRefusedBranchAdmits += JSON.parse(fs.readFileSync(side, 'utf8')).length;
}
fs.writeFileSync(`${prefix}-all.json`, JSON.stringify(all));
fs.writeFileSync(`${prefix}-refused.json`, JSON.stringify(all.filter((v) => !v.branchOk)));
fs.writeFileSync(`${prefix}-admitted.json`, JSON.stringify(all.filter((v) => v.branchOk)));
fs.writeFileSync(`${prefix}-promptonly.json`, JSON.stringify(all.filter((v) => v.promptOnly)));
console.log(JSON.stringify(stats, null, 1));
