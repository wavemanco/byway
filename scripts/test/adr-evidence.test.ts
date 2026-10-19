/**
 * The decision evidence kept in the repository (docs/adr/evidence; backlog row "Bring the decision evidence kept only
 * in %TEMP% into the repository"). Windows can clear its Temp folder, so evidence kept only there can be lost:
 *
 * - an Accepted record that names a path under Temp says in a Later note where that evidence is now, or that it was
 *   not kept;
 * - every relative link in the evidence files written to be read here, and in the records' Later notes, resolves;
 * - the evidence files hold no email address and no key-shaped string (the conversation records are extracted from a
 *   session transcript, and the probes from scratch folders).
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADR_DIR, isAccepted, parseRecord, recordNumber } from './adr-log.ts';
import { brokenLink, filesUnder, read, relativeLinks, REPO, section } from './docs.ts';

const EVIDENCE = `${ADR_DIR}/evidence`;
const NOTE = '**2026-10-18, the evidence kept only under Temp.**';
const TEMP = /AppData[\\/]Local[\\/]Temp/i;

const records = readdirSync(path.join(REPO, ADR_DIR))
  .map((name) => `${ADR_DIR}/${name}`)
  .filter((file) => recordNumber(file) !== undefined)
  .map((file) => ({ file, text: read(file) }));

/** A record's text before its Later notes, where a Temp path is a citation rather than a note about one. */
const cited = (text: string) => text.split(/^## Later notes\s*$/m)[0] ?? text;

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

  it('the evidence files hold no email address and no key-shaped string', () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
    const key = /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|fal-[A-Za-z0-9_-]{16,})/g;
    const hits = filesUnder(EVIDENCE, /./).flatMap((file) => {
      const text = read(file);
      return [...(text.match(email) ?? []), ...(text.match(key) ?? [])].map((m) => `${file}: ${m}`);
    });
    expect(hits).toEqual([]);
  });
});
