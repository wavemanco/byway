import { readFileSync } from 'node:fs';
const clone = process.argv[2]!;
const html = readFileSync(process.argv[3]!, 'utf8');
const { report } = await import(`file:///${clone}/scripts/price-report.ts`);
const post = html.replace(/(\$[\d.,]+(?: \/ [\d,]+ tokens per hour \(storage price\))?) through December 31, 2026\.<br>(\$[\d.,]+(?: \/ [\d,]+ tokens per hour \(storage price\))?) starting January 1, 2027\./g, '$2');
for (const iso of ['2027-01-05', '2027-03-01']) {
  const lines: string[] = [];
  await report({
    now: () => new Date(`${iso}T12:00:00Z`),
    print: (l: string) => lines.push(l),
    fetch: async (url: string) => url.startsWith('https://ai.google.dev/') ? { ok: true, status: 200, text: async () => post } : { ok: false, status: 404, text: async () => '' },
  });
  console.log('==', iso); for (const l of lines) console.log(l.slice(0, 300));
}
