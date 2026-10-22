// The real page VOICE activity (openCheckpoint + finishHumanStep through the runner's test helper, the runner's own
// Chromium as the arbiter). One opened question per page; each answer tried against it.
const H = await import('../helpers/voice-activity.ts');
const { playwrightPages } = await import('../../src/pages.ts');
export const C = await import('../../src/copy.ts');

export const PAGES = playwrightPages();
export type Outcome = { kind: 'STORED' | 'REFUSED' | 'NOTHING' | 'THREW'; offered: string[]; prompt?: string; message?: string; written?: string; ms?: number };
export type Session = { html: string; b: any; q: any; offered: string[]; prompt?: string; threw?: string; openMs: number };

export async function open(html: string, opts: { pages?: unknown } = {}): Promise<Session> {
  const b = await H.voiceBench([], opts.pages === null ? {} : { pages: (opts.pages as any) ?? PAGES });
  const t0 = Date.now();
  const s: Session = { html, b, q: undefined, offered: [], openMs: 0 };
  try {
    const run = await H.benchRun(b, 'web-page');
    const id = await H.putWork(b, 'web-page', html);
    s.q = await H.VoiceQuestion.open(b, run, id);
    s.offered = (s.q.offered ?? '').split('\n');
    s.prompt = s.q.prompt;
  } catch (e) {
    s.threw = `OPEN: ${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
  s.openMs = Date.now() - t0;
  return s;
}
export async function answer(s: Session, text: string): Promise<Outcome> {
  const { b, q, offered, prompt } = s;
  if (s.threw) return { kind: 'THREW', offered, message: s.threw };
  const t0 = Date.now();
  try {
    const r = await q.answer(text);
    if (!r.artifactId) return { kind: 'NOTHING', offered, prompt, ms: Date.now() - t0 };
    return { kind: 'STORED', offered, prompt, written: await b.store.artifacts.getText(r.artifactId), ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error;
    return { kind: err.constructor.name === 'AnswerRejected' ? 'REFUSED' : 'THREW', offered, prompt, message: `${err.constructor.name}: ${err.message}`, ms: Date.now() - t0 };
  }
}
export const close = (s: Session) => s.b.close();
export async function once(html: string, answerOf: (offered: string[]) => string[] | string, opts: { pages?: unknown } = {}): Promise<Outcome> {
  const s = await open(html, opts);
  try {
    if (s.threw) return { kind: 'THREW', offered: [], message: s.threw };
    const a = answerOf(s.offered);
    return await answer(s, Array.isArray(a) ? a.join('\n') : a);
  } finally {
    close(s);
  }
}
/** The page the arbiter refused: the same edit placed again, the lines the question did not offer left out. */
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
export const isArbiter = (m: string) => /could not put line|could not check|could not match/.test(m);
export const wrap = (body: string, head = '') => (/^<!doctype|^<html/i.test(body) ? body : `<!doctype html><html><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`);
export async function closeAct() {
  await PAGES.close();
}
