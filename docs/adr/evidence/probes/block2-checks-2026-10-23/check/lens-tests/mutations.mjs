const GW = 'packages/gateway/src/gateway.ts';
const FAL = 'packages/gateway/src/providers/fal.ts';
const gatewayTests = ['packages/gateway'];
export default [
  // --- the gateway's per-call waits
  { id: 'G1', file: GW, from: ": deadline?.expired && billingOf(e) !== 'none'", to: ': deadline?.expired', tests: gatewayTests },
  { id: 'G2', file: GW, from: "=\n              deadline?.expired && billingOf(e) !== 'none'", to: '=\n              deadline?.expired', tests: gatewayTests },
  { id: 'G5', file: GW, from: "    const waitMs = await this.waitMs(req, 'video', ref);\n    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));", to: "    const op = await this.admit(req, 'video', ref, maxVideoCost(price, seconds, extras));\n    const waitMs = await this.waitMs(req, 'video', ref);", tests: gatewayTests },
  { id: 'G5b', file: GW, from: "      const waitMs = await this.waitMs(req, 'image', ref);\n      first = await this.imageOnce(await this.admit(req, 'image', ref, estimate), req, prep, waitMs);", to: "      const admitted = await this.admit(req, 'image', ref, estimate);\n      const waitMs = await this.waitMs(req, 'image', ref);\n      first = await this.imageOnce(admitted, req, prep, waitMs);", tests: gatewayTests },
  { id: 'G6', file: GW, from: '          ...(caller.waitMs !== undefined ? { waitMs: caller.waitMs } : {}),\n', to: '', tests: gatewayTests },
  { id: 'G7', file: GW, from: 'wait > 0 && wait <= MAX_TIMER_MS)', to: 'wait > 0)', tests: gatewayTests },
  { id: 'G11', file: GW, from: '...(op.resumed ? { resume: op.resumed, ...acceptedTimes(op.resumedAt) } : {}),', to: '...(op.resumed ? { resume: op.resumed } : {}),', tests: gatewayTests },
  { id: 'G12', file: GW, from: "how: 'silence' }, { retryable: true, billing: 'maybe' })", to: "how: 'silence' }, { retryable: false, billing: 'maybe' })", tests: gatewayTests },
  // --- fal
  { id: 'F1', file: FAL, from: 'return seconds > 1 ? seconds : undefined;', to: 'return seconds > 0 ? seconds : undefined;', tests: gatewayTests },
  { id: 'F4', file: FAL, from: "      if (isNotStarted(e)) throw e;\n      if (stop?.aborted) return { stopped: done ? 'done' : 'running', requestId };", to: "      if (stop?.aborted) return { stopped: done ? 'done' : 'running', requestId };\n      if (isNotStarted(e)) throw e;", tests: gatewayTests },
  { id: 'F13', file: FAL, from: '{ deadline: () => ({ signal: frameBound.signal, reading: true }) }', to: '{ deadline: () => ({ signal: frameBound.signal }) }', tests: gatewayTests },
  { id: 'F16', file: FAL, from: "const billing = cancel.status === 'removed' ? 'none' : 'maybe';", to: "const billing = 'maybe' as const;", tests: gatewayTests },
  { id: 'F17', file: FAL, from: '                    clipEndsAt = acceptedAt + waitMs;', to: '                    clipEndsAt = Date.now() + waitMs;', tests: gatewayTests },
  // --- the spend book's acceptance times
  { id: 'S1', file: 'packages/store/src/spend-book.ts', from: 'return { resume: { opId: id, jobs, ...(Object.keys(acceptedAt).length > 0 ? { acceptedAt } : {}) } };', to: 'return { resume: { opId: id, jobs } };', tests: ['packages/store', 'packages/gateway'] },
  { id: 'S2', file: 'packages/store/src/spend-book.ts', from: ", :job), provider_jobs_at = json_set(COALESCE(provider_jobs_at, '{}'), :path, :at),", to: ', :job),', tests: ['packages/store', 'packages/gateway'] },
  { id: 'S3', file: 'packages/gateway/src/memory-book.ts', from: 'return { resume: { opId: r.id, jobs, ...(Object.keys(acceptedAt).length > 0 ? { acceptedAt } : {}) } };', to: 'return { resume: { opId: r.id, jobs } };', tests: ['packages/store', 'packages/gateway'] },
  // --- tiers
  { id: 'T1', file: 'packages/gateway/src/prices.ts', from: 'inputTokens > tier.aboveInputTokens', to: 'inputTokens >= tier.aboveInputTokens', tests: ['packages/gateway', 'packages/advisor'] },
  { id: 'T2', file: 'packages/gateway/src/prices.ts', from: 'cacheRead * (rates.cacheReadPerMTok ?? rates.inputPerMTok)', to: 'cacheRead * (rates.cacheReadPerMTok ?? price.cacheReadPerMTok ?? rates.inputPerMTok)', tests: ['packages/gateway', 'packages/advisor'] },
];
