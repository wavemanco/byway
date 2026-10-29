/**
 * Which pending rows' triggers a branch's diff fires: the rows of docs/backlog.md and docs/playbook.md whose Trigger
 * names a file the diff touches, or a code name (`redactMessage`, `SpendBook.abandon`, `PRICES_CHECKED`) on a line it
 * adds or removes. The owner chose at 2026-10-23 08:58 "Build the script and make it a step (Recommended)": "A small
 * script under scripts/, usable by any agent or person, lists the backlog rows whose trigger names a file the branch's
 * diff touches. Each block's records pass runs it, reads every builder's could-not-do list, parked findings and the
 * check's notes, gives each a row or a dated note, and rebuilds the Route Map's item list at the merge." (backlog row
 * B-091). The list is what to read, not a verdict: the records pass reads each row's Trigger and says in the row what
 * happened. A trigger that names neither a file nor a code name (an event, a date, another row) is not seen here.
 *
 * Run with plain Node, which strips the types: `node scripts/fired-triggers.ts [<base>]`. The diff is from the commit
 * where HEAD left <base> (default `main`) to the working tree, uncommitted and untracked files included.
 */
import { execFileSync } from 'node:child_process';
import { parseDocs, readDocs, ROOT, type Row } from './route-map.ts';

export interface Diff {
  /** The paths the diff touches, relative to the repository, with forward slashes. */
  files: string[];
  /** The text of the lines it adds or removes, joined. */
  lines: string;
}

export interface Fired {
  row: Row;
  /** What in the Trigger the diff touches: a path as the Trigger writes it, or a code name. */
  matched: string[];
}

// A path: a word with a slash in it, or a file name with an extension byway uses.
const PATH = /(?:[\w@.-]+\/)+[\w@.-]*|[\w-]+(?:\.[\w-]+)*\.(?:tsx?|mts|cts|mjs|cjs|js|md|ya?ml|json|html|css|sh|sql)\b/g;
// A code name: camelCase (not a word such as macOS), Name.member, or UPPER_SNAKE.
const CODE = /\b(?:[a-z]+[A-Z][a-z0-9]+[A-Za-z0-9]*|[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*|[A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g;

const clean = (p: string) => p.replace(/^\.\//, '').replace(/[./]+$/, '');

/** The paths and code names a Trigger names, as it writes them. */
export function namedIn(trigger: string): { paths: string[]; code: string[] } {
  const paths = [...new Set((trigger.match(PATH) ?? []).map(clean).filter((p) => p !== ''))];
  // A file's base name (fal.ts) is a path, not a code name.
  const code = [...new Set(trigger.match(CODE) ?? [])].filter((c) => !paths.some((p) => p.includes(c)));
  return { paths, code };
}

/** Whether a changed file is the path a Trigger names: the same path, a file of that name, or a file under that folder. */
export const touches = (file: string, named: string): boolean => {
  const f = `/${file}`;
  return f.endsWith(`/${named}`) || f.includes(`/${named}/`);
};

/** The rows whose Trigger names a file the diff touches or a code name on a line it changes, in the rows' order. */
export function firedTriggers(rows: readonly Row[], diff: Diff): Fired[] {
  const onChangedLine = (c: string) => new RegExp(`(?<![\\w$])${c.replace('.', '\\.')}(?![\\w$])`).test(diff.lines);
  return rows.flatMap((row) => {
    const { paths, code } = namedIn(row.cells.Trigger);
    const matched = [...paths.filter((p) => diff.files.some((f) => touches(f, p))), ...code.filter(onChangedLine)];
    return matched.length ? [{ row, matched }] : [];
  });
}

/** The branch's diff from where HEAD left `base` to the working tree. */
export function branchDiff(base = 'main', root = ROOT): Diff {
  const git = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  const from = git('merge-base', base, 'HEAD').trim();
  const list = (text: string) => text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const files = [...new Set([...list(git('diff', '--name-only', from)), ...list(git('ls-files', '--others', '--exclude-standard'))])];
  const lines = git('diff', '-U0', from)
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(?:\+\+\+|---) /.test(l))
    .join('\n');
  return { files, lines };
}

function main(argv: string[]): number {
  if (argv.length > 1 || argv[0]?.startsWith('-')) {
    console.error('usage: node scripts/fired-triggers.ts [<base>]');
    return 2;
  }
  const diff = branchDiff(argv[0]);
  const fired = firedTriggers(parseDocs(readDocs()).rows, diff);
  console.log(`${diff.files.length} files changed since ${argv[0] ?? 'main'}; ${fired.length} pending rows name one of them, or a code name on a changed line, in their Trigger:`);
  for (const { row, matched } of fired) console.log(`- ${row.id} (${row.file}:${row.line}), ${matched.join(', ')}: ${row.cells.Trigger}`);
  console.log("Read each row's Trigger and Details, and say in the row what happened; then read the builders' could-not-do lists, parked findings and the check's notes, and give each a row or a dated note (ADR-0107; backlog row B-091).");
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
