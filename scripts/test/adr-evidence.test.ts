/**
 * The decision evidence kept in the repository (docs/adr/evidence; it closed the backlog row "Bring the decision
 * evidence kept only in %TEMP% into the repository"). Windows can clear its Temp folder, so evidence kept only there
 * can be lost:
 *
 * - an Accepted record that names a path under Temp (as `…/AppData/Local/Temp/…`, `%LOCALAPPDATA%\Temp`, `%TEMP%`,
 *   `%TMP%`, `$env:TEMP`, `$env:TMP`, `$TEMP/`, `${TEMP}/`, `$TMP/`, `${TMP}/`, Git Bash's `/tmp/` or `Temp/byway-…`) has
 *   the Later note headed as the one that says where that evidence is now, or that it was not kept, and its Later notes
 *   name each Temp path it cites, in backticks or bare, whole or by its last part (one range, ADR-0098's, is named as
 *   such; a bare path is read up to the next space, B-085). `%LOCALAPPDATA%` counts only with `Temp` after it,
 *   since byway's data folder is `%LOCALAPPDATA%\byway` (ADR-0066);
 * - every relative link in the evidence files written to be read here, and in the records' Later notes, resolves;
 * - the evidence files and the reviews (docs/reviews, where review packets are kept) hold no email address, written
 *   whole, split around its @ before a mail provider's name (with quotes, backticks, backslashes or spaces on either
 *   side, or a comma or plus sign between quoted parts), in words ("<local> at <provider> dot com", "period com" or
 *   ".com"), with its @ or dot written as an HTML entity (with or without its semicolon), as %40 or %2E or behind
 *   Markdown's backslash, or with zero-width characters in it (B1R2-CODE-4, the re-check of block 1's second fix round;
 *   the conversation records are extracted from a session transcript, the probes from scratch folders, and the reviews
 *   from what lenses and reviewers wrote);
 * - neither they nor the other folders copied in from Temp or written from sessions (F07's corpus,
 *   packages/runner/test/f07-corpus; the claims oracle, scripts/test/claims-oracle and its test; and docs/reviews) hold
 *   a key-shaped string. The F07 pages are model-written sites, contact details included (nobody checked them against
 *   real ones), pinned byte for byte (f07-corpus.test.ts), so the email check stops at the evidence and the reviews.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeRedactor } from '../../packages/gateway/src/redact.ts';
import { ADR_DIR, isAccepted, parseRecord, recordNumber } from './adr-log.ts';
import { brokenLink, filesUnder, read, relativeLinks, REPO, section } from './docs.ts';

const EVIDENCE = `${ADR_DIR}/evidence`;
const NOTE = '**2026-10-18, the evidence kept only under Temp.**';
const TEMP = /AppData[\\/]Local[\\/]Temp|%LOCALAPPDATA%[\\/]Temp\b|%TE?MP%|\$env:TE?MP\b|\$\{?TE?MP\}?[\\/]|(?<![\w.~-])\/tmp\/|\bTemp[\\/]byway-/i;

const records = readdirSync(path.join(REPO, ADR_DIR))
  .map((name) => `${ADR_DIR}/${name}`)
  .filter((file) => recordNumber(file) !== undefined)
  .map((file) => ({ file, text: read(file) }));

/** A record's text before its Later notes, where a Temp path is a citation rather than a note about one. */
const cited = (text: string) => text.split(/^## Later notes\s*$/m)[0] ?? text;

/**
 * The Temp paths a record's text before its Later notes cites, as it writes them: in backticks, or bare, as a run of
 * text with no space in it, without the brackets and punctuation around it (B-085).
 */
const tempPaths = (text: string) => {
  const quoted = [...cited(text).matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? '');
  const bare = cited(text)
    .replace(/`[^`\n]+`/g, ' ')
    .split(/\s+/)
    .map((s) => s.replace(/^[("'[]+/, '').replace(/[.,;:)"'\]]+$/, ''));
  return [...new Set([...quoted, ...bare].filter((p) => TEMP.test(p)))];
};
const lastPart = (p: string) => p.split(/[\\/]/).filter((s) => s !== '').at(-1) ?? p;
/** Whether a record's Later notes name a cited path: whole, or by its last part (a file or a folder's name). */
const named = (notes: string, p: string) => notes.includes(p) || notes.includes(lastPart(p));
/**
 * Cited paths a note names only inside a range, with the range: ADR-0098's note covers rounds 6 to 11 as
 * "`…/semantics-2-r6/` to `semantics-2-r11/`", so rounds 7 to 10 are not named one by one (the backlog row "The
 * Temp-evidence check passes a record on its note's heading alone").
 */
const IN_A_RANGE: Readonly<Record<string, { range: string; parts: readonly string[] }>> = {
  '0098': { range: '/semantics-2-r6/` to `semantics-2-r11/`', parts: ['semantics-2-r7', 'semantics-2-r8', 'semantics-2-r9', 'semantics-2-r10'] },
};

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
 * hold passes through). It is the only one allowed, and only on its own: a longer key-shaped string that starts or ends
 * with it is checked whole.
 */
const STAND_IN = 'sk-proj-' + 'ABCDEFGHIJKLMNOPQRSTUVWX';
// Alone: no character a key or token is made of on either side (a JWT's '.', base64's '+' and '/', URL-safe '~').
const STAND_IN_ALONE = new RegExp(`(?<![A-Za-z0-9._~+/-])${STAND_IN}(?![A-Za-z0-9._~+/-])`, 'g');
const withoutStandIns = (line: string) => line.replace(STAND_IN_ALONE, '[stand-in]');
const masked = (line: string) => providerShapes(withoutStandIns(line)).replace(OTHER_SHAPES, '[redacted]');
const keyShaped = (line: string) => masked(line) !== withoutStandIns(line);

/** An address as written whole: a local part, an @ and a domain with a dot. */
const WHOLE_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
// A protobuf type URL ("@type.googleapis.com/…", in Temporal's errors as a test log printed them) is not an address.
const typeUrl = (m: string) => m.endsWith('@type.googleapis.com');
/**
 * An address split so that the whole shape misses it, as a lens's note once wrote one ("<local part>@/<provider>",
 * SEC-PRIV-1, the check of the first block): a local part, then quotes, backticks, backslashes, spaces or nothing, an @
 * (or a full-width one), and slashes, spaces, quotes, backticks, backslashes, commas, plus signs or nothing (so the
 * search terms "'<local part>@' / '<provider>'", "'<local part>@', '<provider>.com'", "'<local part>' @ '<provider>'"
 * and "'<local part>@' + '<provider>'", and a local part and domain each in backticks, are found too), or an "at" in
 * brackets, and then a mail provider's name; or "<local part> at <provider>" in words, followed by "dot <ending>",
 * "period <ending>" or ".<ending>" with no space after the dot, so a sentence that ends on a provider's name ("run at
 * live. Then") is not one (B1R2-CODE-4 and B1R2-CODE-8, the re-check of block 1's second fix round). Only these
 * providers' names count, so a package scope (`@playwright/test`), a version (`rxjs@7.8.2`) or a type URL is not one; an
 * address at another domain without its dot is not seen.
 */
const PROVIDERS = 'gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|protonmail|proton|aol|gmx|zoho|yandex|fastmail|tutanota';
const SPLIT_ADDRESS = [
  new RegExp(`[A-Za-z0-9._%+-]+[\\s\\\\'"\`]*[@\\uFF20][\\s/\\\\'"\`,+]*(?:${PROVIDERS})\\b`, 'gi'),
  new RegExp(`[A-Za-z0-9._%+-]+\\s*(?:\\[at\\]|\\(at\\)|\\{at\\}|<at>)\\s*(?:${PROVIDERS})\\b`, 'gi'),
  new RegExp(`[A-Za-z0-9._%+-]+\\s+at\\s+(?:${PROVIDERS})(?:\\s+(?:dot|period)\\s+|\\s*\\.)[A-Za-z]{2,}\\b`, 'gi'),
];
const codePoint = (n: number, as: string) => (n <= 0x10ffff ? String.fromCodePoint(n) : as);
/**
 * A text with the escapes undone that a renderer shows as "@" or ".": HTML's numeric entities, `&commat;` and
 * `&period;` (GitHub shows "jane.doe&#64;example.com" in a .md file as the whole address), and URL encoding's %40 and
 * %2E (RC-5, the re-check of block 1's fix round); a numeric entity without its semicolon, read as a browser reads one
 * (its digits as far as they go), and Markdown's backslash escapes `\@` and `\.` (GitHub shows "jane.doe\@example.com"
 * as the whole address); and with the zero-width characters dropped that a renderer shows as nothing (U+200B to U+200D,
 * U+2060 and U+FEFF), so an @ followed by one is still seen (B1R2-CODE-4, the re-check of block 1's second fix round).
 * An entity past Unicode's end, with or without its semicolon, is left as written.
 */
const unescaped = (text: string): string =>
  text
    .replace(/&#(\d{1,8});?/g, (m, d: string) => codePoint(Number(d), m))
    .replace(/&#x([0-9a-f]{1,8});?/gi, (m, h: string) => codePoint(Number.parseInt(h, 16), m))
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/%40/g, '@')
    .replace(/%2e/gi, '.')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\\([@.])/g, '$1');
/** The email addresses a text holds, whole or split, as written once its escapes are undone. */
const emailsIn = (text: string): string[] => {
  const plain = unescaped(text);
  return [...(plain.match(WHOLE_ADDRESS) ?? []).filter((m) => !typeUrl(m)), ...SPLIT_ADDRESS.flatMap((re) => plain.match(re) ?? [])];
};
/**
 * Address-shaped strings in the reviews that are not addresses, each named whole with its file, so any other is still
 * found: a prompt template's name ("<template>@<medium>.md") and the sign-in part of a URL in a test of fal's media hosts,
 * both in the external review's verification. Built here, so this file holds neither whole.
 */
const VERIFICATION = 'docs/reviews/2026-10-08-external-review-verification.md';
const NOT_ADDRESSES: readonly { file: string; text: string }[] = [
  { file: VERIFICATION, text: ['helper.asset.briefs', 'prose.md'].join('@') },
  { file: VERIFICATION, text: ['pw', 'v3.fal.media'].join('@') },
];
const notAnAddress = (file: string, m: string) => NOT_ADDRESSES.some((n) => n.file === file && n.text === m);

describe('decision evidence kept in the repository', () => {
  it('each Accepted record that cites a path under Temp has a Later note saying where that evidence is now', () => {
    const citing = records.filter((r) => isAccepted(parseRecord(r.text).status) && TEMP.test(cited(r.text)));
    expect(citing.length).toBeGreaterThan(5);
    expect(citing.filter((r) => !(section(r.text, '## Later notes') ?? '').includes(NOTE)).map((r) => r.file)).toEqual([]);
  });

  it('that note names each Temp path the record cites, in backticks or bare, whole or by its last part, but for the range named here', () => {
    const accepted = records.filter((r) => isAccepted(parseRecord(r.text).status));
    expect(accepted.flatMap((r) => tempPaths(r.text)).length).toBeGreaterThan(10);
    const unnamed = accepted.flatMap((r) => {
      const notes = section(r.text, '## Later notes') ?? '';
      const ranged = IN_A_RANGE[recordNumber(r.file) ?? ''];
      return tempPaths(r.text)
        .filter((p) => !named(notes, p) && !(ranged && notes.includes(ranged.range) && ranged.parts.includes(lastPart(p))))
        .map((p) => `${r.file}: ${p}`);
    });
    expect(unnamed).toEqual([]);
    // Each range still covers paths its record cites and its note does not name one by one, so none is out of date.
    for (const [n, { parts }] of Object.entries(IN_A_RANGE)) {
      const r = records.find((x) => recordNumber(x.file) === n);
      const notes = section(r?.text ?? '', '## Later notes') ?? '';
      expect(tempPaths(r?.text ?? '').filter((p) => !named(notes, p)).map(lastPart), `ADR-${n}`).toEqual(parts);
    }
    // The note's heading alone names no path, in backticks or bare (B-085).
    const record = '## Context\n\nIt ran in `C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/a-probe/`, and (C:/Users/arvik/AppData/Local/Temp/byway-fixes/b-probe.json, its brief).\n\n## Later notes\n\n- **2026-10-18, the evidence kept only under Temp.**\n';
    expect(tempPaths(record).filter((p) => !named(section(record, '## Later notes') ?? '', p))).toEqual(['C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/a-probe/', 'C:/Users/arvik/AppData/Local/Temp/byway-fixes/b-probe.json']);
  });

  it('reads each spelling of a Temp path that the header names, and not a word that only starts like one, nor byway’s data folder', () => {
    const spellings = [
      ...['C:/Users/arvik/AppData/Local/Temp/x', 'C:\\Users\\arvik\\AppData\\Local\\Temp\\x', '%LOCALAPPDATA%\\Temp\\x', '%LOCALAPPDATA%/Temp/x'],
      ...['%TEMP%\\x', '%TMP%\\x', '$env:TEMP\\x', '$env:TMP\\x', '$TEMP/x', '${TEMP}/x', '$TMP/x', '${TMP}/x', '/tmp/x', 'in /tmp/byway-x', 'Temp/byway-fixes'],
    ];
    expect(spellings.filter((s) => !TEMP.test(s))).toEqual([]);
    expect(['$env:TEMPLATE', '$TEMPLATE/x', '$TMPDIR/x', 'a temp file', 'Temporal/byway-x', 'docs/tmp/x', 'C:/Users/arvik/tmp/x'].filter((s) => TEMP.test(s))).toEqual([]);
    // byway's data folder (ADR-0066) is under %LOCALAPPDATA% too, and is not Temp.
    expect(['%LOCALAPPDATA%\\byway', '%LOCALAPPDATA%\\byway\\byway.sqlite', '%LOCALAPPDATA%/byway', '%LOCALAPPDATA%\\Templates\\x'].filter((s) => TEMP.test(s))).toEqual([]);
  });

  it('every relative link in the evidence files and in the Later notes resolves', () => {
    // The conversation records and the reports of the D2, B1 and Block 1 checks (Block 1's later checks among them) quote
    // text as it was written, links and all, so their links point from where their authors stood; the other files are
    // written to be read here.
    const QUOTED = new Set([
      `${EVIDENCE}/conversation.md`,
      `${EVIDENCE}/conversation-continued.md`,
      `${EVIDENCE}/reports/d2-checks-2026-10-18.md`,
      `${EVIDENCE}/reports/b1-checks-2026-10-21.md`,
      `${EVIDENCE}/reports/block1-check-2026-10-22.md`,
      `${EVIDENCE}/reports/block1-rechecks-2026-10-22.md`,
    ]);
    const evidence = filesUnder(EVIDENCE, /\.md$/).filter((file) => !QUOTED.has(file));
    expect(evidence.length).toBeGreaterThanOrEqual(4);
    const broken = [
      ...evidence.flatMap((file) => relativeLinks(read(file)).flatMap(({ target }) => brokenLink(file, target) ?? [])),
      ...records.flatMap((r) => relativeLinks(section(r.text, '## Later notes') ?? '').flatMap(({ target }) => brokenLink(r.file, target) ?? [])),
    ];
    expect(broken).toEqual([]);
  });

  it('the evidence files and the reviews hold no email address', () => {
    const files = [...filesUnder(EVIDENCE, /./), ...filesUnder('docs/reviews', /./)];
    expect(files).toContain('docs/reviews/2026-10-21-review-packet.md');
    const hits = files.flatMap((file) => emailsIn(read(file)).flatMap((m) => (notAnAddress(file, m) ? [] : [`${file}: ${m}`])));
    expect(hits).toEqual([]);
    // Each string named as not an address is still in its file, so none is out of date.
    expect(NOT_ADDRESSES.filter((n) => !emailsIn(read(n.file)).includes(n.text))).toEqual([]);
  });

  it('the email check also finds an address split so the whole-address shape misses it, or with its @ escaped, and passes type URLs and ordinary text', () => {
    // Fakes, put together here so this file holds none whole (the check of the first block found a real one written
    // "<local part>@/<provider>" in a lens's note, SEC-PRIV-1).
    const local = ['jane', 'doe'].join('.');
    const at = '@';
    const mail = 'hot' + 'mail';
    const split = {
      slash: `no owner email (${local}${at}/${mail})`,
      backslash: `${local}${at}\\${mail}`,
      spaces: `${local} ${at} ${mail}`,
      spaceAfter: `${local}${at} ${'out' + 'look'}`,
      noDomain: `${local}${at}${'pro' + 'ton'}`,
      bracketed: `${local} [at] ${mail} [dot] com`,
      parenthesised: `${local}(at)${'ic' + 'loud'}`,
      inWords: `${local} at ${'ya' + 'hoo'} dot com`,
      fullWidthAt: `${local}＠/${mail}`,
      whole: `${local}${at}${mail}.com`,
      // RC-5, the re-check of block 1's fix round: these got past the check before it.
      atAndDot: `${local} at ${mail}.com`,
      quotedSearchTerms: `'${local}${at}' / '${mail}'`,
      htmlEntity: `${local}&#64;${'ex' + 'ample'}.com`,
      htmlHexEntity: `${local}&#x40;${mail}.com`,
      htmlNamedEntities: `${local}&commat;${mail}&period;com`,
      urlEncoded: `${local}%40${'ex' + 'ample'}%2Ecom`,
      // B1R2-CODE-4, the re-check of block 1's second fix round: these got past the check before it.
      markdownEscapedAt: `${local}\\${at}${'ex' + 'ample'}.com`,
      markdownEscapedDot: `${local}${at}${'ex' + 'ample'}\\.com`,
      commaBetweenQuoted: `'${local}${at}', '${mail}.com'`,
      plusBetweenQuoted: `'${local}${at}' + '${mail}'`,
      quotedBeforeAt: `'${local}' ${at} '${mail}'`,
      backticked: `\`${local}\`${at}\`${mail}.com\``,
      backslashBeforeAt: `${local}\\\\${at}${mail}`,
      entityNoSemicolon: `${local}&#64${'ex' + 'ample'}.com`,
      hexEntityNoSemicolon: `${local}&#x40${mail}.com`,
      inWordsPeriod: `${local} at ${mail} period com`,
      zeroWidthAfterAt: `${local}${at}\u200B${mail}.com`,
      wordJoinerBeforeAt: `${local}\u2060${at}${mail}.com`,
      zeroWidthInDomain: `${local}${at}ex\u200Cam\u200Dple\uFEFF.com`,
    };
    expect(Object.entries(split).filter(([, text]) => emailsIn(text).length === 0).map(([name]) => name)).toEqual([]);
    const plain = [
      `\\x1aB\\n${at}type.googleapis.com/temporal.api.failure.v1.ApplicationFailureInfo`,
      `node_modules\\.pnpm\\${at}temporalio+worker${at}1.24.0`,
      `import { test } from '${at}playwright/test'; rxjs${at}7.8.2, HEAD${at}{1}, "$${at}", ok${at}1084`,
      `the ${mail} and Outlook apps; look at ${mail} later; meet at the office`,
      // An encoded package scope, and an entity past Unicode's end, with or without its semicolon, which is left as written.
      `https://registry.npmjs.org/%40playwright%2Ftest, &#99999999; and &#x110000;, &#99999999 and &#x110000`,
      // A sentence that ends on a provider's name is not an address in words: no space after the dot (B1R2-CODE-8).
      `run at ${'li' + 've'}. Then we looked at ${'Out' + 'look'}. The end`,
      // A Markdown-escaped package scope, and a path's escaped dot.
      `\\${at}playwright/test, C:\\Users\\x\\.worktrees\\fx`,
    ];
    expect(plain.filter((text) => emailsIn(text).length > 0)).toEqual([]);
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
      bearerLowerCase: `authorization: bearer ${'d'.repeat(24)}`,
      falUrlEncoded: `FAL_KEY=${fal.replace(':', '%3A')}`,
      longerThanTheStandIn: `${STAND_IN}${'H'.repeat(40)}`,
      endingInTheStandIn: `AIza123${STAND_IN}`,
      jwtEndingInTheStandIn: `eyJ${'h'.repeat(20)}.${STAND_IN}`,
      github: `ghp_${'E'.repeat(36)}`,
      githubFineGrained: `github_pat_${'F'.repeat(22)}_${'G'.repeat(59)}`,
      slack: `xoxb-${'1'.repeat(12)}`,
      jwt: `eyJ${'h'.repeat(20)}.eyJ${'p'.repeat(20)}.${'s'.repeat(20)}`,
    };
    expect(Object.entries(fakes).filter(([, line]) => !keyShaped(line)).map(([name]) => name)).toEqual([]);
    const plain = [`sha256:${hex(64)}`, `run ${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)} at 12:00`, `commit ${hex(40)}`, `the stand-in ${STAND_IN}`, `quoting '${STAND_IN}' (not a held key)`];
    expect(plain.filter(keyShaped)).toEqual([]);
  });

  it('the evidence, F07’s corpus, the claims oracle and the reviews hold no key-shaped string', () => {
    const folders = [EVIDENCE, 'packages/runner/test/f07-corpus', 'scripts/test/claims-oracle', 'docs/reviews'];
    const files = [...folders.flatMap((folder) => filesUnder(folder, /./)), 'scripts/test/claims-oracle.test.ts'];
    expect(files.length).toBeGreaterThan(250);
    const hits = files.flatMap((file) =>
      read(file)
        .split('\n')
        .flatMap((line, i) => (keyShaped(line) ? [`${file}:${i + 1}: ${masked(line).slice(0, 200)}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
