// The real page VOICE activity: openCheckpoint + finishHumanStep through the runner's test helper, the runner's own
// Chromium (playwrightPages) as the arbiter.
const H = await import('../helpers/voice-activity.ts');
const { playwrightPages } = await import('../../src/pages.ts');
export const C = await import('../../src/copy.ts');
export const PAGES = playwrightPages();
export type Outcome = { kind: 'STORED' | 'REFUSED' | 'NOTHING' | 'THREW'; message?: string; written?: string; ms: number };
export type Q = { html: string; b: any; q: any; offered: string[]; prompt: string; threw?: string; ms: number };
export async function open(html: string, pages: unknown = PAGES): Promise<Q> {
  const b = await H.voiceBench([], pages ? { pages: pages as any } : {});
  const t0 = Date.now();
  const s: Q = { html, b, q: undefined, offered: [], prompt: '', ms: 0 };
  try {
    const run = await H.benchRun(b, 'web-page');
    const id = await H.putWork(b, 'web-page', html);
    s.q = await H.VoiceQuestion.open(b, run, id);
    s.offered = (s.q.offered ?? '').split('\n');
    s.prompt = s.q.prompt ?? '';
  } catch (e) {
    s.threw = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
  s.ms = Date.now() - t0;
  return s;
}
export async function answer(s: Q, text: string): Promise<Outcome> {
  const t0 = Date.now();
  if (s.threw) return { kind: 'THREW', message: `OPEN ${s.threw}`, ms: 0 };
  try {
    const r = await s.q.answer(text);
    if (!r.artifactId) return { kind: 'NOTHING', ms: Date.now() - t0 };
    return { kind: 'STORED', written: await s.b.store.artifacts.getText(r.artifactId), ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error;
    return { kind: err.constructor.name === 'AnswerRejected' ? 'REFUSED' : 'THREW', message: `${err.constructor.name}: ${err.message}`, ms: Date.now() - t0 };
  }
}
export const close = (s: Q) => s.b.close();
export const isArbiter = (m: string) => /could not put line|could not check|could not match/.test(m);
/** The written page the arbiter refused (placed again, the lines not offered left out). */
export function placedAgain(html: string, offered: string[], ans: string): string | undefined {
  const full = C.deckLines(C.readPageCopy(html));
  const notOffered = new Set<number>();
  let j = 0;
  full.forEach((l: string, k: number) => {
    if (j < offered.length && offered[j] === l) j++;
    else notOffered.add(k);
  });
  const e = C.readPageEdit(C.readPageCopy(html, notOffered), ans);
  if (!e.ok) return undefined;
  const placed = C.placePageEdit(html, e, notOffered);
  return placed.problems.length ? undefined : placed.page;
}
export const wrap = (body: string, head = '', dir = '') => (/^<!doctype|^<html/i.test(body) ? body : `<!doctype html><html${dir}><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`);
export const closeAct = () => PAGES.close();
