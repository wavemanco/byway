import { readFileSync, writeFileSync } from 'node:fs';
const f = 'packages/gateway/src/gateway.ts';
const which = process.argv[2];
let s = readFileSync(f, 'utf8');
const muts = {
  image: [
    "      const waitMs = await this.waitMs(req, 'image', ref);\n      first = await this.imageOnce(await this.admit(req, 'image', ref, estimate), req, prep, waitMs);",
    "      const op = await this.admit(req, 'image', ref, estimate);\n      const waitMs = await this.waitMs(req, 'image', ref);\n      first = await this.imageOnce(op, req, prep, waitMs);",
  ],
  video: [
    "    const waitMs = await this.waitMs(req, 'video', ref);\n    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));",
    "    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));\n    const waitMs = await this.waitMs(req, 'video', ref);",
  ],
  imageRetry: [
    "      const waitMs = await this.waitMs(call, 'image', ref);\n      return (op) => this.imageOnce(op, call, prep, waitMs, first.entryId);",
    "      return async (op) => this.imageOnce(op, call, prep, await this.waitMs(call, 'image', ref), first.entryId);",
  ],
};
const [a, b] = muts[which];
if (!s.includes(a)) { console.error('pattern not found', which); process.exit(2); }
s = s.replace(a, b);
writeFileSync(f, s);
console.log('applied', which);
