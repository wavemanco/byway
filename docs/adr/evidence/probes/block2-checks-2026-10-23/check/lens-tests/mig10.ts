import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../lens-tests/packages/store/src/migrations.ts';
const at = (n: number) => {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS.slice(0, n)) db.exec(m.sql);
  const cols = db.prepare("PRAGMA table_xinfo(paid_operations)").all().map((r: any) => `${r.name}|${r.type}|${r.notnull}|${r.dflt_value}|${r.pk}`);
  const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE tbl_name='paid_operations' AND type='index' ORDER BY name").all().map((r: any) => `${r.name}: ${r.sql}`);
  const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name='paid_operations'").get() as any).sql;
  return { cols, idx, sql };
};
const a = at(9), b = at(10);
console.log('cols only in v9:', a.cols.filter((c) => !b.cols.includes(c)));
console.log('cols only in v10:', b.cols.filter((c) => !a.cols.includes(c)));
console.log('idx only in v9:', a.idx.filter((c) => !b.idx.includes(c)));
console.log('idx only in v10:', b.idx.filter((c) => !a.idx.includes(c)));
const norm = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const la = norm(a.sql), lb = norm(b.sql);
console.log('v9 table lines not in v10:', la.filter((l) => !lb.includes(l)));
console.log('v10 table lines not in v9:', lb.filter((l) => !la.includes(l)));
