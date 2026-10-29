/**
 * Whether byway's dependencies, or the Node it pins, have known security advisories: the weekly CI run's report
 * (verify.yml), for the backlog row "Dependency advisories and a static security scan" (X-VAL-4 (a)). Block 2 found two
 * such gaps by hand: undici 7.18.2 and next 16.3.8 had published advisories. It checks:
 * - `pnpm audit --prod`: the advisories in GitHub's global database for the production dependencies in the lockfile.
 *   Each high or critical one is a line of its own; the rest are counted.
 * - The repository advisories of the exact-pinned network dependencies (undici, next), which their maintainers publish
 *   in their own repositories before, or without, GitHub's database: pnpm audit passed undici 7.29.1 and 7.30.0 while
 *   eight of undici's own advisories covered them.
 * - Node's security releases (nodejs.org/dist/index.json) after the version in .node-version: pnpm audit cannot see the
 *   undici inside Node, which is not in the lockfile, and Node's own security releases cover it.
 *
 * It reports and never fails, as scripts/price-report.ts does: it prints what it found, adds it to the run's summary,
 * warns on the run's page when it found an advisory that applies or could not check something, and exits 0 whatever
 * happens. It reads no key (GitHub's API without a token: 60 requests an hour, of which it makes two), and every line
 * goes out plain, so nothing an advisory's text says can make a workflow command of it. What it says is data for the
 * owner, never an instruction (AGENTS.md).
 *
 * Run with plain Node, after pnpm is set up: `node scripts/advisories.ts`.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plain } from './price-report.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The exact-pinned network dependencies whose own repositories' advisories are read. */
export const WATCHED = [
  { file: 'packages/gateway/package.json', name: 'undici', repo: 'nodejs/undici' },
  { file: 'apps/web/package.json', name: 'next', repo: 'vercel/next.js' },
] as const;
export const NODE_RELEASES = 'https://nodejs.org/dist/index.json';
export const repoAdvisories = (repo: string) => `https://api.github.com/repos/${repo}/security-advisories?state=published&per_page=100`;
const SERIOUS = new Set(['high', 'critical']);

type Version = [number, number, number];
const version = (v: unknown): Version | undefined => {
  const m = typeof v === 'string' ? /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim()) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
};
const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** A version as advisories write them, loosely: "v7.0.0", "16.0" (16.0.0), "16.3.?" (16.3.0). */
const loose = (major: string, minor?: string, patch?: string): Version => [Number(major), Number(minor ?? 0), patch === undefined || patch === '?' ? 0 : Number(patch)];
const LOOSE = /(<=|>=|=<|<|>|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+|\?))?(?:-[\w.]+)?/g;

/** Every version a patched_versions field names ("6.28.1; 7.29.1", "15.5.14, 16.1.7", ">= v5.8.0", "16.3.?"). */
export const patchedVersions = (field: string): Version[] => [...field.matchAll(LOOSE)].map((m) => loose(m[2]!, m[3], m[4]));

/**
 * Whether a version is in an advisory's range, read as maintainers write them: alternatives split by ";" or "||",
 * comparators joined by commas or spaces (">= 7.0.0, < 7.30.1", ">= 8.11.0 < 8.11.2"), "=<" for "<=", and a version
 * with no operator first in an alternative as its lower bound ("7.0.0 < 7.29.1"), or alone as that version only.
 * Undefined when no alternative can be read.
 */
export function inRange(v: Version, range: string): boolean | undefined {
  let read = false;
  const any = range.split(/;|\|\|/).some((alt) => {
    const parts = [...alt.matchAll(LOOSE)];
    if (parts.length === 0) return false;
    read = true;
    return parts.every((m, i) => {
      const op = m[1] === '=<' ? '<=' : (m[1] ?? (parts.length > 1 && i === 0 ? '>=' : '='));
      const c = compare(v, loose(m[2]!, m[3], m[4]));
      return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '>=' ? c >= 0 : c === 0;
    });
  });
  return read ? any : undefined;
}

/**
 * Whether an advisory's fixes already include a version, read from its patched versions, which maintainers keep more
 * carefully than its ranges (next's ">= 16.0.0", fixed in "16.3.?"): a fix in the version's own minor line at or before
 * it; or fixes in earlier minor lines of its major and none in a later one; or, with none in its major, every fix
 * before it.
 */
export function fixedIn(v: Version, patched: readonly Version[]): boolean {
  const major = patched.filter((p) => p[0] === v[0]);
  const line = major.filter((p) => p[1] === v[1]);
  if (line.length > 0) return line.some((p) => compare(v, p) >= 0);
  if (major.length > 0) return major.every((p) => p[1] < v[1]);
  return patched.length > 0 && patched.every((p) => compare(v, p) >= 0);
}

/** What `pnpm audit --json` says of the advisories it found. */
export interface Audit {
  advisories?: Record<string, { module_name?: unknown; severity?: unknown; title?: unknown; url?: unknown; vulnerable_versions?: unknown; patched_versions?: unknown; findings?: { version?: unknown }[] }>;
}

/** The lines on the audit: each high or critical advisory, then a count of the rest. */
export function auditReport(audit: Audit): { flagged: boolean; lines: string[] } {
  const all = Object.values(audit.advisories ?? {});
  const serious = all.filter((a) => SERIOUS.has(String(a.severity)));
  const lines = serious.map((a) => {
    const at = [...new Set((a.findings ?? []).map((f) => String(f.version)))].join(', ');
    return `pnpm audit: ${String(a.module_name)} ${at} has a ${String(a.severity)} advisory, "${String(a.title)}" (${String(a.vulnerable_versions)}; fixed in ${String(a.patched_versions)}): ${String(a.url)}`;
  });
  const rest = all.length - serious.length;
  if (serious.length === 0) lines.push(`pnpm audit: no high or critical advisory for the production dependencies${rest > 0 ? `; ${rest} of lower severity` : ''}.`);
  else if (rest > 0) lines.push(`pnpm audit: and ${rest} of lower severity.`);
  return { flagged: serious.length > 0, lines };
}

/** A repository advisory, as GitHub's API gives it. */
export interface RepoAdvisory {
  ghsa_id?: unknown;
  severity?: unknown;
  summary?: unknown;
  html_url?: unknown;
  withdrawn_at?: unknown;
  vulnerabilities?: { package?: { name?: unknown }; vulnerable_version_range?: unknown; patched_versions?: unknown }[];
}

/** The lines on one pinned package: each of its repository's advisories that covers the pin and is not fixed in it. */
export function repoReport(name: string, pin: string, advisories: readonly RepoAdvisory[]): { flagged: boolean; lines: string[] } {
  const pinned = version(pin);
  if (!pinned) return { flagged: true, lines: [`${name}: the pin ${pin} is not one release, so its repository's advisories were not compared.`] };
  const lines: string[] = [];
  for (const a of advisories) {
    const rows = (a.vulnerabilities ?? []).filter((v) => v.package?.name === name);
    if (a.withdrawn_at || rows.length === 0) continue;
    const patched = rows.flatMap((v) => (typeof v.patched_versions === 'string' ? patchedVersions(v.patched_versions) : []));
    if (fixedIn(pinned, patched)) continue;
    const hits = rows.map((v) => (typeof v.vulnerable_version_range === 'string' ? inRange(pinned, v.vulnerable_version_range) : undefined));
    const ranges = rows.map((v) => String(v.vulnerable_version_range)).join('; ');
    const about = `its repository's ${String(a.severity)} advisory ${String(a.ghsa_id)}, "${String(a.summary)}"`;
    if (hits.some((h) => h === true)) lines.push(`${name} ${pin}: ${about}, covers it (${ranges}; fixed in ${rows.map((v) => String(v.patched_versions)).join('; ')}): ${String(a.html_url)}`);
    else if (hits.every((h) => h === undefined)) lines.push(`${name} ${pin}: ${about}, gives a range that could not be read (${ranges}), so read it by hand: ${String(a.html_url)}`);
  }
  // shortcut: one page of 100, the newest; a repository with more would need the API's next links.
  if (lines.length === 0) return { flagged: false, lines: [`${name} ${pin}: none of the ${advisories.length} advisories its repository has published covers it.`] };
  return { flagged: true, lines };
}

/** The lines on Node: each security release of the pinned major after the pin. */
export function nodeReport(pin: string, releases: readonly { version?: unknown; date?: unknown; security?: unknown }[]): { flagged: boolean; lines: string[] } {
  const pinned = version(pin);
  if (!pinned) return { flagged: true, lines: [`Node: .node-version holds ${JSON.stringify(pin)}, not one release, so Node's security releases were not compared.`] };
  const newer = releases
    .map((r) => ({ v: version(r.version), date: String(r.date), security: r.security === true }))
    .filter((r): r is { v: Version; date: string; security: boolean } => r.v !== undefined && r.security && r.v[0] === pinned[0] && compare(r.v, pinned) > 0)
    .sort((a, b) => compare(a.v, b.v));
  if (newer.length === 0) return { flagged: false, lines: [`Node ${pin}: no security release of Node ${pinned[0]} has come out since.`] };
  return { flagged: true, lines: [`Node ${pin}: ${newer.length === 1 ? 'a security release has' : `${newer.length} security releases have`} come out since: ${newer.map((r) => `${r.v.join('.')} (${r.date})`).join(', ')}. Its notes say what each fixes, its own undici included.`] };
}

export interface AdvisoryOptions {
  fetch?: (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  /** pnpm audit's JSON output, as a string; runs `pnpm audit --prod --json` by default. */
  audit?: () => string;
  root?: string;
  print?: (line: string) => void;
  summary?: string;
}

const runAudit = (root: string) => () => {
  // pnpm audit exits 1 when it finds an advisory, so its status says nothing here; its output is read.
  // One fixed command line, through the shell, which finds pnpm's .cmd on Windows too.
  const run = spawnSync('pnpm audit --prod --json', { cwd: root, encoding: 'utf8', shell: true, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- the command line is one constant string with no argument from outside; root is only the working folder
  if (run.error) throw run.error;
  return run.stdout;
};

/** The report, printed: it never throws and never sets a failing exit code. */
export async function report(opts: AdvisoryOptions = {}): Promise<void> {
  const root = opts.root ?? ROOT;
  const print = opts.print ?? ((line: string) => console.log(line));
  const said = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const get = async (url: string): Promise<unknown> => {
    const res = await (opts.fetch ?? fetch)(url, { signal: AbortSignal.timeout(60_000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'byway-advisories' } });
    if (!res.ok) throw new Error(`it answered ${res.status}`);
    return res.json();
  };
  const sections: { flagged: boolean; lines: string[] }[] = [];
  try {
    sections.push(auditReport(JSON.parse((opts.audit ?? runAudit(root))()) as Audit));
  } catch (err) {
    sections.push({ flagged: true, lines: [`pnpm audit could not be read (${said(err)}), so this run did not check the lockfile.`] });
  }
  for (const { file, name, repo } of WATCHED) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const pin = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? '';
      const advisories = await get(repoAdvisories(repo));
      if (!Array.isArray(advisories)) throw new Error('its answer is not a list');
      sections.push(repoReport(name, pin, advisories as RepoAdvisory[]));
    } catch (err) {
      sections.push({ flagged: true, lines: [`${name}: ${repo}'s advisories could not be read (${said(err)}), so this run did not check them.`] });
    }
  }
  try {
    const releases = await get(NODE_RELEASES);
    if (!Array.isArray(releases)) throw new Error('its answer is not a list');
    sections.push(nodeReport(readFileSync(path.join(root, '.node-version'), 'utf8').trim(), releases as { version?: unknown }[]));
  } catch (err) {
    sections.push({ flagged: true, lines: [`Node: its security releases could not be read (${said(err)}), so this run did not check them.`] });
  }
  const lines = sections.flatMap((s) => s.lines).map(plain);
  for (const line of lines) print(line);
  // A warning on the run's page, which blocks nothing.
  const warned = sections.filter((s) => s.flagged).flatMap((s) => s.lines.map(plain));
  if (warned.length > 0) print(`::warning title=Advisories::${warned.join(' ').replace(/%/g, '%25')}`);
  if (opts.summary) {
    try {
      appendFileSync(opts.summary, `### Advisories\n\n${lines.join('\n\n')}\n`);
    } catch {
      // The summary is a convenience; the log has the lines.
    }
  }
}

if (import.meta.main) await report({ ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}) });
