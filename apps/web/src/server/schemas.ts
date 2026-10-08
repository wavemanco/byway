/** Request bodies accepted by the route handlers. Limits keep a stray paste from exhausting memory. */
import { z } from 'zod';
import { MAX_BUDGET_USD } from '../view/format.ts';

const text = (max: number) => z.string().max(max);

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

export const StartInput = z.object({
  intakeId: z.string().uuid(),
  /** A canonical recipe id; omitted to start the intake's composed recipe. */
  recipeId: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
  budgetUsd: z.number().positive().max(MAX_BUDGET_USD),
  routes: z.record(z.string().max(64), z.string().max(64)).optional(),
});

export const ResolutionInput = z.object({
  choice: z.array(z.string().max(200)).max(50).optional(),
  text: text(100_000).optional(),
  approved: z.boolean().optional(),
});

export const ControlInput = z.object({ action: z.enum(['pause', 'resume', 'cancel']) });

export const SettingsPatch = z.object({
  profileId: z.string().max(64).optional(),
  demoMode: z.boolean().optional(),
  workspaceBudgetUsd: z.number().positive().max(MAX_BUDGET_USD).optional(),
});
