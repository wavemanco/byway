import { readFileSync } from 'node:fs';
const clone = process.argv[2]!;
const html = readFileSync(process.argv[3]!, 'utf8');
const mode = process.argv[4] ?? 'live';
const { pricePages, pageReport, pageText } = await import(`file:///${clone}/scripts/price-report.ts`);
const google = pricePages().find((p: any) => p.label === 'Google');
let body = html;
if (mode === 'post2027') {
  body = html.replace(/(\$[\d.,]+(?: \/ [\d,]+ tokens per hour \(storage price\))?) through December 31, 2026\.<br>(\$[\d.,]+(?: \/ [\d,]+ tokens per hour \(storage price\))?) starting January 1, 2027\./g, '$2');
  console.log('remaining intro mentions:', (body.match(/December 31, 2026/g) ?? []).length);
}
console.log(JSON.stringify(pageReport(google, body), null, 1));
if (process.argv[5]) {
  const text = pageText(body, 'html');
  for (const m of text.matchAll(/gemini-3\.8-flash(?![\w-]|\.\d)/g)) console.log('---', m.index, JSON.stringify(text.slice(m.index, m.index + 760)));
}
