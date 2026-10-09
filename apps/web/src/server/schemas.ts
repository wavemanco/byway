/** Request bodies accepted by the route handlers. Limits keep a stray paste from exhausting memory. */
import { z } from 'zod';
import { MAX_BUDGET_USD } from '../view/format.ts';
import { MAX_REF_IMAGE_BYTES, MAX_REF_TEXT, MAX_REFS, REF_IMAGE_TYPES } from '../view/refs.ts';

const text = (max: number) => z.string().max(max);
const ArtifactId = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'That example is not a stored file.');

export const ProblemInput = z.object({
  text: text(20_000).refine((t) => t.trim().length > 0, 'Describe what you are working on.'),
  attachments: z.array(z.object({ name: text(200), text: text(200_000) })).max(5).optional(),
  /** Library shortcut: start from this recipe instead of a recommendation. */
  recipeId: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
});

export const AnswersInput = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().max(64),
        answer: z.boolean(),
        confidence: z.number().min(0).max(1),
        rationale: text(500),
        setBy: z.enum(['intake', 'user']),
      }),
    )
    .max(20),
});

/**
 * POST /api/intakes/:id/recommend takes one of two commands (F14, ADR-0082): `{ answers }` re-routes with the chooser
 * answers as the person left them; `{ ensure: true }` is "Try again", which returns the intake's stored recommendation,
 * or makes and stores one when there is none. Anything else, an empty body included, is refused.
 */
export const RecommendInput = z.union([z.strictObject({ ensure: z.literal(true) }), AnswersInput]);

export const StartInput = z.object({
  intakeId: z.string().uuid(),
  /** A canonical recipe id; omitted to start the intake's composed recipe. */
  recipeId: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
  budgetUsd: z.number().positive().max(MAX_BUDGET_USD),
  routes: z.record(z.string().max(64), z.string().max(64)).optional(),
  /** "Examples you admire", already stored through /api/refs (StartRunInput.inputs.refs). */
  refs: z.array(ArtifactId).max(MAX_REFS, `Add at most ${MAX_REFS} examples.`).optional(),
  /**
   * The run's id, minted by the Recommendation screen once per Start (StartRunInput.runId; F03 P3): a Start sent twice
   * starts one run. A lowercase UUID, as crypto.randomUUID() makes, since it becomes the run's, its workflow's and its
   * memos' id.
   */
  runId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'That start did not arrive intact. Start the run again.')
    .optional(),
});

/** One example: pasted text, or an image as base64 (the bytes are checked against the type on the server). */
export const RefInput = z.union([
  z.object({ text: text(MAX_REF_TEXT).refine((t) => t.trim().length > 0, 'Paste an example first.') }),
  z.object({
    image: z.object({
      mediaType: z.enum(REF_IMAGE_TYPES, 'Add a PNG, JPEG or WebP image.'),
      base64: z
        .string()
        .max(Math.ceil((MAX_REF_IMAGE_BYTES * 4) / 3) + 4, 'That image is larger than 5 MB. Use a smaller one.')
        .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'That image did not arrive intact. Add it again.'),
    }),
  }),
]);

export const ResolutionInput = z.object({
  choice: z.array(z.string().max(200)).max(50).optional(),
  text: text(100_000).optional(),
  approved: z.boolean().optional(),
});

export const ControlInput = z.object({ action: z.enum(['pause', 'resume', 'cancel']) });

/** Settings' Spending records actions (ADR-0095): clear calls that may have been billed, or acknowledge a fault. */
export const SpendAction = z.union([z.strictObject({ clear: z.array(z.string().min(1).max(100)).min(1).max(500) }), z.strictObject({ acknowledge: z.number().int().positive() })]);

export const SettingsPatch = z.object({
  profileId: z.string().max(64).optional(),
  demoMode: z.boolean().optional(),
  showTechnicalNames: z.boolean().optional(),
  workspaceBudgetUsd: z.number().positive().max(MAX_BUDGET_USD).optional(),
});
