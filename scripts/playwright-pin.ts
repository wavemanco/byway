/**
 * Whether byway's pinned Playwright has fallen behind npm's latest release: the weekly CI run's report (verify.yml),
 * at the owner's answer of 2026-10-21 on the Playwright cadence (D4), "Within two weeks of each release
 * (Recommended)": "Update within two weeks of each Playwright minor release, sooner for a high or critical Chromium
 * security fix. First update right after your first live run, preceded once by the F07 generators' baseline on
 * today's version (about 6 hours of your machine, no paid calls). The weekly CI run reports when the pin falls behind."
 *
 * It reports and never fails: it prints what it found, adds it to the run's summary, and marks a pin that is behind
 * with a warning on the run's page; anything it cannot read (the registry, a package file) is said in one line, and it
 * exits 0 whatever happens. Every line goes out plain, through the price report's plain() (B-020). It reads the pins
 * from packages/runner (playwright) and apps/web (@playwright/test), and npm's record of Playwright's releases, with no
 * key. Security fixes are not in npm's record: a release's notes say which Chromium it brings.
 *
 * Run with plain Node, which strips this file's types: `node scripts/playwright-pin.ts`.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plain } from './price-report.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** npm's record of Playwright's releases: its versions and when each came out. */
export const REGISTRY = 'https://registry.npmjs.org/playwright';
/** The packages that pin Playwright, and the dependency each pins it by. */
export const PINNED = [
  { file: 'packages/runner/package.json', name: 'playwright' },
  { file: 'apps/web/package.json', name: '@playwright/test' },
] as const;
/** The cadence's window after a minor release. */
const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export interface Pin {
  /** The package folder, as the report names it. */
  where: string;
  version: string;
}

/** What npm's registry says of a package: its dist-tags and the time each version came out. */
export interface Registry {
  'dist-tags'?: { latest?: unknown };
  time?: Record<string, unknown>;
}

type Version = [number, number, number];
/** A release version (no prerelease or build part), or undefined. */
const release = (v: unknown): Version | undefined => {
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
};
const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const sameMinor = (a: Version, b: Version): boolean => a[0] === b[0] && a[1] === b[1];
const named = (v: Version): string => v.join('.');
const day = (iso: string): string => iso.slice(0, 10);

/** The pins as the package files have them. Throws when a file or its pin cannot be read. */
export function pinsIn(root: string = ROOT): Pin[] {
  return PINNED.map(({ file, name }) => {
    const pkg = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    const version = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (!release(version)) throw new Error(`${file} does not pin ${name} to one release (it has ${JSON.stringify(version)})`);
    return { where: path.dirname(file).replace(/\\/g, '/'), version: version as string };
  });
}

/**
 * What the report says: whether the pin is behind npm's latest release, and its lines. When the latest is a newer minor,
 * the cadence's two weeks run from the first minor release after the pin. Throws when the registry's answer has no
 * latest release it can read.
 */
export function pinReport(pins: readonly Pin[], registry: Registry, now: Date): { behind: boolean; lines: string[] } {
  const latest = release(registry['dist-tags']?.latest);
  if (!latest) throw new Error('npm names no latest release');
  const time = registry.time ?? {};
  const versions = [...new Set(pins.map((p) => p.version))];
  const where = (v: string) => pins.filter((p) => p.version === v).map((p) => p.where);
  const lines: string[] = [];
  if (versions.length > 1) lines.push(`The Playwright pins differ: ${pins.map((p) => `${p.where} ${p.version}`).join(', ')}. They should name one release.`);
  // The oldest pin is the one the cadence is about.
  const pinned = versions.map((v) => release(v)!).sort(compare)[0]!;
  const pinText = `byway pins Playwright ${named(pinned)} (${where(named(pinned)).join(' and ')})`;
  if (compare(pinned, latest) >= 0) {
    lines.push(`${pinText}, npm's latest release.`);
    return { behind: false, lines };
  }
  // The releases after the pin, in order, with the day each came out.
  const after = Object.entries(time)
    .map(([v, at]) => ({ v: release(v), at: typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : undefined }))
    .filter((r): r is { v: Version; at: string } => r.v !== undefined && r.at !== undefined && compare(r.v, pinned) > 0 && compare(r.v, latest) <= 0)
    .sort((a, b) => compare(a.v, b.v));
  const latestAt = after.find((r) => compare(r.v, latest) === 0)?.at;
  lines.push(`${pinText}; npm's latest release is ${named(latest)}${latestAt ? `, out on ${day(latestAt)}` : ''}.`);
  const minor = after.find((r) => !sameMinor(r.v, pinned));
  if (sameMinor(latest, pinned)) {
    lines.push(`It is a patch release of the pinned minor. The cadence's two weeks run from a minor release; a patch is taken sooner for a high or critical Chromium security fix, which its release notes name.`);
  } else if (minor) {
    const days = Math.floor((now.getTime() - Date.parse(minor.at)) / DAY_MS);
    const left = WINDOW_DAYS - days;
    lines.push(
      `${named(minor.v)}, the first minor release after the pin, came out on ${day(minor.at)}, ${days} ${days === 1 ? 'day' : 'days'} ago. The cadence the owner chose on 2026-10-21 is an update within two weeks of each minor release, sooner for a high or critical Chromium security fix: ${left > 0 ? `${left} ${left === 1 ? 'day is' : 'days are'} left.` : 'the two weeks are up.'}`,
    );
  } else {
    lines.push('npm does not say when the first minor release after the pin came out.');
  }
  return { behind: true, lines };
}

export interface ReportOptions {
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  root?: string;
  now?: () => Date;
  /** Where the lines go: the job's log, by default. */
  print?: (line: string) => void;
  /** The run's summary file (GITHUB_STEP_SUMMARY on GitHub); none locally. */
  summary?: string;
}

/** The report, printed: it never throws and never sets a failing exit code. */
export async function report(opts: ReportOptions = {}): Promise<void> {
  const print = opts.print ?? ((line: string) => console.log(line));
  let lines: string[];
  let behind = false;
  try {
    const pins = pinsIn(opts.root);
    const res = await (opts.fetch ?? fetch)(REGISTRY, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`npm's registry answered ${res.status}`);
    ({ behind, lines } = pinReport(pins, (await res.json()) as Registry, (opts.now ?? (() => new Date()))()));
  } catch (err) {
    lines = [`Whether the Playwright pin has fallen behind could not be read (${err instanceof Error ? err.message : String(err)}), so this run reports nothing on it.`];
  }
  // An error's message can quote npm's answer, line breaks and workflow commands included: every line goes out plain.
  lines = lines.map(plain);
  for (const line of lines) print(line);
  // A warning on the run's page, which blocks nothing.
  if (behind) print(`::warning title=Playwright pin::${lines.join(' ').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  if (opts.summary) {
    try {
      appendFileSync(opts.summary, `### Playwright pin\n\n${lines.join('\n\n')}\n`);
    } catch {
      // The summary is a convenience; the log has the lines.
    }
  }
}

if (import.meta.main) await report({ ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}) });
