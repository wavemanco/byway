import type { ChooserAnswer, ChooserQuestion, Gateway, ProblemBrief, PromptRenderer } from '@byway/contracts';
import { problemSlot } from '@byway/prompts/pure';
import type { Recipe } from '@byway/recipe';
import { walk } from '@byway/recipe';
import { z } from 'zod';
import { askParsed, fromTemplate } from './ask.ts';
import { AdvisorError } from './errors.ts';
import { answerJson, ContractError, jsonSlot, oneLine } from './text.ts';

/**
 * The intake (product spec §4): a model reads the problem and proposes an answer, a confidence and a one-line rationale
 * for each chooser question, plus route choices the problem implies. It only proposes; routing is deterministic code.
 */

export const INTAKE_PROMPT = 'advisor.intake';
/** Reading a problem against seven yes/no questions is light work, so it runs at the mid tier (default rule 5). */
export const INTAKE_TIER = 'mid' as const;
export const INTAKE_MAX_OUTPUT_TOKENS = 4000;

/**
 * The `questions` slot: the chooser as a JSON array of {id, routesTo, text} (the shared convention). The template
 * puts it inside its own ```json fence, so the slot is the bare JSON; a pre-fenced value would nest two fences.
 */
export function questionsSlot(questions: readonly ChooserQuestion[]): string {
  return jsonSlot(questions.map((q) => ({ id: q.id, routesTo: q.routesTo, text: q.text })));
}

const IntakeAnswerSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.boolean(),
      confidence: z.number().finite(),
      rationale: z.string(),
    }),
  ),
  routes: z.record(z.string(), z.string()).optional(),
});

export interface IntakeResult {
  answers: ChooserAnswer[];
  routes: Record<string, string>;
}

/**
 * Parse an intake answer (spec §3.3 `advisor.intake`). Lenient where leniency is safe (confidence clamped to 0–1,
 * unknown question ids dropped, `routes` optional) and strict where it is not: the shape must match and at least one
 * known question must be answered.
 */
export function parseIntake(text: string, questions: readonly ChooserQuestion[]): IntakeResult {
  const parsed = IntakeAnswerSchema.safeParse(answerJson(text));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ContractError(`the JSON does not match {"answers":[{"questionId","answer","confidence","rationale"}],"routes":{}} (${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'invalid'})`);
  }
  const known = new Set(questions.map((q) => q.id));
  const answers = parsed.data.answers
    .filter((a) => known.has(a.questionId))
    .map((a): ChooserAnswer => ({
      questionId: a.questionId,
      answer: a.answer,
      confidence: Math.min(1, Math.max(0, a.confidence)),
      rationale: oneLine(a.rationale) || (a.answer ? 'The problem points this way.' : 'Nothing in the problem points this way.'),
      setBy: 'intake',
    }));
  if (answers.length === 0) throw new ContractError(`the answers name none of the questions (${[...known].join(', ')})`);
  return { answers, routes: parsed.data.routes ?? {} };
}

export interface IntakeDeps {
  gateway: Gateway;
  prompts: PromptRenderer;
  questions: readonly ChooserQuestion[];
}

/** Ask the intake model once (and once more with the parse error); an unreadable answer is an AdvisorError. */
export async function runIntake(deps: IntakeDeps, problem: ProblemBrief, opts: { workspaceId: string; profileId: string }): Promise<IntakeResult> {
  const prompt = deps.prompts.render(INTAKE_PROMPT, { problem: problemSlot(problem), questions: questionsSlot(deps.questions) });
  const asked = await askParsed(
    deps.gateway,
    {
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      purpose: INTAKE_PROMPT,
      tier: INTAKE_TIER,
      ...fromTemplate(prompt),
      maxOutputTokens: INTAKE_MAX_OUTPUT_TOKENS,
    },
    (text) => parseIntake(text, deps.questions),
  );
  if (!asked.ok) throw new AdvisorError('intake-unreadable', `The intake answer could not be read: ${asked.problem}.`);
  return asked.value;
}

/**
 * The route choices that apply to a recipe: only route nodes it has, and only branches those routes offer. A run
 * starts with these (StartRunInput.routes, keyed by route node id); anything else would be ignored or mis-route.
 */
export function routesFor(recipe: Recipe, proposed: Record<string, string>): Record<string, string> {
  const branches = new Map<string, Set<string>>();
  walk(recipe, (n) => {
    if (n.op === 'route') branches.set(n.id, new Set(n.branches.map((b) => b.name)));
  });
  return Object.fromEntries(Object.entries(proposed).filter(([id, choice]) => branches.get(id)?.has(choice) === true));
}
