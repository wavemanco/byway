/**
 * What ci.test.ts holds the repository's GitHub Actions files to (ADR-0103):
 *
 * - Every action and reusable workflow they use is pinned to a full commit SHA (a Docker image by its sha256 digest).
 *   A `uses` key is found in any form: a step's `- uses:`, a `uses:` under `- name:`, a job's `uses:` (a reusable
 *   workflow), a flow mapping (`{ uses: … }`) and a quoted key or value. A local action or reusable workflow
 *   (`uses: ./…`) is pinned by this repository's own commit, so it passes, and the file it names is read and held to
 *   the same rule; one that cannot be found fails.
 * - Nothing in them names the secrets context, in any form (`secrets.X`, `secrets['X']`, `toJSON(secrets)`,
 *   `secrets: inherit`), comments included: the word does not appear.
 *
 * It reads lines, not YAML, and fails closed: a `uses` whose value it cannot read on its own line is reported.
 */

export interface UsesValue {
  file: string;
  /** 1-based. */
  line: number;
  /** As written, without quotes; empty when the value is not on the key's line. */
  value: string;
}

/** A `uses` key: at a line's start, after a sequence dash, or inside a flow mapping; the key may be quoted. */
const USES = /(?:^|[\s{,-])(["']?)uses\1[ \t]*:[ \t]*("[^"\n]*"|'[^'\n]*'|[^\s,}#]*)/gim;

/** Every value of a `uses` key in a workflow or action file. */
export function usesValues(file: string, text: string): UsesValue[] {
  const out: UsesValue[] = [];
  text.split('\n').forEach((content, i) => {
    for (const m of content.matchAll(USES)) out.push({ file, line: i + 1, value: (m[2] ?? '').replace(/^(["'])(.*)\1$/, '$2') });
  });
  return out;
}

/** A remote action or reusable workflow at a full commit SHA, or a Docker image at its digest. */
export const isPinned = (value: string): boolean => /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/.test(value) || /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/.test(value);

/** The repository files a local `uses: ./…` may name: the workflow file itself, or the action's metadata file. */
function localCandidates(value: string): string[] {
  const rel = value.replace(/^\.\//, '').replace(/\/+$/, '');
  return /\.ya?ml$/.test(rel) ? [rel] : [`${rel}/action.yml`, `${rel}/action.yaml`];
}

/**
 * The problems in a set of workflow and action files (repository path to text). `readLocal` reads a repository file
 * that a local `uses` names and the set does not hold; undefined when it does not exist.
 */
export function actionProblems(files: Record<string, string>, readLocal: (rel: string) => string | undefined = () => undefined): string[] {
  const problems: string[] = [];
  const texts = new Map(Object.entries(files));
  const queue = [...texts.keys()];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const file = queue.shift() ?? '';
    const text = (texts.get(file) ?? '').replace(/\r\n/g, '\n');
    for (const u of usesValues(file, text)) {
      if (u.value.startsWith('./')) {
        const found = localCandidates(u.value).find((c) => texts.has(c) || readLocal(c) !== undefined);
        if (found === undefined) {
          problems.push(`${file}:${u.line}: ${u.value} names a local action or workflow that is not in the repository (looked for ${localCandidates(u.value).join(' and ')}).`);
        } else if (!seen.has(found)) {
          seen.add(found);
          if (!texts.has(found)) texts.set(found, readLocal(found) ?? '');
          queue.push(found);
        }
      } else if (u.value === '') {
        problems.push(`${file}:${u.line}: a "uses" whose value is not on its line; write it as "uses: owner/repo@<full commit SHA>".`);
      } else if (!isPinned(u.value)) {
        problems.push(`${file}:${u.line}: ${u.value} is not pinned to a full commit SHA; write "owner/repo@<40-character SHA> # <tag>".`);
      }
    }
    text.split('\n').forEach((content, i) => {
      if (/secrets/i.test(content)) problems.push(`${file}:${i + 1}: names secrets. CI uses none (ADR-0103); the word does not appear, comments included.`);
    });
  }
  return problems;
}
