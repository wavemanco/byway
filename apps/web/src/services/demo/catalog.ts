/**
 * A small built-in copy of the eight recipe presentations, the chooser questions and per-recipe cost data,
 * for demo mode only. The real data comes from @byway/catalog (WP-A) through @byway/advisor (WP-E); this copy
 * follows 03-configurations in plain words (spec §5 vocabulary) and makes no efficacy claims (CR11).
 *
 * Each shown step lists the demo recipe's step ids it stands for (`stepIds`), exactly as the real catalog lists the
 * canonical recipe's, so a run event's step id finds its plain label. A test checks that every demo step is covered
 * exactly once, from the right stage, by the right "who".
 */
import type { ChooserQuestion, CostEstimate, RecipePresentation } from '@byway/contracts';

type Step = RecipePresentation['stages'][number]['steps'][number];
const you = (label: string, explainer: string, stepIds: string[]): Step => ({ label, explainer, who: 'you', stepIds });
const ai = (label: string, explainer: string, stepIds: string[]): Step => ({ label, explainer, who: 'ai', stepIds });
const tool = (label: string, explainer: string, stepIds: string[]): Step => ({ label, explainer, who: 'tool', stepIds });

export const PRESENTATIONS: RecipePresentation[] = [
  {
    recipeId: 'c1',
    code: 'C1',
    name: 'Landing Page Studio',
    promise: 'A web page that does not look like every other AI page: four different drafts, outside critique, and you finish it.',
    medium: 'web-page',
    bestFor: ['Landing pages', 'Marketing sites', 'Product and app screens', 'Decks'],
    stages: [
      {
        stage: 'Explore',
        steps: [
          you('Your direction', 'Optional: describe the look you want before the drafts are made.', ['entry', 'vision']),
          ai('Random spark', 'AI drafts four pages, each steered by a different random starting point.', ['seed-build']),
        ],
      },
      {
        stage: 'Refine',
        steps: [
          ai('Outside critique', 'A separate model looks at screenshots of each draft and sends notes until it clears the quality bar.', ['critic-loop']),
          ai('Custom imagery', 'If you find a draft plain, AI makes images for it.', ['asset']),
          you('Your pick', 'You choose the draft to finish.', ['pick-one']),
        ],
      },
      {
        stage: 'Finish',
        steps: [
          you('Trim', 'You list what to remove; AI removes exactly that.', ['cut', 'apply-cut']),
          ai('Cliché sweep', 'AI flags stock patterns and proposes swaps.', ['tells-sweep']),
          you('Keep or revert', 'You compare the page before and after the swaps.', ['tells-compare']),
          you('Your words', 'You rewrite every line of copy in your own voice.', ['voice', 'voice-apply']),
          ai('Final check', 'A last look for broken layout, clipped text or missing images. No scoring.', ['critic-check']),
        ],
      },
    ],
  },
  {
    recipeId: 'c2',
    code: 'C2',
    name: 'Idea Generator',
    promise: 'A wide spread of genuinely different options, so you choose from more than the obvious three.',
    medium: 'options',
    bestFor: ['Strategy options', 'Product concepts', 'Names', 'Research ideas'],
    stages: [
      {
        stage: 'Explore',
        steps: [
          ai('Random spark', 'AI writes eight short options, each from a different random starting point.', ['seed-options']),
          tool('Remove near-duplicates', 'Keeps one option from each cluster of look-alikes.', ['dedupe']),
          ai('Obvious-idea check', 'Flags options that a plain prompt also comes up with.', ['vanilla-overlap']),
          ai('Outside critique', 'Adds an advisory note to each option. Nothing is removed on its say-so.', ['annotate']),
          you('Your pick', 'You choose the options worth keeping.', ['pick-options']),
          you('Your direction', 'You react and sharpen them into a brief.', ['sharpen', 'brief']),
          you('Your words', 'You name the direction and write its one-line pitch.', ['voice']),
        ],
      },
    ],
  },
  {
    recipeId: 'c3',
    code: 'C3',
    name: 'Series Writer',
    promise: 'Pieces for a series that each find a fresh angle and end up in your voice.',
    medium: 'prose',
    bestFor: ['Newsletters', 'Blog and LinkedIn posts', 'Brand writing', 'Teaching units'],
    stages: [
      {
        stage: 'Explore',
        steps: [
          ai('Random spark', 'Six angle cards, each from a different random starting point.', ['seed-angles']),
          ai('Obvious-idea check', 'Flags angles that a plain prompt also produces.', ['vanilla-overlap']),
          you('Your pick', 'You choose the angle.', ['pick-angle']),
          you('Your direction', 'You state the thesis from your own experience or data.', ['thesis']),
        ],
      },
      {
        stage: 'Refine',
        steps: [
          ai('Draft', 'AI drafts the piece. Its wording is a placeholder until you write yours.', ['draft']),
          ai('Outside critique', 'A model from another family ranks the draft against strong pieces until it makes the top three.', ['critic-loop']),
        ],
      },
      {
        stage: 'Finish',
        steps: [
          you('Trim', 'You list what to cut.', ['cut', 'apply-cut']),
          ai('Cliché sweep', 'AI flags stock phrases, structures and platform habits.', ['tells-sweep']),
          you('Keep or revert', 'You compare before and after the swaps.', ['tells-compare']),
          you('Your words', 'You rewrite every line.', ['voice']),
        ],
      },
    ],
  },
  {
    recipeId: 'c4',
    code: 'C4',
    name: 'Memo Polish',
    promise: 'An internal document with the ask up front and nothing the reader would miss, in minutes.',
    medium: 'prose',
    bestFor: ['Memos', 'Status updates', 'Product specs', 'Incident reviews'],
    stages: [
      { stage: 'Explore', steps: [you('Your direction', 'In a line or two: the decision or ask, and the one point.', ['vision'])] },
      {
        stage: 'Refine',
        steps: [
          ai('Draft', 'AI drafts the document around your ask.', ['draft']),
          ai('Outside critique', 'Only for long documents: a simulated reader checks they could act on it in two minutes.', ['critic']),
        ],
      },
      {
        stage: 'Finish',
        steps: [
          you('Trim', 'You cut to a length budget: what would the reader not miss?', ['cut', 'apply-cut']),
          ai('Cliché sweep', 'AI flags memo filler and proposes plainer lines.', ['tells-sweep']),
          you('Keep or revert', 'You compare before and after the swaps.', ['tells-compare']),
          you('Your words', 'You read every line and rewrite the key ones: the bottom line, the ask, judgment calls, the sign-off.', ['voice']),
        ],
      },
    ],
  },
  {
    recipeId: 'c5',
    code: 'C5',
    name: 'Ad Video Chain',
    promise: 'Ad creative made by a chain of image and video models, with your concept, your script and your words.',
    medium: 'media',
    bestFor: ['Ad creative', 'Campaign visuals', 'Short brand video'],
    stages: [
      {
        stage: 'Explore',
        steps: [
          ai('Random spark', 'AI sketches four creative territories.', ['territories']),
          you('Your pick', 'You choose the concept.', ['concept']),
          you('Your words', 'You write the voice-over script, which is then locked.', ['vo-script']),
        ],
      },
      {
        stage: 'Refine',
        steps: [
          ai('Custom imagery', 'AI makes the anchor frames for each shot.', ['frames']),
          ai('Defect check', 'Each frame is checked for warped logos, hands or garbled text.', ['defect-check']),
          ai('Motion', 'One clip per shot, each starting from the last frame of the one before. Needs a video provider key.', ['relay']),
          tool('Composite', 'Places the product into each scene. byway cannot do this yet, so the step is skipped and says so.', ['matte']),
          ai('Voice-over audio', 'Turns your script into audio. It needs a voice-over audio provider, which byway does not have yet.', ['vo-audio']),
        ],
      },
      {
        stage: 'Finish',
        steps: [
          you('Trim', 'One message, fewer elements: you say what goes.', ['cut']),
          ai('Cliché sweep', 'AI flags stock motifs, plastic sheen and frozen motion.', ['tells-sweep']),
          you('Your words', 'You write the tagline, headline and captions.', ['on-screen']),
          ai('Outside critique', 'A one-time check against strong ads in the category, with one automatic retry.', ['gate']),
        ],
      },
    ],
  },
  {
    recipeId: 'c6',
    code: 'C6',
    name: 'Second Reader',
    promise: 'You write every sentence; AI only points at what to cut, what reads as formula, and where it ranks.',
    medium: 'prose',
    bestFor: ['Cover letters', 'Proposals', 'Grant applications', 'Personal essays'],
    stages: [
      { stage: 'Explore', steps: [ai('Your direction', 'Optional: angles drawn from your own notes and CV.', ['angles'])] },
      {
        stage: 'Refine',
        steps: [
          you('Your draft', 'You write or revise. Every sentence is yours.', ['draft']),
          ai('Trim marks', 'Marks cut candidates. Deletes nothing.', ['cut-marks']),
          ai('Cliché flags', 'Flags formula: listed credentials, echoed keywords, self-announcing structure.', ['tells-flags']),
          ai('Outside critique', 'Ranks your draft in a pile of strong examples and names the top three weaknesses.', ['critic-rank']),
          you('Done?', 'You decide when it is finished.', ['done']),
        ],
      },
      { stage: 'Finish', steps: [you('Your words', 'The whole document is already yours; you read it once more and have the final word.', ['voice'])] },
    ],
  },
  {
    recipeId: 'c6a',
    code: 'C6a',
    name: 'Fiction Second Reader',
    promise: 'Seeded premises to choose from, then your own prose, with critics that only point.',
    medium: 'prose',
    bestFor: ['Short stories', 'Novels', 'Serials', 'Scripts'],
    stages: [
      {
        stage: 'Explore',
        steps: [
          ai('Random spark', 'Six premise and form cards, each from a different random starting point.', ['premise-cards']),
          ai('Obvious-idea check', 'Flags premises that a plain prompt also produces.', ['vanilla-overlap']),
          you('Your pick', 'You choose a premise.', ['premise']),
          you('Your direction', 'You sharpen it into a story brief, written for you.', ['story-brief']),
        ],
      },
      {
        stage: 'Refine',
        steps: [
          you('Your pages', 'You write. Every sentence is yours.', ['pages']),
          ai('Trim marks', 'Marks cut candidates. Deletes nothing.', ['cut-marks']),
          ai('Cliché flags', 'Flags fiction tells: stock names, explained feelings, tidy endings.', ['tells-flags']),
          ai('Outside critique', 'Ranks your pages against published passages in your genre.', ['critic-rank']),
          you('Done?', 'You decide when it is finished.', ['done']),
        ],
      },
      { stage: 'Finish', steps: [you('Your words', 'The whole text is already yours; you read it once more and have the final word.', ['voice'])] },
    ],
  },
  {
    recipeId: 'c7',
    code: 'C7',
    name: 'Lean Code Review',
    promise: 'Smaller AI-written code changes, reviewed for readability, with a "why" you write.',
    medium: 'code-diff',
    bestFor: ['Agent-written pull requests', 'Refactors', 'Changes in risky areas'],
    stages: [
      {
        stage: 'Refine',
        steps: [
          ai('Implement', 'AI writes the change.', ['implement']),
          tool('Objective checks', 'Lint, types, formatting and leftover TODOs.', ['objective-checks']),
          ai('Trim', 'Removes unrequested files, helpers, flags and comments.', ['cut-scope']),
          ai('Outside critique', 'A reviewer model judges reviewability. It does not check correctness; your tests do.', ['review-loop']),
          ai('Trim', 'Removes anything the review added.', ['cut-review']),
        ],
      },
      {
        stage: 'Finish',
        steps: [
          ai('Cliché sweep', 'AI flags code-style habits and proposes swaps.', ['tells-sweep']),
          you('Keep or revert', 'You compare before and after the swaps.', ['tells-compare']),
          you('Your words', "You write the pull request's why, its tradeoffs and how you verified it.", ['voice']),
        ],
      },
    ],
  },
];

/** The seven questions of 03 "Choosing a configuration", in order; the first yes decides. */
export const QUESTIONS: ChooserQuestion[] = [
  {
    id: 'decision',
    text: 'Is the result a decision or a set of options, rather than a finished piece?',
    help: 'Naming, strategy options, concepts, research directions.',
    routesTo: 'c2',
  },
  {
    id: 'code',
    text: 'Is it a code change written by an AI agent, where size and reviewability are the worry?',
    help: 'Correctness stays with your tests and CI.',
    routesTo: 'c7',
  },
  {
    id: 'media',
    text: 'Will image or video models make the piece itself?',
    help: 'Ad creative, campaign visuals, short brand video.',
    routesTo: 'c5',
  },
  {
    id: 'visual',
    text: 'Is it something people look at on a screen, like a web page, app screen or deck?',
    help: 'Rendered visual work.',
    routesTo: 'c1',
  },
  {
    id: 'fiction',
    text: 'Is it fiction or other invented-world writing that you write yourself?',
    help: 'Stories, novels, serials, scripts.',
    routesTo: 'c6a',
  },
  {
    id: 'series',
    text: 'Is it bylined, brand or teaching writing published as a series?',
    help: 'Newsletters, posts, columns, lesson units.',
    routesTo: 'c3',
  },
  {
    id: 'signal',
    text: 'Does it need to show your own effort or fit?',
    help: 'Applications, proposals, grants, personal letters.',
    routesTo: 'c6',
  },
];

/** Keywords the demo intake looks for; the real intake is a model call (spec §4). */
export const QUESTION_KEYWORDS: Record<string, string[]> = {
  decision: ['options', 'ideas', 'names', 'naming', 'brainstorm', 'concepts', 'directions', 'choose', 'decide', 'which', 'strategy'],
  code: ['code', 'diff', 'pull request', 'pr ', 'refactor', 'commit', 'repo', 'function', 'bug fix', 'typescript', 'python'],
  media: ['video', ' ad ', ' ads', 'ad creative', 'campaign', 'commercial', 'storyboard', 'reel', 'banner'],
  visual: ['landing page', 'web page', 'webpage', 'website', 'homepage', 'site', 'app screen', 'dashboard', 'deck', 'slides', 'ui '],
  fiction: ['story', 'stories', 'novel', 'fiction', 'chapter', 'screenplay', 'script for a film', 'character'],
  series: ['newsletter', 'blog', 'posts', 'linkedin', 'series', 'column', 'weekly', 'lesson'],
  signal: ['cover letter', 'application', 'proposal', 'grant', 'personal statement', 'essay', 'motivation letter', 'rfp'],
};

/** Demo cost data per recipe at the balanced profile; profiles scale it. */
export const ESTIMATES: Record<string, CostEstimate> = {
  c1: { lowUsd: 0.6, highUsd: 2.4, modelCalls: { low: 30, high: 60 }, images: { low: 0, high: 12 }, humanMinutes: { low: 15, high: 35 } },
  c2: { lowUsd: 0.1, highUsd: 0.4, modelCalls: { low: 12, high: 24 }, images: { low: 0, high: 3 }, humanMinutes: { low: 15, high: 30 } },
  c3: { lowUsd: 0.2, highUsd: 0.7, modelCalls: { low: 12, high: 20 }, images: { low: 0, high: 1 }, humanMinutes: { low: 25, high: 45 } },
  c4: { lowUsd: 0.03, highUsd: 0.15, modelCalls: { low: 3, high: 8 }, images: { low: 0, high: 0 }, humanMinutes: { low: 5, high: 10 } },
  c5: { lowUsd: 1.5, highUsd: 6, modelCalls: { low: 20, high: 40 }, images: { low: 8, high: 20 }, humanMinutes: { low: 45, high: 90 } },
  c6: { lowUsd: 0.05, highUsd: 0.3, modelCalls: { low: 3, high: 12 }, images: { low: 0, high: 0 }, humanMinutes: { low: 30, high: 90 } },
  c6a: { lowUsd: 0.1, highUsd: 0.45, modelCalls: { low: 9, high: 21 }, images: { low: 0, high: 0 }, humanMinutes: { low: 45, high: 120 } },
  c7: { lowUsd: 0.15, highUsd: 0.6, modelCalls: { low: 6, high: 14 }, images: { low: 0, high: 0 }, humanMinutes: { low: 5, high: 10 } },
};

export const PROFILE_PRICE_SCALE: Record<string, number> = { balanced: 1, best: 2.2, demo: 0 };

export function presentationFor(recipeId: string): RecipePresentation | undefined {
  return PRESENTATIONS.find((p) => p.recipeId === recipeId);
}
