/**
 * The decision evidence kept in the repository (docs/adr/evidence; it closed the backlog row "Bring the decision
 * evidence kept only in %TEMP% into the repository"). Windows can clear its Temp folder, so evidence kept only there
 * can be lost:
 *
 * - an Accepted record that names a path under Temp (as `…/AppData/Local/Temp/…`, `%TEMP%`, `$env:TEMP` or
 *   `Temp/byway-…`) says in a Later note where that evidence is now, or that it was not kept;
 * - every relative link in the evidence files written to be read here, and in the records' Later notes, resolves;
 * - the evidence files hold no email address (the conversation records are extracted from a session transcript, and
 *   the probes from scratch folders);
 * - neither they nor the other folders copied in from Temp or written from sessions (F07's corpus,
 *   packages/runner/test/f07-corpus, and docs/reviews) hold a key-shaped string. The F07 pages are model-written sites
 *   with made-up contact details, pinned byte for byte (f07-corpus.test.ts), so the email check stops at the evidence.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeRedactor } from '../../packages/gateway/src/redact.ts';
import { ADR_DIR, isAccepted, parseRecord, recordNumber } from './adr-log.ts';
import { brokenLink, filesUnder, read, relativeLinks, REPO, section } from './docs.ts';

const EVIDENCE = `${ADR_DIR}/evidence`;
const NOTE = '**2026-10-18, the evidence kept only under Temp.**';
const TEMP = /AppData[\\/]Local[\\/]Temp|%TEMP%|\$env:TEMP\b|\bTemp[\\/]byway-/i;

const records = readdirSync(path.join(REPO, ADR_DIR))
  .map((name) => `${ADR_DIR}/${name}`)
  .filter((file) => recordNumber(file) !== undefined)
  .map((file) => ({ file, text: read(file) }));

/** A record's text before its Later notes, where a Temp path is a citation rather than a note about one. */
const cited = (text: string) => text.split(/^## Later notes\s*$/m)[0] ?? text;

/**
 * A line with its key-shaped strings replaced. The provider key shapes are the gateway's own: its redactor, holding no
 * key, removes only the shapes in redact.ts (Anthropic, OpenRouter, OpenAI, Google, fal's `<key id>:<secret>`, and
 * bearer tokens), so the two cannot drift apart. GitHub tokens (classic and fine-grained), Slack tokens and JWTs are
 * not provider keys, so the gateway does not look for them; they are added here.
 */
const providerShapes = makeRedactor({});
const OTHER_SHAPES = /(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?)/g;
/**
 * The external review's verification (docs/reviews/2026-10-08) quotes the gateway tests' stand-in key, a string shaped
 * like a key on purpose (packages/gateway/test/gateway.test.ts and keys.test.ts: a key-shaped string byway does not
 * hold passes through). It is the only one allowed.
 */
const STAND_INS = ['sk-proj-' + 'ABCDEFGHIJKLMNOPQRSTUVWX'];
const withoutStandIns = (line: string) => STAND_INS.reduce((l, s) => l.split(s).join('[stand-in]'), line);
const masked = (line: string) => providerShapes(withoutStandIns(line)).replace(OTHER_SHAPES, '[redacted]');
const keyShaped = (line: string) => masked(line) !== withoutStandIns(line);

describe('decision evidence kept in the repository', () => {
  it('each Accepted record that cites a path under Temp has a Later note saying where that evidence is now', () => {
    const citing = records.filter((r) => isAccepted(parseRecord(r.text).status) && TEMP.test(cited(r.text)));
    expect(citing.length).toBeGreaterThan(5);
    expect(citing.filter((r) => !(section(r.text, '## Later notes') ?? '').includes(NOTE)).map((r) => r.file)).toEqual([]);
  });

  it('every relative link in the evidence files and in the Later notes resolves', () => {
    // The conversation records and the D2 checks' report quote text as it was written, links and all, so their links
    // point from where their authors stood; the other files are written to be read here.
    const QUOTED = new Set([`${EVIDENCE}/conversation.md`, `${EVIDENCE}/conversation-continued.md`, `${EVIDENCE}/reports/d2-checks-2026-10-18.md`]);
    const evidence = filesUnder(EVIDENCE, /\.md$/).filter((file) => !QUOTED.has(file));
    expect(evidence.length).toBeGreaterThanOrEqual(4);
    const broken = [
      ...evidence.flatMap((file) => relativeLinks(read(file)).flatMap(({ target }) => brokenLink(file, target) ?? [])),
      ...records.flatMap((r) => relativeLinks(section(r.text, '## Later notes') ?? '').flatMap(({ target }) => brokenLink(r.file, target) ?? [])),
    ];
    expect(broken).toEqual([]);
  });

  it('the evidence files hold no email address', () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
    // A protobuf type URL ("@type.googleapis.com/…", in Temporal's errors as a test log printed them) is not an address.
    const typeUrl = (m: string) => m.endsWith('@type.googleapis.com');
    const hits = filesUnder(EVIDENCE, /./).flatMap((file) => (read(file).match(email) ?? []).filter((m) => !typeUrl(m)).map((m) => `${file}: ${m}`));
    expect(hits).toEqual([]);
  });

  it('the key check finds every shape it is meant to, and passes hashes and ids', () => {
    // Fakes, put together here so this file holds none whole.
    const hex = (n: number) => '0123456789abcdef'.repeat(8).slice(0, n);
    const fal = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}:${hex(32)}`;
    const fakes = {
      anthropic: `ANTHROPIC_API_KEY=sk-ant-api03-${'A'.repeat(40)}`,
      openai: `sk-proj-${'B'.repeat(40)}`,
      openrouter: `sk-or-v1-${hex(64)}`,
      google: `AIza${'C'.repeat(35)}`,
      fal: `FAL_KEY=${fal}`,
      falUpperCase: `Authorization: Key ${fal.toUpperCase()}`,
      bearer: `Authorization: Bearer ${'D'.repeat(24)}`,
      github: `ghp_${'E'.repeat(36)}`,
      githubFineGrained: `github_pat_${'F'.repeat(22)}_${'G'.repeat(59)}`,
      slack: `xoxb-${'1'.repeat(12)}`,
      jwt: `eyJ${'h'.repeat(20)}.eyJ${'p'.repeat(20)}.${'s'.repeat(20)}`,
    };
    expect(Object.entries(fakes).filter(([, line]) => !keyShaped(line)).map(([name]) => name)).toEqual([]);
    const plain = [`sha256:${hex(64)}`, `run ${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)} at 12:00`, `commit ${hex(40)}`, `the stand-in ${STAND_INS[0]}`];
    expect(plain.filter(keyShaped)).toEqual([]);
  });

  it('the evidence, F07’s corpus and the reviews hold no key-shaped string', () => {
    const folders = [EVIDENCE, 'packages/runner/test/f07-corpus', 'docs/reviews'];
    const files = folders.flatMap((folder) => filesUnder(folder, /./));
    expect(files.length).toBeGreaterThan(250);
    const hits = files.flatMap((file) =>
      read(file)
        .split('\n')
        .flatMap((line, i) => (keyShaped(line) ? [`${file}:${i + 1}: ${masked(line).slice(0, 200)}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
