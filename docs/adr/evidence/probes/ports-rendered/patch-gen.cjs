// Adapt the round-11 verifier's gen12.mts to this package: main is the exported main tree (00a8a4c), the branch is the
// fx-ports-rendered worktree, no round-10 tree. Every variant main refuses is checked by the branch too, to count any
// the branch admits (expected 0). Usage: node patch-gen.cjs <gen-pr.mts>
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); s = s.replace(a, b); };
s = `// ports-rendered (ADR-0097) differential: the round-11 final verifier's gen12.mts, copied, with main = the exported\n// main tree at 00a8a4c, branch = fx-ports-rendered, no round-10 tree, and the branch also run on every variant main\n// refuses (mainRefusedBranchAdmits, expected 0). Mutations unchanged.\n` + s;
rep("const M = 'file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r11/main-tree/packages/';", "const M = 'file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/main-tree/packages/';");
rep("const R10 = 'file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r11/r10-tree/packages/';\n", '');
rep("const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-semantics-2/packages/';", "const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-ports-rendered/packages/';");
rep("const [ra, rp, rc] = await Promise.all([import(R10 + 'advisor/src/index.ts'), import(R10 + 'prompts/src/index.ts'), import(R10 + 'catalog/src/index.ts')]);\nconst RP = rp.createPromptRenderer();\n", '');
rep("const stats: N = { tries: 0, unique: 0, mainAdmitted: 0, mainRefused: 0, mainThrew: 0, branchRefused: 0, branchThrew: 0, r10Refused: 0, r10Threw: 0, diffR10: 0, byMut: {} };",
    "const stats: N = { tries: 0, unique: 0, mainAdmitted: 0, mainRefused: 0, mainThrew: 0, branchRefused: 0, branchThrew: 0, mainRefusedBranchAdmits: 0, mainRefusedBranchThrew: 0, byMut: {} };\nconst branchAdmitsRefused: N[] = [];");
rep("  if (m.violations.length) {\n    stats.mainRefused++;",
    "  if (m.violations.length) {\n    stats.mainRefused++;\n    try {\n      const bb = ba.checkAnswer(fenced(r), BCONFIGS.find((x) => x.id === nearest.id), { prompts: BP, catalog: BCONFIGS }, `composed-${nearest.id}`);\n      if (!bb.violations.length) {\n        stats.mainRefusedBranchAdmits++;\n        branchAdmitsRefused.push({ nearest: nearest.id, muts: done, recipe: r, main: m.violations.map((x: N) => `${x.ruleId}:${x.clause ?? ''}`) });\n      }\n    } catch {\n      stats.mainRefusedBranchThrew++;\n    }");
const tailFrom = s.indexOf('  let q: N;');
const tailTo = s.indexOf("  out.push({ nearest: nearest.id");
if (tailFrom < 0 || tailTo < 0) throw new Error('tail');
s = s.slice(0, tailFrom) + "  out.push({ nearest: nearest.id, muts: done, recipe: r, branchOk: refusals.length === 0, keys: [...new Set(refusals.map((x: N) => `${x.ruleId}:${x.clause}`))].sort(), refusals });\n}\n" + s.slice(s.indexOf('stats.ms = Date.now() - t0;'));
rep("writeFileSync(outFile, JSON.stringify(out));", "writeFileSync(outFile, JSON.stringify(out));\nwriteFileSync(outFile.replace(/\.json$/, '-mainrefused-branchadmits.json'), JSON.stringify(branchAdmitsRefused));");
fs.writeFileSync(f, s);
console.log('patched');
