/**
 * The weekly run's advisories report (scripts/advisories.ts; backlog X-VAL-4 (a)): pnpm audit's high and critical
 * advisories, the repository advisories of undici and next against their pins, and Node's security releases after
 * .node-version, read from answers shaped as pnpm's, GitHub's and nodejs.org's are, never from the network. Its step in
 * verify.yml is in ci.test.ts.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditReport, fixedIn, inRange, nodeReport, NODE_RELEASES, patchedVersions, repoAdvisories, repoReport, report, WATCHED, type AdvisoryOptions, type RepoAdvisory } from '../advisories.ts';

const v = (s: string) => s.split('.').map(Number) as [number, number, number];
const advisory = (range: string, patched: string, name = 'undici'): RepoAdvisory => ({ ghsa_id: 'GHSA-test', severity: 'high', summary: 'A test advisory', html_url: 'https://example.test/a', vulnerabilities: [{ package: { name }, vulnerable_version_range: range, patched_versions: patched }] });

describe('reading advisory ranges as maintainers write them', () => {
  it('reads comparators joined by commas or spaces, alternatives by ";" or "||", "=<", a leading bare lower bound and a bare version alone', () => {
    expect(inRange(v('7.29.0'), '>= 7.0.0, < 7.30.1')).toBe(true);
    expect(inRange(v('7.30.1'), '>= 7.0.0, < 7.30.1')).toBe(false);
    expect(inRange(v('8.11.1'), '>= 8.11.0 < 8.11.2')).toBe(true);
    expect(inRange(v('7.28.5'), '< 6.28.1; 7.0.0 < 7.29.1; 8.0.0 < 8.10.2')).toBe(true);
    expect(inRange(v('7.29.1'), '< 6.28.1; 7.0.0 < 7.29.1; 8.0.0 < 8.10.2')).toBe(false);
    expect(inRange(v('5.8.1'), '=< 5.8.1')).toBe(true);
    expect(inRange(v('6.10.0'), '< 5.28.3 || > 6.0.0 < 6.11.0')).toBe(true);
    expect(inRange(v('16.3.0'), '16.3.0')).toBe(true);
    expect(inRange(v('16.4.1'), '16.3.0')).toBe(false);
    expect(inRange(v('16.4.1'), '>= 16.0 < 16.3.?')).toBe(false);
    expect(inRange(v('16.4.1'), 'every version')).toBeUndefined();
  });

  it('counts a version fixed by its own minor line, by earlier lines of its major with none later, or by every fix before it', () => {
    expect(patchedVersions('6.28.1; 7.29.1, >= v8.10.2: 16.3.?')).toEqual([v('6.28.1'), v('7.29.1'), v('8.10.2'), v('16.3.0')]);
    expect(fixedIn(v('7.30.1'), patchedVersions('6.29.1; 7.30.1; 8.12.2'))).toBe(true);
    expect(fixedIn(v('7.30.0'), patchedVersions('6.29.1; 7.30.1; 8.12.2'))).toBe(false);
    // next's ">= 16.0.0", fixed in "16.3.?", and an old advisory fixed only in 13.5.7.
    expect(fixedIn(v('16.4.1'), patchedVersions('16.3.?'))).toBe(true);
    expect(fixedIn(v('16.4.1'), patchedVersions('13.5.7'))).toBe(true);
    // Backports: fixed in 16.2.11 and 16.4.2, so 16.4.1 is not; fixed in 16.2.11 and 16.5.0, so neither is 16.4.1.
    expect(fixedIn(v('16.4.1'), patchedVersions('16.2.11, 16.4.2'))).toBe(false);
    expect(fixedIn(v('16.4.1'), patchedVersions('16.2.11, 16.5.0'))).toBe(false);
    expect(fixedIn(v('16.4.1'), [])).toBe(false);
  });
});

describe("the advisories report's sections", () => {
  it("names each repository advisory that covers the pin and is not fixed in it, and says a range it cannot read", () => {
    expect(repoReport('undici', '7.30.1', [advisory('>= 7.0.0, < 7.30.1', '7.30.1'), advisory('>= 7.0.0', '')])).toEqual({
      flagged: true,
      lines: ['undici 7.30.1: its repository\'s high advisory GHSA-test, "A test advisory", covers it (>= 7.0.0; fixed in ): https://example.test/a'],
    });
    expect(repoReport('undici', '7.30.1', [advisory('>= 7.0.0, < 7.30.1', '7.30.1'), advisory('< 9.0.0', '9.0.0', 'other'), { ...advisory('< 9.0.0', '9.0.0'), withdrawn_at: '2026-10-01' }])).toEqual({ flagged: false, lines: ['undici 7.30.1: none of the 3 advisories its repository has published covers it.'] });
    expect(repoReport('next', '16.4.1', [advisory('every version', '16.5.0', 'next')]).lines).toEqual(['next 16.4.1: its repository\'s high advisory GHSA-test, "A test advisory", gives a range that could not be read (every version), so read it by hand: https://example.test/a']);
    expect(repoReport('next', '^16.4.1', []).flagged).toBe(true);
  });

  it("lists pnpm audit's high and critical advisories and counts the rest", () => {
    const one = (severity: string) => ({ module_name: 'zod', severity, title: 'Zod can exhaust memory', url: 'https://example.test/z', vulnerable_versions: '<4.6.6', patched_versions: '>=4.6.6', findings: [{ version: '4.6.5' }, { version: '4.6.5' }] });
    expect(auditReport({ advisories: { 1: one('high'), 2: one('low'), 3: one('moderate') } })).toEqual({
      flagged: true,
      lines: ['pnpm audit: zod 4.6.5 has a high advisory, "Zod can exhaust memory" (<4.6.6; fixed in >=4.6.6): https://example.test/z', 'pnpm audit: and 2 of lower severity.'],
    });
    expect(auditReport({ advisories: { 2: one('low') } })).toEqual({ flagged: false, lines: ['pnpm audit: no high or critical advisory for the production dependencies; 1 of lower severity.'] });
    expect(auditReport({})).toEqual({ flagged: false, lines: ['pnpm audit: no high or critical advisory for the production dependencies.'] });
  });

  it("names Node's security releases of the pinned major after the pin", () => {
    const releases = [
      { version: 'v26.1.0', date: '2026-10-27', security: true },
      { version: 'v24.22.1', date: '2026-10-20', security: true },
      { version: 'v24.22.0', date: '2026-10-14', security: false },
      { version: 'v24.13.1', date: '2026-02-10', security: true },
    ];
    expect(nodeReport('24.13.1', releases)).toEqual({ flagged: true, lines: ['Node 24.13.1: a security release has come out since: 24.22.1 (2026-10-20). Its notes say what each fixes, its own undici included.'] });
    expect(nodeReport('24.22.1', releases)).toEqual({ flagged: false, lines: ['Node 24.22.1: no security release of Node 24 has come out since.'] });
  });
});

describe('the advisories report, printed', () => {
  const root = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'byway-advisories-'));
    for (const { file, name } of WATCHED) {
      mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(dir, file), JSON.stringify({ dependencies: { [name]: name === 'undici' ? '7.30.1' : '16.4.1' } }));
    }
    writeFileSync(path.join(dir, '.node-version'), '24.22.1\n');
    return dir;
  };
  const answers = (over: Record<string, unknown> = {}): NonNullable<AdvisoryOptions['fetch']> => async (url) => {
    const pages: Record<string, unknown> = { [repoAdvisories('nodejs/undici')]: [], [repoAdvisories('vercel/next.js')]: [], [NODE_RELEASES]: [], ...over };
    const body = pages[url];
    if (body instanceof Error) throw body;
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
  };
  const run = async (opts: AdvisoryOptions) => {
    const lines: string[] = [];
    const summary = path.join(mkdtempSync(path.join(tmpdir(), 'byway-advisories-')), 'summary.md');
    writeFileSync(summary, '');
    const before = process.exitCode;
    await expect(report({ root: root(), print: (l) => lines.push(l), summary, ...opts })).resolves.toBeUndefined();
    expect(process.exitCode).toBe(before);
    return { lines, warnings: lines.filter((l) => l.startsWith('::warning')), summary: readFileSync(summary, 'utf8') };
  };

  it('with nothing found, prints one line per check and warns of nothing', async () => {
    const out = await run({ fetch: answers(), audit: () => '{"advisories":{}}' });
    expect(out.lines).toEqual([
      'pnpm audit: no high or critical advisory for the production dependencies.',
      'undici 7.30.1: none of the 0 advisories its repository has published covers it.',
      'next 16.4.1: none of the 0 advisories its repository has published covers it.',
      'Node 24.22.1: no security release of Node 24 has come out since.',
    ]);
    expect(out.warnings).toEqual([]);
    expect(out.summary).toBe(`### Advisories\n\n${out.lines.join('\n\n')}\n`);
  });

  it('never fails: what it cannot read is said, and warned of, and a planted line break or workflow command stays one plain line', async () => {
    const planted = { ...advisory('>= 7.0.0, < 7.31.0', '7.31.0'), summary: 'x\n::error::planted' };
    const out = await run({ fetch: answers({ [repoAdvisories('nodejs/undici')]: [planted], [NODE_RELEASES]: new Error('getaddrinfo ENOTFOUND nodejs.org') }), audit: () => 'not JSON' });
    expect(out.lines[0]).toMatch(/^pnpm audit could not be read \(.*\), so this run did not check the lockfile\.$/);
    expect(out.lines[1]).toBe('undici 7.30.1: its repository\'s high advisory GHSA-test, "x ::error::planted", covers it (>= 7.0.0, < 7.31.0; fixed in 7.31.0): https://example.test/a');
    expect(out.lines[3]).toBe('Node: its security releases could not be read (getaddrinfo ENOTFOUND nodejs.org), so this run did not check them.');
    expect(out.lines.every((l) => !/[\r\n]/.test(l) && !l.startsWith('::error'))).toBe(true);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/^::warning title=Advisories::pnpm audit could not be read/);
    const missing = await run({ fetch: answers({ [repoAdvisories('vercel/next.js')]: undefined }), audit: () => '{}' });
    expect(missing.lines[2]).toBe("next: vercel/next.js's advisories could not be read (it answered 404), so this run did not check them.");
  });
});
