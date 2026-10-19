// Attach main's composed presentation (00a8a4c tree) to each variant, for the claims oracle's PRES=main control.
// Usage: tsx --import trees-register.mjs mainpres.mts <in.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const M = 'file:///C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/main-tree/packages/';
const ma = await import(M + 'advisor/src/index.ts');
const [inp, out] = process.argv.slice(2);
const vs = JSON.parse(readFileSync(inp!, 'utf8'));
for (const v of vs) {
  // As the claims oracle presents it: the variant's recipe as written.
  v.mainPres = ma.presentComposed(v.recipe, { name: 'x', promise: 'x', bestFor: [], code: 'x' });
}
writeFileSync(out!, JSON.stringify(vs));
console.log(vs.length);
