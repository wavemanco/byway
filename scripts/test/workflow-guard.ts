/**
 * What ci.test.ts holds the repository's GitHub Actions files to (ADR-0103):
 *
 * - Every action and reusable workflow they use is pinned to a full commit SHA, and every Docker image by its sha256
 *   digest: each `uses` (a `docker://` image too), a job's `container` image, each of its `services` images, and a Docker
 *   action's `runs.image`. A local action or reusable workflow (`uses: ./…`) is pinned by this repository's own commit,
 *   so it passes, and the file it names is read and held to the same rule; one that cannot be found fails. A Docker
 *   action built from a Dockerfile fails: this guard does not read a Dockerfile's base image.
 * - Nothing in them names the secrets context: the word "secrets" does not appear, in any case, comments included, and
 *   no key or value holds it once its escapes are read.
 *
 * How it reads them. Each file is parsed as YAML (the `yaml` package, pinned in package.json; YAML 1.2), so a key or
 * value counts however it is spelled: quoted, escaped, a complex key (`? uses`), a flow pair in a flow sequence
 * (`[uses: …]`), an alias. Every mapping key named `uses`, in any case and at any depth, is checked. It fails closed: a
 * file the parser reports an error or a warning for fails (a duplicate key, a tag it does not know), and so does a key
 * that is a list or a mapping. The text is read line by line as well, as a backstop for a YAML reader that reads the
 * file otherwise than this one: a `uses` that a line shows unpinned fails, every `uses` must also be written plainly on
 * its key's line (`uses: <value>`, the value quoted or not), and the word "secrets" fails wherever it stands.
 */
import { isAlias, isMap, isPair, isScalar, isSeq, LineCounter, parseAllDocuments, type Document, type Node } from 'yaml';

export interface UsesValue {
  file: string;
  /** 1-based. */
  line: number;
  /** As written, without quotes; empty when the value is not on the key's line. */
  value: string;
}

/** A `uses` key as a line shows it: at a line's start, after a sequence dash, or inside a flow mapping; maybe quoted. */
const USES = /(?:^|[\s{,-])(["']?)uses\1[ \t]*:[ \t]*("[^"\n]*"|'[^'\n]*'|[^\s,}#]*)/gim;

/** Every value of a `uses` key that a line of a workflow or action file shows (the line reader, the backstop). */
export function usesValues(file: string, text: string): UsesValue[] {
  const out: UsesValue[] = [];
  text.split('\n').forEach((content, i) => {
    for (const m of content.matchAll(USES)) out.push({ file, line: i + 1, value: (m[2] ?? '').replace(/^(["'])(.*)\1$/, '$2') });
  });
  return out;
}

/** A remote action or reusable workflow at a full commit SHA, or a Docker image at its digest. */
export const isPinned = (value: string): boolean => /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/.test(value) || /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/.test(value);

/** A container or service image (no `docker://`) at its digest. */
const isPinnedImage = (value: string): boolean => /^[^@\s]+@sha256:[0-9a-f]{64}$/.test(value);

/** The repository files a local `uses: ./…` may name: the workflow file itself, or the action's metadata file. */
function localCandidates(value: string): string[] {
  const rel = value.replace(/^\.\//, '').replace(/\/+$/, '');
  return /\.ya?ml$/.test(rel) ? [rel] : [`${rel}/action.yml`, `${rel}/action.yaml`];
}

const SECRETS = /secrets/i;

/** A key or value as a string, an alias read through; undefined for a list or a mapping. */
function scalarOf(node: unknown, doc: Document): { value: unknown; node: Node } | undefined {
  const n = isAlias(node) ? node.resolve(doc) : node;
  return isScalar(n) ? { value: n.value, node: n } : undefined;
}

/** A mapping's entries, read as JS Maps (aliases already read through), each key as a string. */
const entries = (obj: unknown): Array<[string, unknown]> => (obj instanceof Map ? [...obj].map(([k, v]) => [String(k), v]) : []);
/** A mapping's value by key, the key compared in any case. */
const field = (obj: unknown, key: string): unknown => entries(obj).find(([k]) => k.toLowerCase() === key)?.[1];

/**
 * The problems in a set of workflow and action files (repository path to text). `readLocal` reads a repository file
 * that a local `uses` names and the set does not hold; undefined when it does not exist.
 */
export function actionProblems(files: Record<string, string>, readLocal: (rel: string) => string | undefined = () => undefined): string[] {
  // One problem per place and kind: the YAML reader's comes first, and the line reader adds what it alone sees.
  const problems = new Map<string, string>();
  const add = (file: string, line: number, kind: string, message: string) => {
    const key = `${file}:${line}:${kind}`;
    if (!problems.has(key)) problems.set(key, `${file}:${line}: ${message}`);
  };
  const texts = new Map(Object.entries(files));
  const queue = [...texts.keys()];
  const seen = new Set(queue);
  const local = (file: string, line: number, value: string) => {
    const found = localCandidates(value).find((c) => texts.has(c) || readLocal(c) !== undefined);
    if (found === undefined) {
      add(file, line, 'uses', `${value} names a local action or workflow that is not in the repository (looked for ${localCandidates(value).join(' and ')}).`);
    } else if (!seen.has(found)) {
      seen.add(found);
      if (!texts.has(found)) texts.set(found, readLocal(found) ?? '');
      queue.push(found);
    }
  };

  while (queue.length > 0) {
    const file = queue.shift() ?? '';
    const text = (texts.get(file) ?? '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const plain = usesValues(file, text);
    const counter = new LineCounter();
    const lineOf = (node: Node | null | undefined): number => (node?.range ? counter.linePos(node.range[0]).line : 1);

    // ——— the YAML reader ———
    for (const doc of parseAllDocuments(text, { version: '1.2', uniqueKeys: true, merge: false, lineCounter: counter })) {
      for (const e of [...doc.errors, ...doc.warnings]) {
        add(file, e.linePos?.[0]?.line ?? 1, 'yaml', `could not be read as plain YAML (${e.code}: ${e.message.split('\n')[0]}); the guard fails closed.`);
      }
      // Every node once, where it is written (an alias's target is read where its anchor stands).
      const walk = (node: unknown): void => {
        if (isMap(node)) {
          for (const pair of node.items) walk(pair);
        } else if (isSeq(node)) {
          for (const item of node.items) walk(item);
        } else if (isPair(node)) {
          const key = scalarOf(node.key, doc);
          if (!key) {
            add(file, lineOf(node.key as Node), 'key', 'a key that is a list or a mapping; GitHub reads plain keys, and the guard fails closed.');
          } else if (String(key.value).toLowerCase() === 'uses') {
            const line = lineOf(key.node);
            const value = scalarOf(node.value, doc)?.value;
            if (typeof value !== 'string') {
              add(file, line, 'uses', 'a "uses" whose value is not a plain value; write it as "uses: owner/repo@<full commit SHA>".');
            } else if (!value.startsWith('./') && !isPinned(value)) {
              add(file, line, 'uses', `${value} is not pinned to a full commit SHA; write "owner/repo@<40-character SHA> # <tag>".`);
            } else if (!plain.some((u) => u.line === line && u.value === value)) {
              add(file, line, 'uses', `${value} is read as a "uses" here, but the line does not show it as one; write it as "uses: <value>" on one line.`);
            } else if (value.startsWith('./')) {
              local(file, line, value);
            }
          }
          walk(node.key);
          walk(node.value);
        } else if (isScalar(node)) {
          // The line reader sees the word as written; this sees it once escapes are read.
          const source = node.range ? text.slice(node.range[0], node.range[1]) : '';
          if (SECRETS.test(String(node.value)) && !SECRETS.test(source)) add(file, lineOf(node), 'secrets', 'names secrets, written with escapes. CI uses none (ADR-0103).');
        }
      };
      walk(doc.contents);

      // Images, where GitHub reads them: a job's container and services, a Docker action's runs.image.
      let js: unknown;
      try {
        js = doc.toJS({ maxAliasCount: 1000, mapAsMap: true });
      } catch (e) {
        add(file, 1, 'yaml', `could not be read as plain YAML (${(e as Error).message.split('\n')[0]}); the guard fails closed.`);
      }
      // The line of a key path as written (without aliases); the path is named in the message either way.
      const lineAt = (keys: string[]): number => {
        const n = doc.getIn(keys, true);
        return n && typeof n === 'object' && 'range' in n ? lineOf(n as Node) : 1;
      };
      const image = (keys: string[], value: unknown) => {
        const where = keys.join('.');
        if (value === undefined) add(file, lineAt(keys.slice(0, -1)), `image ${where}`, `${where.replace(/\.image$/, '')} names no image; the guard fails closed.`);
        else if (typeof value !== 'string' || !isPinnedImage(value)) add(file, lineAt(keys), `image ${where}`, `${where}: ${String(value)} is not pinned by its digest; write "<image>@sha256:<64 hex digits>".`);
      };
      for (const [id, job] of entries(field(js, 'jobs'))) {
        const container = field(job, 'container');
        if (typeof container === 'string') image(['jobs', id, 'container'], container);
        else if (container !== undefined) image(['jobs', id, 'container', 'image'], field(container, 'image'));
        for (const [name, service] of entries(field(job, 'services'))) {
          if (typeof service === 'string') image(['jobs', id, 'services', name], service);
          else image(['jobs', id, 'services', name, 'image'], field(service, 'image'));
        }
      }
      const runImage = field(field(js, 'runs'), 'image');
      if (runImage !== undefined) {
        const line = lineAt(['runs', 'image']);
        if (typeof runImage === 'string' && !runImage.startsWith('docker://')) {
          add(file, line, 'image runs.image', `runs.image: ${runImage} is built from a Dockerfile, whose base image this guard does not read; use a "docker://<image>@sha256:<digest>" image.`);
        } else if (typeof runImage !== 'string' || !isPinned(runImage)) {
          add(file, line, 'image runs.image', `runs.image: ${String(runImage)} is not pinned by its digest; write "docker://<image>@sha256:<64 hex digits>".`);
        }
      }
    }

    // ——— the line reader, the backstop ———
    for (const u of plain) {
      if (u.value.startsWith('./')) continue;
      if (u.value === '') add(file, u.line, 'uses', 'a "uses" whose value is not on its line; write it as "uses: owner/repo@<full commit SHA>".');
      else if (!isPinned(u.value)) add(file, u.line, 'uses', `${u.value} is not pinned to a full commit SHA; write "owner/repo@<40-character SHA> # <tag>".`);
    }
    lines.forEach((content, i) => {
      if (SECRETS.test(content)) add(file, i + 1, 'secrets', 'names secrets. CI uses none (ADR-0103); the word does not appear, comments included.');
    });
  }
  return [...problems.values()];
}
