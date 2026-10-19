// ports-rendered (ADR-0097): the round-11 verifier's catalog-cmp.mts, copied, with main = the 00a8a4c tree and the branch =
// fx-ports-rendered; it also compares the exceptions each recipe uses and, for the protocol configurations, the composed
// presentation of the recipe itself (main's and the branch's explainers) and the critique sources.
// Every catalog recipe (CATALOG, all of them): main vs branch hash, validate() verdict and findings, and for the protocol
// configurations the composed admission of the recipe itself (checkAnswer, as a composed answer of itself); plus the
// branch's personCritique placements and unappliedCritiques.
const M = 'file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/main-tree/packages/';
const W = 'file:///C:/Users/arvik/code/byway/.worktrees/fx-ports-rendered/packages/';
const [mc, bc, mv, bv, br, ma, ba, mp, bp] = await Promise.all([import(M + 'catalog/src/index.ts'), import(W + 'catalog/src/index.ts'), import(M + 'validator/src/index.ts'), import(W + 'validator/src/index.ts'), import(W + 'recipe/src/index.ts'), import(M + 'advisor/src/index.ts'), import(W + 'advisor/src/index.ts'), import(M + 'prompts/src/index.ts'), import(W + 'prompts/src/index.ts')]);
const mr = await import(M + 'recipe/src/index.ts');
const fk = (f: any) => `${f.ruleId}|${f.clause ?? ''}|${f.path}|${f.message}`;
const fenced = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const MP = mp.createPromptRenderer();
const BP = bp.createPromptRenderer();
const mm = new Map((mc.CATALOG as any[]).map((r) => [r.id, r]));
let diffs = 0;
for (const b of bc.CATALOG as any[]) {
  const m = mm.get(b.id);
  const vb = bv.validate(b);
  const vm = m ? mv.validate(m) : undefined;
  const fb = [...vb.violations, ...vb.warnings].map(fk).sort();
  const fm = vm ? [...vm.violations, ...vm.warnings].map(fk).sort() : [];
  const asked = br.placements(b).filter((p: any) => br.personCritique(p.step)).map((p: any) => p.step.id);
  const un = br.unappliedCritiques(b).map((p: any) => p.step.id);
  let ca = '';
  if ((bc.PROTOCOL_CONFIGS as any[]).some((x) => x.id === b.id)) {
    const { hash: _h, ...raw } = b;
    const cm = ma.checkAnswer(fenced(raw), m, { prompts: MP, catalog: mc.PROTOCOL_CONFIGS }, `composed-${b.id}`);
    const cb = ba.checkAnswer(fenced(raw), b, { prompts: BP, catalog: bc.PROTOCOL_CONFIGS }, `composed-${b.id}`);
    ca = ` composed main=${cm.violations.length} branch=${cb.violations.length}`;
    if (cm.violations.length !== cb.violations.length) diffs++;
  }
  const exSame = JSON.stringify(vm?.exceptionsUsed) === JSON.stringify(vb.exceptionsUsed);
  let presSame = true;
  if ((bc.PROTOCOL_CONFIGS as any[]).some((x) => x.id === b.id)) {
    const copy = { name: 'x', promise: 'x', bestFor: [], code: 'x' };
    presSame = JSON.stringify(ma.presentComposed(m, copy)) === JSON.stringify(ba.presentComposed(b, copy));
    const src = (rr: any, r: any) => JSON.stringify([...rr.critiqueSources(r)].map(([w, s]: any) => [w.id, s.id]).sort());
    presSame = presSame && src(br, b) === src(mr, m);
  }
  const same = m && m.hash === b.hash && vm.ok === vb.ok && JSON.stringify(fb) === JSON.stringify(fm) && exSame && presSame;
  if (!same) diffs++;
  console.log(`${same ? 'same' : 'DIFF'} ${b.id} hash ${m?.hash === b.hash ? '=' : 'CHANGED'} ok main=${vm?.ok} branch=${vb.ok} findings main=${fm.length} branch=${fb.length}${ca} asked=[${asked}] unapplied=[${un}] exceptions ${exSame ? '=' : 'CHANGED'} ${JSON.stringify(vb.exceptionsUsed)} presentation ${presSame ? '=' : 'CHANGED'}`);
  if (!same) {
    for (const f of fb) if (!fm.includes(f)) console.log('   +', f.slice(0, 200));
    for (const f of fm) if (!fb.includes(f)) console.log('   -', f.slice(0, 200));
  }
}
console.log('catalog', (bc.CATALOG as any[]).length, 'main', (mc.CATALOG as any[]).length, 'diffs', diffs);
