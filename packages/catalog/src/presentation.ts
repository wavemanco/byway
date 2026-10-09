import type { RecipePresentation } from '@byway/contracts';
import type { BlockCode } from '@byway/protocol';
import { walk, walkNode, type Recipe, type Stage } from '@byway/recipe';
import { c1 } from './c1.ts';
import { c2 } from './c2.ts';
import { c3 } from './c3.ts';
import { c4 } from './c4.ts';
import { c5 } from './c5.ts';
import { c6 } from './c6.ts';
import { c6a } from './c6a.ts';
import { c7 } from './c7.ts';

/**
 * The plain-language face of the eight protocol configurations (product spec §5): no protocol jargon by default;
 * "Show technical names" reveals the codes.
 *
 * The copy says what each step does, never what it achieves (CR11, ADR-0054): every recipe is untested, and the
 * protocol's success criteria ("clearly different drafts", "the ask in the first two lines", "a smaller diff") are what
 * the studies test, so stating them as results would be an efficacy claim. A step this version does not perform is
 * described as not performed (ADR-0069's honest skips), not as if it ran.
 *
 * The copy is written by hand, but it cannot drift from the recipes: each shown step lists the recipe nodes it
 * covers, and its stage and "who does it" are computed from those nodes. Any human part makes a step your turn,
 * since that is where the run waits for you. Every step and pick of a recipe is covered exactly once, and so is every
 * operator that emits events of its own (tested); each shown step lists those ids as `stepIds`, so a run event for
 * any node can be labelled with `presentedStepFor` (or `stepPresentation` by recipe id).
 */

type PlainStage = RecipePresentation['stages'][number]['stage'];
type Who = RecipePresentation['stages'][number]['steps'][number]['who'];
export type PresentedStep = RecipePresentation['stages'][number]['steps'][number] & { stage: PlainStage };

/** Stage names of spec §5. */
export const STAGE_NAMES: Readonly<Record<Stage['stage'], PlainStage>> = { D1: 'Explore', D2: 'Refine', D3: 'Finish' };

/** Plain block names of spec §5, used in step labels. */
export const BLOCK_NAMES: Readonly<Record<BlockCode, string>> = {
  SEED: 'Random spark',
  VISION: 'Your direction',
  CRITIC: 'Outside critique',
  ASSET: 'Custom imagery',
  RELAY: 'Motion',
  CUT: 'Trim',
  TELLS: 'Cliché sweep',
  VOICE: 'Your words',
};

interface StepCopy {
  label: string;
  explainer: string;
  /** Ids of the recipe steps and picks this shown step stands for. */
  covers: string[];
  /**
   * Operators (loops, optionals…) whose body spans several shown steps but whose checkpoint and iterations belong to
   * this one: the author's loop is "Your draft" (you decide when it is done), an optional is the step it asks about.
   * Operators whose body lies inside one shown step map to it without being listed.
   */
  operators?: string[];
}

interface Copy {
  recipe: Recipe;
  name: string;
  promise: string;
  bestFor: string[];
  steps: StepCopy[];
}

/** Steps shared word for word by several configurations. */
const yourDraft = (covers: string[] = ['write', 'render']): StepCopy => ({
  label: 'Your draft',
  explainer: 'Your turn: write or revise the whole draft yourself. Each round, three AI readers go over it, and you decide when it is done.',
  covers,
  operators: ['author-loop'],
});
const trimByYou = (explainer: string): StepCopy => ({ label: 'Trim', explainer, covers: ['cut-render', 'cut', 'apply-cut'] });
const keepOrRevert: StepCopy = {
  label: 'Keep or revert',
  explainer: 'Your turn: compare the version before the swaps with the one after, and keep whichever you prefer.',
  covers: ['compare-render', 'tells-compare'],
};
/**
 * The swapping cliché sweep (C1, C3, C4, C5, C7). The person decides each find on its own (01 TELLS step 4, "decide
 * per instance"): the runner asks which finds to swap before the swap step runs (convention C2), and only those are
 * swapped.
 */
const clicheSweep = (finds: string): StepCopy => ({
  label: 'Cliché sweep',
  explainer: `A fresh reviewer lists the ${finds} it finds, each with an alternative; you choose which ones, if any, the AI swaps.`,
  covers: ['tells-render', 'tells-sweep', 'apply-swaps'],
});
/**
 * A critic whose family knob is 'other' (convention C3): the profile's reviewer from another provider family when its
 * key is set up, otherwise a fresh session of the same family, and the run says which.
 */
const OTHER_FAMILY = 'A reviewer from another AI family (or, when none is set up, a fresh session of the same AI)';
const obviousCheck = (explainer: string): StepCopy => ({ label: 'Obvious-answer check', explainer, covers: ['vanilla-build', 'vanilla-flag'] });

const COPY: readonly Copy[] = [
  {
    recipe: c1,
    name: 'Landing Page Studio',
    promise: 'Four page drafts, each started from its own random spark and revised against an outside critique; you pick one and rewrite its words yourself.',
    bestFor: ['Landing pages', 'Product and marketing pages', 'Brand and campaign pages'],
    steps: [
      {
        label: 'Random spark',
        explainer:
          'Four drafts start in separate sessions, each told to take its creative direction from its own random string. In this version every draft starts this way: you cannot give your own visual direction or a reference up front.',
        covers: ['seed-build'],
      },
      {
        label: 'Outside critique',
        explainer:
          'A separate reviewer looks at each draft on desktop and mobile and names the biggest gaps; the AI fixes them, round after round, until the draft clears a quality bar the reviewer never sees or five rounds pass.',
        covers: ['render', 'critic', 'critic-fix'],
      },
      {
        label: 'Custom imagery',
        explainer: 'If you call a design plain, the AI makes images for it and puts them in the page. Nothing checks the fit for you: you see the page with its images when you pick.',
        covers: ['asset', 'asset-verify'],
      },
      { label: 'Pick one', explainer: 'Your turn: choose the draft to finish.', covers: ['pick-one'] },
      trimByYou('Your turn: list what the page could lose, and the AI removes it.'),
      clicheSweep('stock design patterns'),
      keepOrRevert,
      { label: 'Your words', explainer: 'Your turn: rewrite every line of copy in your own voice.', covers: ['voice'] },
      {
        label: 'Outside critique: defect check',
        explainer: 'A last look for broken layout and leftovers. It lists defects only, makes no taste calls and changes nothing: you see the list with the result.',
        covers: ['final-render', 'critic-check'],
      },
    ],
  },
  {
    recipe: c2,
    name: 'Idea Generator',
    promise: 'Options sketched in separate sessions from random sparks, near-duplicates merged and the obvious ones flagged, laid out side by side for you to choose from.',
    bestFor: ['Strategy options', 'Concepts and campaign ideas', 'Naming', 'Research ideas'],
    steps: [
      {
        label: 'Random spark',
        explainer: 'Twelve separate sessions, each nudged by its own random spark, sketch one option each.',
        covers: ['seed-option'],
      },
      {
        label: 'Merge near-duplicates',
        explainer: 'The AI merges options that say the same thing into one.',
        covers: ['dedupe', 'pool-render'],
      },
      obviousCheck('Three plain sessions with no spark show what anyone would get; options that match them are flagged.'),
      {
        label: 'Outside critique',
        explainer: 'A separate reviewer ranks the options against what already exists. It only adds notes; nothing is dropped on its say-so.',
        covers: ['critic'],
      },
      {
        label: 'Your direction',
        explainer: 'Your turn: say what pulls you and what to avoid. The AI sharpens your favourites into one to three briefs, over up to three rounds.',
        covers: ['react', 'sharpen'],
      },
      {
        label: 'Option map',
        explainer: 'The AI lays out every option with its notes, and your chosen briefs.',
        covers: ['option-map'],
      },
      { label: 'Your words', explainer: "Your turn: put the option map's names and pitches in your own words, starting with the option you chose.", covers: ['voice'] },
      {
        label: 'Custom imagery',
        explainer: 'If you want them, rough mood boards for the chosen option. They stay rough and stay out of the decision.',
        covers: ['mood-boards'],
      },
    ],
  },
  {
    recipe: c3,
    name: 'Series Writer',
    promise: 'One piece of your series per run: angles from random sparks, your own point, a draft revised against an outside critique, and every line rewritten by you.',
    bestFor: ['Newsletters and bylined posts', 'Brand articles published regularly', 'Teaching units'],
    steps: [
      {
        label: 'Random spark',
        explainer: 'Six separate sessions, each with its own random spark, propose an angle for the piece.',
        covers: ['seed-angle', 'cards-render'],
      },
      obviousCheck('Angles that plain sessions with no spark also come up with are flagged.'),
      { label: 'Pick an angle', explainer: 'Your turn: choose the angle to write.', covers: ['pick-angle'] },
      {
        label: 'Your direction',
        explainer: 'Your turn: state the point of the piece from your own experience, data or classroom, before any draft exists.',
        covers: ['thesis'],
      },
      {
        label: 'First draft',
        explainer: 'Your turn: let the AI draft from your point, or write the first draft yourself.',
        covers: ['ai-draft', 'own-draft'],
      },
      {
        label: 'Outside critique',
        explainer: `${OTHER_FAMILY} ranks the draft, unsigned, among your series' best pieces and leading writers in your field, and names the gaps; the AI revises until the draft reaches a rank the reviewer never sees, scaled to how many examples you gave, or three rounds pass.`,
        covers: ['render', 'critic', 'revise'],
      },
      {
        label: 'Custom imagery',
        explainer: 'If you want one, the AI makes a header image for the piece. Charts computed from your data are not made in this version.',
        covers: ['asset'],
      },
      trimByYou('Your turn: list what the piece could lose, and the AI removes it.'),
      clicheSweep('stock phrasing, structure and platform habits'),
      keepOrRevert,
      { label: 'Your words', explainer: 'Your turn: rewrite every line in your own voice.', covers: ['voice'] },
    ],
  },
  {
    recipe: c4,
    name: 'Memo Polish',
    promise: 'A memo drafted from your one-line ask, read as its recipient would read it, trimmed by you and finished in your own words.',
    bestFor: ['Internal memos and updates', 'Product requirement documents', 'Incident write-ups'],
    steps: [
      {
        label: 'Framings to react to',
        explainer: 'If you want them, the AI offers five framings to react to first.',
        covers: ['framings'],
      },
      {
        label: 'Your direction',
        explainer: 'Your turn: one line on the decision or ask, and the one point the reader must take away.',
        covers: ['vision-lite'],
      },
      { label: 'First draft', explainer: 'The AI drafts the memo from your line.', covers: ['draft'] },
      {
        label: 'Outside critique',
        explainer:
          'For anything longer than about 300 words, a reviewer reads as the recipient ("Can I act on this in two minutes?") next to strong internal documents, and the AI revises, up to two rounds.',
        covers: ['render', 'recipient', 'revise'],
      },
      trimByYou('Your turn: cut to the length the reader will give it; the AI removes what you list.'),
      clicheSweep('memo clichés'),
      keepOrRevert,
      {
        label: 'Your words',
        explainer: 'Your turn: read every line and rewrite the key ones yourself: the bottom line, the ask, the judgment calls and the sign-off.',
        covers: ['voice'],
      },
      {
        label: 'Sign off the facts',
        explainer: 'For fact-heavy documents, you go through every number, date, name and causal claim and correct any that is wrong; your corrections replace them in the memo.',
        covers: ['claim-sign-off'],
      },
    ],
  },
  {
    recipe: c5,
    name: 'Ad Video Chain',
    promise: 'A short ad built shot by shot by specialist image and video models, around a script you lock before production.',
    bestFor: ['Ad creative', 'Product launch videos', 'Short social video'],
    steps: [
      {
        label: 'Random spark',
        explainer: 'Eight separate sessions, each with its own random spark, propose a creative territory.',
        covers: ['seed-territory'],
      },
      {
        label: 'Merge near-duplicates',
        explainer: 'The AI merges territories that say the same thing into one.',
        covers: ['dedupe', 'territories-render'],
      },
      obviousCheck('Territories that plain sessions with no spark also come up with are flagged.'),
      { label: 'Shortlist', explainer: 'Your turn: shortlist up to three territories.', covers: ['shortlist'] },
      {
        label: 'Your direction',
        explainer: 'Your turn: as creative director, give the brief, the shot list and the style you want.',
        covers: ['direction'],
      },
      {
        label: 'Concepts',
        explainer: 'The AI builds a concept for each shortlisted territory, under your direction.',
        covers: ['concept'],
      },
      { label: 'Pick a concept', explainer: 'Your turn: choose the concept to produce.', covers: ['pick-concept'] },
      {
        label: 'Your words: the script',
        explainer: 'Your turn: write the voice-over script and every spoken claim. From here on it is locked, and nothing changes it.',
        covers: ['vo-script'],
      },
      {
        label: 'Custom imagery',
        explainer: 'The AI makes the key frames, product shots and style frames the shots will start from.',
        covers: ['anchor-frames'],
      },
      {
        label: 'Motion',
        explainer:
          'Shot by shot, each clip starts from the last frame of the one before. Each clip’s last frame is checked for visible defects against the frame it started from, and the clip is remade when needed; the motion between them is not checked. Without a video provider set up, the run stops at the storyboard and images, and nothing is checked.',
        covers: ['clip', 'shot-render', 'shot-check', 'regenerate'],
      },
      {
        label: 'Composite',
        explainer:
          'The AI makes one more clip of the last shot, starting where the chain ended. Placing the product into each scene and cutting it out is not available in this version, so that part is skipped.',
        covers: ['render-in-scene', 'matte'],
      },
      {
        label: 'Voice-over audio',
        explainer: 'Not available in this version: no voice-over audio is made, and your locked script stays with the storyboard.',
        covers: ['vo-audio'],
      },
      trimByYou('Your turn: cut the ad down to one message; the AI removes what you list from the shots. The voice-over stays as you locked it.'),
      clicheSweep('stock visual habits'),
      keepOrRevert,
      {
        label: 'Your words',
        explainer: "Your turn: write the headline, the tagline and each shot's caption. The voice-over stays as you locked it.",
        covers: ['voice'],
      },
      {
        label: 'Outside critique: launch check',
        explainer:
          'The ad is judged from its storyboard (its frames as they were generated, or its shots written out) and ranked against strong ads in its category. If it lands below the middle, production runs once more on its own; then you decide.',
        covers: ['feed-render', 'gate-critic'],
      },
    ],
  },
  {
    recipe: c6,
    name: 'Second Reader',
    promise: 'You write every word; three AI readers point out what to trim, what sounds formulaic, and how it compares with strong examples.',
    bestFor: ['Cover letters', 'Proposals and grant applications', 'Personal essays', 'Personal posts and letters'],
    steps: [
      {
        label: 'Angles from your material',
        explainer: 'If you want them, the AI mines your CV, notes and stories for angles: broad, not deep.',
        covers: ['angles'],
        // "Do you want angles first?" is asked about this step; your reaction only follows when the answer is yes.
        operators: ['angles-if-wanted'],
      },
      {
        label: 'Your direction',
        explainer: 'Your turn: react to the angles: what is true, and what to lead with.',
        covers: ['react'],
      },
      yourDraft(),
      {
        label: 'Trim marks',
        explainer: 'One reader marks what could go. Nothing is deleted for you.',
        covers: ['cut-marks'],
      },
      {
        label: 'Cliché sweep',
        explainer: 'One reader flags formulaic phrasing. It flags only; the rewriting is yours.',
        covers: ['tells-flags'],
      },
      {
        label: 'Outside critique',
        explainer: `${OTHER_FAMILY} ranks your draft among published winning examples or your own past documents and names its top three weaknesses.`,
        covers: ['critic'],
      },
      {
        label: 'Your words',
        explainer: 'Your turn: a last read of the whole document, which is already yours.',
        covers: ['voice'],
      },
    ],
  },
  {
    recipe: c6a,
    name: 'Fiction Second Reader',
    promise: 'Premises from random sparks to start from; then you write every sentence while AI readers only point.',
    bestFor: ['Short stories', 'Novels and serials', 'Scripts'],
    steps: [
      {
        label: 'Random spark',
        explainer: 'Six separate sessions, each with its own random spark, propose a premise and a form.',
        covers: ['seed-card', 'cards-render'],
      },
      obviousCheck('Premises that a plain "write a story about…" request also comes up with are flagged.'),
      { label: 'Pick a premise', explainer: 'Your turn: choose the premise to write.', covers: ['pick-card'] },
      {
        label: 'Your direction',
        explainer: 'Your turn: say what pulls you, what feels tacky and what to avoid. The AI sharpens a story brief for you, over up to two rounds.',
        covers: ['react', 'sharpen'],
      },
      yourDraft(),
      {
        label: 'Trim marks',
        explainer: 'One reader marks what could go. Nothing is deleted for you.',
        covers: ['cut-marks'],
      },
      {
        label: 'Cliché sweep',
        explainer: 'One reader flags stock fiction habits. It flags only; the rewriting is yours.',
        covers: ['tells-flags'],
      },
      {
        label: 'Outside critique',
        explainer: `${OTHER_FAMILY} ranks your pages among published passages and names their top three weaknesses.`,
        covers: ['critic'],
      },
      {
        label: 'Your words',
        explainer: 'Your turn: a last read of the whole text, which is already yours.',
        covers: ['voice'],
      },
      {
        label: 'Last cliché read',
        explainer: 'If you want one, a last read that flags stock fiction habits. It flags only.',
        covers: ['final-render', 'final-tells-flags'],
      },
    ],
  },
  {
    recipe: c7,
    name: 'Lean Code Review',
    promise: 'An AI-written code change checked for defects, cut back to what the task asked for and reviewed among strong merged pull requests, with the "why" written by you. Correctness stays with your tests and CI.',
    bestFor: ['Pull requests written by AI agents', 'Changes that grew too big', 'Changes headed for human review'],
    steps: [
      {
        label: 'Spec interview',
        explainer: 'If the requirements are vague, the AI asks a few questions first.',
        covers: ['interview'],
        // "Are the requirements vague?" is asked about the interview; your spec only follows when the answer is yes.
        operators: ['spec-interview'],
      },
      {
        label: 'Your direction',
        explainer: 'Your turn: answer the questions or change their defaults; that becomes the spec.',
        covers: ['spec'],
      },
      { label: 'Implement', explainer: 'The AI writes the change.', covers: ['implement'] },
      {
        label: 'Defect check',
        explainer: 'A reviewer lists lint-style problems, placeholders and leftover to-dos, and the AI fixes what it lists. It looks for defects only, not style.',
        covers: ['defect-render', 'defect-check', 'fix-defects'],
      },
      {
        label: 'Trim the scope',
        explainer: 'A fresh reviewer, who sees only the change and its "why", lists what the change does not need, and the AI removes what it lists.',
        covers: ['scope-render', 'scope-cut', 'apply-scope-cut'],
      },
      {
        label: 'Outside critique',
        explainer: `${OTHER_FAMILY} ranks the change for ease of review among strong merged pull requests and names what to fix; the AI fixes it, up to three rounds.`,
        covers: ['review-render', 'reviewer', 'review-fix'],
      },
      {
        label: 'Trim what review added',
        explainer: 'A fresh reviewer lists what the review rounds added that the change does not need, and the AI removes what it lists.',
        covers: ['bloat-render', 'bloat-cut', 'apply-bloat-cut'],
      },
      clicheSweep('stock code patterns'),
      keepOrRevert,
      {
        label: 'Your words',
        explainer: 'Your turn: write the "why" of the change yourself: why it exists, its tradeoffs and how you checked it.',
        covers: ['voice'],
      },
    ],
  },
];

interface NodeFacts {
  stage: Stage['stage'];
  actor: 'model' | 'human' | 'policy' | 'tool';
}

/** Steps and picks by id. Recipe ids are unique (validator ST1), so an id names one node. */
function nodeFacts(recipe: Recipe): Map<string, NodeFacts> {
  const facts = new Map<string, NodeFacts>();
  walk(recipe, (n, _path, stage) => {
    if (n.op === 'step' || n.op === 'pick') facts.set(n.id, { stage, actor: n.actor });
  });
  return facts;
}

/** Your turn if any covered node is human; the AI's if any is a model; otherwise a tool's (renders, mattes). */
function whoDoes(actors: NodeFacts['actor'][]): Who {
  if (actors.includes('human')) return 'you';
  if (actors.includes('model')) return 'ai';
  return 'tool';
}

/**
 * Every named operator (loops, optionals, routes, picks' parents… everything with an id but steps and picks) with the
 * step and pick ids inside it, and the walk position of every id, so stepIds read in recipe order.
 */
function operatorsOf(recipe: Recipe): { operators: Map<string, string[]>; order: Map<string, number> } {
  const operators = new Map<string, string[]>();
  const order = new Map<string, number>();
  walk(recipe, (n, path, stage) => {
    const id = 'id' in n ? n.id : undefined;
    if (id === undefined) return;
    order.set(id, order.size);
    if (n.op === 'step' || n.op === 'pick') return;
    const inside: string[] = [];
    walkNode(n, path, stage, (c) => {
      if (c.op === 'step' || c.op === 'pick') inside.push(c.id);
    });
    operators.set(id, inside);
  });
  return { operators, order };
}

/**
 * The shown steps of a recipe, each with the ids it stands for (`stepIds`): its steps and picks, and the operators
 * whose events it explains. A run event carries a step's id, or an operator's id for an operator's own checkpoint
 * (pick, optional, route, a loop's cap or its "Is this ready?", a gate's fail) and for loop iterations, so the
 * timeline can label every event in plain words. An operator belongs to the one shown step that covers its whole body;
 * when its body spans several shown steps, the copy names its step (`operators`), or it has none (an audit of three
 * readers, the C1 per-candidate wrapper): those emit no events of their own.
 */
function present(copy: Copy): { presentation: RecipePresentation; byNode: Map<string, PresentedStep> } {
  const { recipe } = copy;
  if (!recipe.medium) throw new Error(`${recipe.id} has no medium`);
  const facts = nodeFacts(recipe);
  const { operators, order } = operatorsOf(recipe);
  const stages: RecipePresentation['stages'] = [];
  const shownSteps: PresentedStep[] = [];
  /** Index into shownSteps of the shown step each id belongs to. */
  const owner = new Map<string, number>();
  const assign = (id: string, i: number, what: string) => {
    if (owner.has(id)) throw new Error(`${recipe.id}: ${what} "${id}" is shown twice`);
    owner.set(id, i);
  };
  copy.steps.forEach((s, i) => {
    const covered = s.covers.map((id) => {
      const f = facts.get(id);
      if (!f) throw new Error(`${recipe.id}: "${s.label}" covers unknown node "${id}"`);
      return f;
    });
    const stageSet = new Set(covered.map((f) => f.stage));
    const [only] = stageSet;
    if (stageSet.size !== 1 || !only) throw new Error(`${recipe.id}: "${s.label}" must cover nodes of one stage`);
    shownSteps.push({ label: s.label, explainer: s.explainer, who: whoDoes(covered.map((f) => f.actor)), stepIds: [], stage: STAGE_NAMES[only] });
    for (const id of s.covers) assign(id, i, 'node');
  });
  // Operators the copy places explicitly; each must contain a node of the step it is placed on.
  copy.steps.forEach((s, i) => {
    for (const id of s.operators ?? []) {
      const inside = operators.get(id);
      if (!inside) throw new Error(`${recipe.id}: "${s.label}" names unknown operator "${id}"`);
      if (!inside.some((x) => s.covers.includes(x))) throw new Error(`${recipe.id}: operator "${id}" contains nothing "${s.label}" covers`);
      assign(id, i, 'operator');
    }
  });
  // The rest belong to the shown step that covers everything inside them, if there is exactly one.
  for (const [id, inside] of operators) {
    if (owner.has(id)) continue;
    const owners = new Set(inside.map((x) => owner.get(x)));
    const [single] = owners;
    if (owners.size === 1 && single !== undefined) owner.set(id, single);
  }
  for (const [id, i] of [...owner].sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))) shownSteps[i]!.stepIds.push(id);

  const byNode = new Map<string, PresentedStep>();
  for (const [id, i] of owner) byNode.set(id, shownSteps[i]!);
  for (const { stage, ...shown } of shownSteps) {
    if (stages.at(-1)?.stage !== stage) stages.push({ stage, steps: [] });
    stages.at(-1)!.steps.push(shown);
  }
  return {
    presentation: { recipeId: recipe.id, code: recipe.family, name: copy.name, promise: copy.promise, medium: recipe.medium, bestFor: copy.bestFor, stages },
    byNode,
  };
}

const PRESENTED = COPY.map(present);

/** Presentations of the eight protocol configurations (C1–C7, C6a), in catalog order. */
export const PRESENTATIONS: readonly RecipePresentation[] = PRESENTED.map((p) => p.presentation);

/** The presentation of a protocol recipe, by recipe id. */
export function presentationOf(recipeId: string): RecipePresentation | undefined {
  return PRESENTATIONS.find((p) => p.recipeId === recipeId);
}

/**
 * The shown step a recipe node belongs to, by recipe id and node id (a step, a pick, or an operator such as a loop or
 * an optional): what a run timeline labels an event with. Undefined for unknown ids and for operators whose body spans
 * several shown steps.
 */
export function stepPresentation(recipeId: string, nodeId: string): PresentedStep | undefined {
  const i = PRESENTATIONS.findIndex((p) => p.recipeId === recipeId);
  return i < 0 ? undefined : PRESENTED[i]!.byNode.get(nodeId);
}

/** A route's choice in plain words: the question, and one "Name: detail" label per branch, in branch order (UX-3). */
export interface RouteChoice {
  question: string;
  options: { id: string; label: string }[];
}

/**
 * Plain wording for the protocol recipes' routes, by recipe id and route id. A route the run was not told in advance
 * becomes a choose checkpoint; branch names ('ai', 'own') mean nothing to a person, and choosing 'own' means writing the
 * whole first draft, so each option says who does what. Tested to cover every route, branch for branch.
 */
const ROUTE_CHOICES: Readonly<Record<string, Readonly<Record<string, RouteChoice>>>> = {
  c3: {
    draft: {
      question: 'Who writes the first draft?',
      options: [
        { id: 'ai', label: 'The AI drafts it: from your point, for you to revise and rewrite' },
        { id: 'own', label: 'You write it: the whole first draft, yourself' },
      ],
    },
  },
};

/** The plain choice for a route of a protocol recipe, or undefined for an unknown recipe or route. */
export function routeChoice(recipeId: string, routeId: string): RouteChoice | undefined {
  return Object.hasOwn(ROUTE_CHOICES, recipeId) && Object.hasOwn(ROUTE_CHOICES[recipeId]!, routeId) ? ROUTE_CHOICES[recipeId]![routeId] : undefined;
}

/**
 * The shown step whose `stepIds` include `stepId`, with its stage, in any presentation (a protocol recipe's or a
 * composed one's): how the app labels a run event, which carries a step's or an operator's id.
 */
export function presentedStepFor(presentation: RecipePresentation, stepId: string): PresentedStep | undefined {
  for (const { stage, steps } of presentation.stages) {
    const step = steps.find((s) => s.stepIds.includes(stepId));
    if (step) return { ...step, stage };
  }
  return undefined;
}
