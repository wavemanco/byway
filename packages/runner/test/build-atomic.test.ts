/**
 * The workflow bundle is replaced whole, never written in place (follow-up (a) to F03's stage 3): two byway starts from
 * one checkout build dist/workflows.js at the same time, and a worker that read the file while the other start was
 * writing it got half a bundle. Here a write that stops halfway (a full disk, a process killed mid-write, or the moment a
 * concurrent reader looks) must leave the bundle that was there before, complete, and no stray file beside it.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const tear = { on: false };

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    writeFileSync: (file: Parameters<typeof real.writeFileSync>[0], data: Parameters<typeof real.writeFileSync>[1], ...rest: unknown[]) => {
      if (tear.on && typeof data === 'string') {
        // Half the bytes reach the disk, then the write fails.
        real.writeFileSync(file, data.slice(0, Math.floor(data.length / 2)));
        throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
      }
      return real.writeFileSync(file, data, ...(rest as []));
    },
  };
});

const { buildWorkflows, workflowBundleHash } = await import('../src/build.ts');

const dir = mkdtempSync(path.join(tmpdir(), 'byway-bundle-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the workflow bundle on disk', () => {
  it('is replaced whole: a build whose write stops halfway leaves the previous bundle complete, and nothing beside it', async () => {
    const outfile = path.join(dir, 'workflows.js');
    await buildWorkflows({ outfile });
    const before = readFileSync(outfile, 'utf8');
    expect(workflowBundleHash(outfile)).toMatch(/^[0-9a-f]{64}$/);

    tear.on = true;
    try {
      await expect(buildWorkflows({ outfile })).rejects.toThrow(/ENOSPC/);
    } finally {
      tear.on = false;
    }
    expect(readFileSync(outfile, 'utf8')).toBe(before);
    expect(readdirSync(dir)).toEqual(['workflows.js']);
  }, 60_000);

  it('builds over an existing bundle', async () => {
    const outfile = path.join(dir, 'again.js');
    await buildWorkflows({ outfile });
    await buildWorkflows({ outfile });
    expect(workflowBundleHash(outfile)).toMatch(/^[0-9a-f]{64}$/);
    expect(readdirSync(dir).filter((f) => f.startsWith('again'))).toEqual(['again.js']);
  }, 60_000);
});
