import { composedRecipe, composeFromNearest, nearestRecipeIn, type RecipeJson } from './compose.ts';
import { fencedBlocks, oneLine, subjectOf, tagged, titleFrom } from './extract.ts';
import { seedOf } from './seed.ts';

/**
 * Demo-mode advisor answers. The intake reads the chooser questions out of the prompt (their ids are WP-A's data and
 * reach the model through WP-P's template), recognizes which configuration each routes to, and answers from keywords
 * in the problem, so the deterministic routing in @byway/advisor picks a sensible recipe.
 */

export interface IntakeQuestion {
  id: string;
  routesTo?: string;
  text?: string;
}

/**
 * Fallback questions mirroring 03-configurations "Choosing a configuration" (its flowchart labels Q0–Q5 and QF), used
 * only when the prompt names no questions the mock can read.
 */
export const FALLBACK_QUESTIONS: IntakeQuestion[] = [
  { id: 'Q0', routesTo: 'c2', text: 'Is the output a decision or option set, not an artifact?' },
  { id: 'Q1', routesTo: 'c7', text: 'An agent-written code change where bloat or reviewability is the pain?' },
  { id: 'Q2', routesTo: 'c5', text: 'Are specialist media the production medium?' },
  { id: 'Q3', routesTo: 'c1', text: 'Is it a rendered visual artifact (page, app, deck)?' },
  { id: 'QF', routesTo: 'c6a', text: 'Fiction or other invented-world writing you author yourself?' },
  { id: 'Q4', routesTo: 'c3', text: 'Bylined, brand or teaching content produced as a series?' },
  { id: 'Q5', routesTo: 'c6', text: "A signal of the sender's own effort or fit (application, proposal, grant, personal letter)?" },
];

/** Keywords that suggest each configuration, matched against the user's problem. */
const SIGNALS: Record<string, RegExp> = {
  c2: /\b(options|ideas|names|naming|brainstorm|alternatives|directions|concepts|which (direction|approach) to take)\b/gi,
  c7: /\b(code|diff|pull request|pr|refactor|function|bug|repo|commit|typescript|python|lint|tests?)\b/gi,
  c5: /\b(video|ad|advert|commercial|storyboard|reel|clip|animation|voice-?over|tiktok|youtube)\b/gi,
  c1: /\b(landing page|web ?page|website|site|homepage|app screen|ui|deck|slides|dashboard|interface|design)\b/gi,
  c6a: /\b(story|fiction|novel|chapter|short story|screenplay|script|poem|character)\b/gi,
  c3: /\b(series|newsletter|weekly|blog posts?|column|course|lessons?|episodes?)\b/gi,
  c6: /\b(cover letter|application|grant|proposal|personal statement|essay for|apology|thank-you|wedding speech|letter to)\b/gi,
  c4: /\b(memo|update|status|rca|root cause|prd|report|summary|email|brief|retro|incident)\b/gi,
};

/** The configuration a question routes to: its routesTo, or the configuration its wording describes. */
function targetOf(q: IntakeQuestion): string | undefined {
  if (q.routesTo) return q.routesTo.toLowerCase();
  const text = q.text ?? '';
  const known = FALLBACK_QUESTIONS.find((f) => f.text && text && similar(f.text, text));
  return known?.routesTo;
}

function similar(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const wa = words(a);
  const wb = words(b);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared >= 2;
}

/** Questions listed in the prompt: a JSON array (or `{questions:[…]}`) of objects with ids, else `id — routes to cN` lines. */
export function questionsIn(prompt: string): IntakeQuestion[] {
  const candidates = [...fencedBlocks(prompt, ['json', '']), ...(tagged(prompt, ['questions']) ? [tagged(prompt, ['questions']) as string] : [])];
  for (const block of candidates) {
    try {
      const parsed: unknown = JSON.parse(block);
      const list = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown }).questions;
      if (Array.isArray(list) && list.every((q) => q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string')) {
        return list.map((q) => {
          const o = q as { id: string; routesTo?: unknown; text?: unknown };
          return { id: o.id, ...(typeof o.routesTo === 'string' ? { routesTo: o.routesTo } : {}), ...(typeof o.text === 'string' ? { text: o.text } : {}) };
        });
      }
    } catch {
      // Not JSON; try the next block.
    }
  }
  const lines = [...prompt.matchAll(/^\s*[-*]?\s*\[?([A-Za-z][\w.-]*)\]?\s*(?:\((?:routes? to|→|->)\s*([a-z0-9]+)\)|(?:→|->)\s*([a-z0-9]+))\s*[:—-]?\s*(.*)$/gim)];
  if (lines.length) return lines.map((m) => ({ id: m[1] as string, routesTo: (m[2] ?? m[3]) as string, text: (m[4] ?? '').trim() }));
  return FALLBACK_QUESTIONS;
}

export interface IntakeAnswer {
  questionId: string;
  answer: boolean;
  confidence: number;
  rationale: string;
}

export function intake(prompt: string): { answers: IntakeAnswer[]; routes: Record<string, string> } {
  const problem = tagged(prompt, ['problem']) ?? subjectOf(prompt);
  const questions = questionsIn(prompt);
  const answers = questions.map((q): IntakeAnswer => {
    const target = targetOf(q);
    const re = target ? SIGNALS[target] : undefined;
    const hits = re ? [...new Set((problem.match(re) ?? []).map((h) => h.toLowerCase()))] : [];
    if (hits.length) {
      return { questionId: q.id, answer: true, confidence: hits.length > 1 ? 0.85 : 0.75, rationale: `The problem mentions ${hits.slice(0, 3).map((h) => `"${h}"`).join(', ')}.` };
    }
    return { questionId: q.id, answer: false, confidence: 0.8, rationale: 'Nothing in the problem points this way.' };
  });
  const routes: Record<string, string> = {};
  const visual = questions.some((q, i) => answers[i]?.answer === true && targetOf(q) === 'c1');
  if (visual) routes.entry = /\b(brand|guidelines?|reference|mood ?board|i know (exactly )?what i want)\b/i.test(problem) ? 'vision' : 'seed';
  return { answers, routes };
}

/**
 * advisor.compose and advisor.compose.repair: the nearest recipe in the prompt with the smallest valid change
 * (compose.ts), or, when the prompt carries none, a C4-shaped recipe varied by the problem's length.
 */
export function compose(prompt: string): RecipeJson {
  const problem = oneLine(tagged(prompt, ['problem']) ?? subjectOf(prompt));
  const id = `composed-${seedOf(problem).toString(16).padStart(8, '0').slice(0, 8)}`;
  const title = `Composed: ${titleFrom(problem, 'a reader-ready document')}`;
  const nearest = nearestRecipeIn(fencedBlocks(prompt, ['json', '']));
  if (nearest) return composeFromNearest(nearest, { id, title });
  const long = /\b(long|detailed|strategy|prd|rca|root cause|report|analysis|proposal|plan)\b/i.test(problem);
  return composedRecipe({ id, title, long });
}
