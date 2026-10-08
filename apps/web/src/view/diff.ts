/**
 * A unified-diff model for the Result screen's diff viewer (C7 Lean Code Review). The artifact is a unified
 * diff followed by a paragraph starting "Why:" (spec §3.3); hunk line counts decide where the diff ends, so a
 * blank line or prose after the last hunk is never mistaken for code.
 */

export interface DiffLine {
  kind: 'add' | 'del' | 'context';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  /** The author's "Why:" paragraph, without the label. */
  why?: string;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(path: string): string {
  return path.replace(/^[ab]\//, '').replace(/\t.*$/, '');
}

export function parseUnifiedDiff(text: string): ParsedDiff {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const files: DiffFile[] = [];
  const trailing: string[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldLeft = 0;
  let newLeft = 0;
  let oldNo = 0;
  let newNo = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const mark = line[0];
      const body = line.slice(1);
      if (mark === '+') {
        hunk.lines.push({ kind: 'add', text: body, newLine: newNo++ });
        newLeft--;
        if (file) file.additions++;
        continue;
      }
      if (mark === '-') {
        hunk.lines.push({ kind: 'del', text: body, oldLine: oldNo++ });
        oldLeft--;
        if (file) file.deletions++;
        continue;
      }
      if (mark === '\\') continue; // "\ No newline at end of file"
      // A context line; an empty line is a context line whose leading space was trimmed.
      hunk.lines.push({ kind: 'context', text: mark === ' ' ? body : line, oldLine: oldNo++, newLine: newNo++ });
      oldLeft--;
      newLeft--;
      continue;
    }
    hunk = undefined;
    if (line.startsWith('diff --git ')) {
      file = undefined;
      continue;
    }
    if (line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
      file = { oldPath: stripPrefix(line.slice(4)), newPath: stripPrefix((lines[i + 1] ?? '').slice(4)), hunks: [], additions: 0, deletions: 0 };
      files.push(file);
      i++;
      trailing.length = 0;
      continue;
    }
    const m = HUNK.exec(line);
    if (m && file) {
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      oldNo = Number(m[1]);
      newNo = Number(m[3]);
      oldLeft = m[2] === undefined ? 1 : Number(m[2]);
      newLeft = m[4] === undefined ? 1 : Number(m[4]);
      trailing.length = 0;
      continue;
    }
    if (/^(index |new file mode|deleted file mode|similarity index|rename (from|to) |old mode|new mode)/.test(line)) continue;
    trailing.push(line);
  }

  const rest = trailing.join('\n');
  const at = rest.search(/^Why:/m);
  if (at < 0) return { files };
  return { files, why: rest.slice(at + 'Why:'.length).trim() };
}
