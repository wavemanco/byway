const GW = 'packages/gateway/src/gateway.ts';
const t = ['packages/gateway/test/zz-lens-probe.test.ts'];
export default [
  { id: 'G5', file: GW, from: "    const waitMs = await this.waitMs(req, 'video', ref);\n    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));", to: "    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));\n    const waitMs = await this.waitMs(req, 'video', ref);", tests: t },
  { id: 'G5b', file: GW, from: "      const waitMs = await this.waitMs(req, 'image', ref);\n      first = await this.imageOnce(await this.admit(req, 'image', ref, estimate), req, prep, waitMs);", to: "      const admitted = await this.admit(req, 'image', ref, estimate);\n      const waitMs = await this.waitMs(req, 'image', ref);\n      first = await this.imageOnce(admitted, req, prep, waitMs);", tests: t },
];
