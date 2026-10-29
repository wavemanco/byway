/**
 * Guard: every request body byway's server reads goes through parseBody (src/server/http.ts), which refuses a body
 * holding one of byway's provider keys before anything is stored or sent (ADR-0088; ADR-0100 item 11). A route that
 * called request.json() itself would skip that refusal and no other test would fail (backlog F16 (a)).
 *
 * So the server's code (app/, src/ outside src/components, and proxy.ts) reads no body by any of Request's readers, its
 * `body` stream or a reader on it, and declares no Server Action (which Next hands a FormData, not a Request). The one
 * read is parseBody's, pinned below. src/components is the browser's code, which reads fetch answers, not requests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, REPO } from './guards/scan.ts';

const WEB = path.join(REPO, 'apps', 'web');
const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');
const SCANS = { timeout: 30_000 };

const READS = [
  /\.\s*(?:json|text|formData|arrayBuffer|blob|bytes)\s*\(\s*\)/,
  /\b\w*(?:req|Req|request|Request)\s*\.\s*body\b/,
  /\bgetReader\s*\(/,
  /^\s*['"]use server['"]/,
];

/** Each line of `source` that reads a body, as `<line>: <text>`. */
function bodyReads(source: string): string[] {
  return source.split('\n').flatMap((line, i) => (READS.some((re) => re.test(line)) ? [`${i + 1}: ${line.trim()}`] : []));
}

/** The reviewed reads: parseBody's, and nothing else. */
const ALLOWED: Record<string, string[]> = { 'apps/web/src/server/http.ts': ['body = await request.json();'] };

describe('the body-read scan', () => {
  it("finds a Request's readers, its body stream and a Server Action", () => {
    const reads = [
      'const data = await request.json();',
      'const raw = await req.text();',
      'const form = await request.formData();',
      'const buf = await incomingRequest.arrayBuffer();',
      'await r.blob()',
      'await r . bytes( )',
      'const stream = request.body;',
      'const reader = stream.getReader();',
      "'use server';",
    ];
    for (const line of reads) expect(bodyReads(line), line).toHaveLength(1);
  });

  it('does not count an error body, a JSON answer written out, or other names', () => {
    for (const line of ["return json({ error: err.message, ...err.body }, err.status);", 'const next = refusal.body?.composed;', 'export function json(body: unknown) {', "headers.get('content-type')", 'JSON.stringify(text)']) {
      expect(bodyReads(line), line).toEqual([]);
    }
  });
});

describe('request bodies in apps/web (ADR-0088, F16 (a))', SCANS, () => {
  it('are read only by parseBody', () => {
    const files = [...filesUnder(path.join(WEB, 'app'), /\.(ts|tsx)$/), ...filesUnder(path.join(WEB, 'src'), /\.(ts|tsx)$/).filter((f) => !rel(f).startsWith('apps/web/src/components/')), path.join(WEB, 'proxy.ts')];
    const found: Record<string, string[]> = {};
    for (const file of files) {
      const reads = bodyReads(readFileSync(file, 'utf8')).map((r) => r.replace(/^\d+: /, ''));
      if (reads.length) found[rel(file)] = reads;
    }
    expect(found, 'Read the body with parseBody (src/server/http.ts), which runs the held-key check').toEqual(ALLOWED);
  });
});
