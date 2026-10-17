/**
 * The decision log's rule (ADR-0103), read from git. Used by adr-records.test.ts, on this repository and on small
 * fixture repositories.
 *
 * - A record's Context and Decision are final once it reaches main's first-parent history as Accepted. Main's
 *   first-parent history is the chain of commits made on main itself: direct commits, and one merge commit for each
 *   branch merged with --no-ff. A branch's own commits are drafts, so a record may change on its branch before the
 *   merge. A fast-forwarded branch puts its commits on that chain, and then each of them counts.
 * - The commit that changes a record from Proposed to Accepted may finalise its Decision: the text is fixed as it
 *   stands in the first first-parent commit in which the record reads Accepted.
 * - From ADR-0103 on, a record that changes an Accepted one reaches main in the same first-parent commit as the
 *   index's "changed by" link to it.
 *
 * Only the Context and Decision sections are fixed. The header table (its Status row included) and the other sections
 * may change, and notes may be appended. The working tree is checked too, so an edit fails before it is committed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { section } from './docs.ts';

export const ADR_DIR = 'docs/adr';
export const INDEX = `${ADR_DIR}/README.md`;

/** The two sections CR14 fixes once a record is Accepted. */
export type Part = 'Context' | 'Decision';
export const PARTS: readonly Part[] = ['Context', 'Decision'];

export interface ParsedRecord {
  /** The header's Status cell, e.g. "Accepted" or "Accepted (2026-10-07 06:35; proposed 2026-10-06 06:00)". */
  status: string;
  /** Each section's text from its heading to the next heading of its level or higher, trailing space removed. */
  Context: string | undefined;
  Decision: string | undefined;
}

const lf = (text: string): string => text.replace(/\r\n/g, '\n');

export function parseRecord(text: string): ParsedRecord {
  const t = lf(text);
  const status = /^\| \*\*Status\*\* \| (.*?) \|[ \t]*$/m.exec(t)?.[1]?.trim() ?? '';
  const part = (name: Part) => section(t, `## ${name}`)?.replace(/\s+$/, '');
  return { status, Context: part('Context'), Decision: part('Decision') };
}

/** The status's first word: Accepted, Proposed, Superseded and so on. */
export const statusWord = (status: string): string => /^[A-Za-z]+/.exec(status.trim())?.[0] ?? '';

export const isAccepted = (status: string): boolean => statusWord(status) === 'Accepted';

/** A record's number from its path ("docs/adr/0041-….md" → "0041"); undefined for any other file. */
export function recordNumber(file: string): string | undefined {
  const rel = file.replace(/\\/g, '/');
  return new RegExp(`^${ADR_DIR}/(\\d{4})-[^/]+\\.md$`).exec(rel)?.[1];
}

/** Whether a Decision section opens as a proposal's does ("Proposed, not decided."). */
export const opensAsProposal = (decision: string | undefined): boolean =>
  /^Proposed\b/.test(
    (decision ?? '')
      .split('\n')
      .slice(1)
      .find((l) => l.trim() !== '')
      ?.trim() ?? '',
  );

// ——— git ———

/** Variables that point git at another repository (a hook sets them); the checks name their repository with -C. */
const REPO_VARIABLES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE'];
const gitEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !REPO_VARIABLES.includes(k.toUpperCase())));
/** Output settings a person's git configuration could change. */
const PLAIN = ['-c', 'color.ui=false', '-c', 'core.quotePath=false', '-c', 'log.showSignature=false'];

/** A git command's output, run in `repo` with the person's repository variables and output settings set aside. */
export function git(repo: string, args: string[]): string {
  const r = spawnSync('git', ['-C', repo, ...PLAIN, ...args], { encoding: 'utf8', env: gitEnv(), maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw new Error(`git could not be run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/** Several files at several commits ("<commit>:<path>"), read by one git process. Undefined for a missing one. */
function readBlobs(repo: string, specs: string[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  if (specs.length === 0) return out;
  const r = spawnSync('git', ['-C', repo, ...PLAIN, 'cat-file', '--batch'], { input: `${specs.join('\n')}\n`, env: gitEnv(), maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw new Error(`git could not be run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git cat-file failed: ${r.stderr.toString().trim()}`);
  const bytes = r.stdout;
  let at = 0;
  for (const spec of specs) {
    const end = bytes.indexOf(0x0a, at);
    const header = bytes.subarray(at, end).toString('utf8');
    at = end + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
      out.set(spec, undefined);
      continue;
    }
    const size = Number(header.split(' ')[2]);
    out.set(spec, bytes.subarray(at, at + size).toString('utf8'));
    at += size + 1;
  }
  return out;
}

export interface MainLine {
  /** The ref read as main: refs/heads/main, else refs/remotes/origin/main (a CI checkout of another branch). */
  ref: string;
  /** Where the checked-out commit meets main: main's first-parent history is walked from here. */
  base: string;
  /** Oldest first: each first-parent commit and the files it changed against its first parent. */
  commits: Array<{ sha: string; changed: Array<{ status: string; file: string }> }>;
}

/** Main's first-parent history up to where HEAD meets it. Throws a plain message when the history is not there. */
export function mainLine(repo: string, mainRef?: string): MainLine {
  if (git(repo, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('The decision-log check reads the whole history, and this clone is shallow. Fetch the full history (in GitHub Actions: actions/checkout with fetch-depth: 0).');
  }
  const candidates = mainRef ? [mainRef] : ['refs/heads/main', 'refs/remotes/origin/main'];
  const ref = candidates.find((c) => spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${c}^{commit}`], { env: gitEnv() }).status === 0);
  if (!ref) throw new Error(`The decision-log check reads main's history, and this clone has no main branch (looked for ${candidates.join(' and ')}).`);
  const base = git(repo, ['merge-base', 'HEAD', ref]).trim();
  if (!base) throw new Error(`HEAD and ${ref} have no commit in common.`);
  const log = git(repo, ['log', '--first-parent', '--diff-merges=first-parent', '--no-renames', '--reverse', '--format=%x01%H', '--name-status', base]);
  const commits = log
    .split('\x01')
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const [sha = '', ...lines] = chunk.split('\n');
      const changed = lines
        .filter((l) => l.trim() !== '')
        .map((l) => {
          const [status = '', file = ''] = l.split('\t');
          return { status: status.charAt(0), file };
        });
      return { sha: sha.trim(), changed };
    });
  return { ref, base, commits };
}

// ——— the index ———

export interface IndexRow {
  number: string;
  /** The row's link target, relative to docs/adr. */
  file: string;
  status: string;
  /** The records its "changed by" links name, in order. */
  changedBy: string[];
}

/** The index's decision rows (docs/adr/README.md): number, file, Status cell and "changed by" links. */
export function parseIndex(text: string): IndexRow[] {
  return lf(text)
    .split('\n')
    .flatMap((line) => {
      const head = /^\| \[ADR-(\d{4})\]\(([^)]+)\) \|/.exec(line);
      if (!head) return [];
      // Columns: #, Decision, Status, Decided by, Date. The title may hold a "|", so the status is counted from the end.
      const cells = line.replace(/^\|/, '').replace(/\|\s*$/, '').split(' | ');
      const status = (cells[cells.length - 3] ?? '').trim();
      const changed = /changed by (.*)$/.exec(status)?.[1] ?? '';
      return [{ number: head[1] ?? '', file: head[2] ?? '', status, changedBy: [...changed.matchAll(/\[ADR-(\d{4})\]/g)].map((m) => m[1] ?? '') }];
    });
}

/** "0083<0100": record 0083 is changed by record 0100. */
const linkKey = (changed: string, by: string): string => `${changed}<${by}`;

// ——— the rule, over main's history and the working tree ———

/** An edit to a fixed section that the log keeps, named with its reason. Later text is compared with this one. */
export interface Exception {
  record: string;
  /** The first-parent commit that made the edit (a prefix of at least 7 characters is enough). */
  commit: string;
  part: Part;
  reason: string;
}

export interface Breach {
  record: string;
  /** The section changed, or "record" when the file itself is gone. */
  part: Part | 'record';
  /** The first-parent commit in which the record first read Accepted. */
  acceptedIn: string;
  /** The first-parent commit that changed it, or "the working tree". */
  changedIn: string;
}

export interface LinkBreach {
  changed: string;
  by: string;
  /** Where the changing record first reached main as Accepted. */
  recordIn: string;
  /** Where the index's link to it first appeared: another commit, or "the working tree". */
  linkIn: string;
}

export interface LogCheck {
  line: MainLine;
  breaches: Breach[];
  /** The exceptions that matched an edit; one that matches nothing is out of date. */
  used: Exception[];
  /** Each record's first first-parent commit as Accepted. */
  acceptedIn: Map<string, string>;
  /** Records that have reached main's first-parent history, whatever their status. */
  onMain: Set<string>;
  linkBreaches: LinkBreach[];
}

export interface LogCheckOptions {
  exceptions?: readonly Exception[];
  /** The first record the same-commit link rule applies to (ADR-0103, which made the rule). */
  linksFrom: string;
  mainRef?: string;
}

const short = (sha: string): string => sha.slice(0, 12);
export const WORKING_TREE = 'the working tree';

/** The record files in the working tree, by number. */
function workingRecords(repo: string): Map<string, string> {
  const dir = path.join(repo, ...ADR_DIR.split('/'));
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const n = recordNumber(`${ADR_DIR}/${name}`);
    if (n) out.set(n, `${ADR_DIR}/${name}`);
  }
  return out;
}

export function checkLog(repo: string, opts: LogCheckOptions): LogCheck {
  const line = mainLine(repo, opts.mainRef);
  const exceptions = opts.exceptions ?? [];
  const specs = line.commits.flatMap((c) => c.changed.filter((ch) => ch.status !== 'D' && (recordNumber(ch.file) || ch.file === INDEX)).map((ch) => `${c.sha}:${ch.file}`));
  const blobs = readBlobs(repo, specs);

  const fixed = new Map<string, { acceptedIn: string; text: ParsedRecord }>();
  /** Each record's text in the last first-parent commit that changed it; null once a commit removed it. */
  const latest = new Map<string, ParsedRecord | null>();
  const acceptedIn = new Map<string, string>();
  const onMain = new Set<string>();
  const linkFirst = new Map<string, string>();
  const breaches: Breach[] = [];
  const used: Exception[] = [];

  const compare = (n: string, now: ParsedRecord, where: string, sha?: string) => {
    const base = fixed.get(n);
    if (!base) return;
    for (const part of PARTS) {
      if (now[part] === base.text[part]) continue;
      const exception = sha ? exceptions.find((e) => e.record === n && e.part === part && e.commit.length >= 7 && sha.startsWith(e.commit)) : undefined;
      if (exception) {
        used.push(exception);
        base.text = { ...base.text, [part]: now[part] };
      } else breaches.push({ record: n, part, acceptedIn: short(base.acceptedIn), changedIn: where });
    }
  };

  for (const commit of line.commits) {
    // A record's state after this commit: its file, or null when the commit removed it.
    const touched = new Map<string, string | null>();
    for (const { status, file } of commit.changed) {
      if (file === INDEX && status !== 'D') {
        for (const row of parseIndex(blobs.get(`${commit.sha}:${file}`) ?? '')) for (const by of row.changedBy) if (!linkFirst.has(linkKey(row.number, by))) linkFirst.set(linkKey(row.number, by), commit.sha);
        continue;
      }
      const n = recordNumber(file);
      if (!n) continue;
      if (status === 'D') {
        if (!touched.has(n)) touched.set(n, null);
      } else touched.set(n, file);
    }
    for (const [n, file] of touched) {
      if (file === null) {
        latest.set(n, null);
        const base = fixed.get(n);
        if (base) breaches.push({ record: n, part: 'record', acceptedIn: short(base.acceptedIn), changedIn: short(commit.sha) });
        continue;
      }
      onMain.add(n);
      const text = parseRecord(blobs.get(`${commit.sha}:${file}`) ?? '');
      latest.set(n, text);
      if (fixed.has(n)) compare(n, text, short(commit.sha), commit.sha);
      else if (isAccepted(text.status)) {
        fixed.set(n, { acceptedIn: commit.sha, text });
        acceptedIn.set(n, commit.sha);
      }
    }
  }

  // The working tree, so an edit fails before it is committed.
  const files = workingRecords(repo);
  for (const [n, base] of fixed) {
    const file = files.get(n);
    if (!file) {
      // A removal main's history already holds was reported at its commit.
      if (latest.get(n) !== null) breaches.push({ record: n, part: 'record', acceptedIn: short(base.acceptedIn), changedIn: WORKING_TREE });
    }
    else {
      // A section as main's history last had it was checked at that commit, so only a newer change is reported here.
      const now = parseRecord(readFileSync(path.join(repo, file), 'utf8'));
      const last = latest.get(n);
      const unchanged = PARTS.filter((p) => last && now[p] === last[p]);
      compare(n, { ...now, ...Object.fromEntries(unchanged.map((p) => [p, base.text[p]])) }, WORKING_TREE);
    }
  }
  const index = path.join(repo, ...INDEX.split('/'));
  if (existsSync(index)) for (const row of parseIndex(readFileSync(index, 'utf8'))) for (const by of row.changedBy) if (!linkFirst.has(linkKey(row.number, by))) linkFirst.set(linkKey(row.number, by), WORKING_TREE);

  // From opts.linksFrom on, a changing record and the index's link to it reach main in the same commit.
  const linkBreaches: LinkBreach[] = [];
  for (const [key, linkIn] of linkFirst) {
    const [changed = '', by = ''] = key.split('<');
    const recordIn = acceptedIn.get(by);
    if (by < opts.linksFrom || recordIn === undefined || linkIn === recordIn) continue;
    linkBreaches.push({ changed, by, recordIn: short(recordIn), linkIn: linkIn === WORKING_TREE ? linkIn : short(linkIn) });
  }

  return { line, breaches, used, acceptedIn, onMain, linkBreaches };
}

/** A breach as a sentence a person can act on. */
export function describeBreach(b: Breach): string {
  if (b.part === 'record') return `ADR-${b.record} reached main as Accepted in ${b.acceptedIn} and is gone in ${b.changedIn}. An Accepted record is never removed.`;
  return `ADR-${b.record}'s ${b.part} changed in ${b.changedIn} after it reached main as Accepted in ${b.acceptedIn}. Put the text back and record the change in a new ADR. (If a branch that revised it was fast-forwarded into main, merge with --no-ff instead.)`;
}

export function describeLinkBreach(b: LinkBreach): string {
  return `ADR-${b.by} reached main in ${b.recordIn}, but the index's "changed by" link from ADR-${b.changed} to it first appears in ${b.linkIn}. The link goes in the same commit as the record.`;
}
