import type { ChooserQuestion } from '@byway/contracts';

/**
 * The configuration chooser of 03-configurations, "Choosing a configuration", as data (product spec §4).
 *
 * The questions are asked in 03's order and the first "yes" decides, so order is meaning: a page of options is an
 * option set (C2) before it is a visual artifact (C1), and fiction you write yourself (C6a) is settled before series
 * writing (C3). The wording is plain (spec §5); the routing is 03's exactly, and a test reads it back from the
 * flowchart. Help text says what a "yes" looks like and, where it matters, what the recipe does not do.
 */
export const CHOOSER: readonly ChooserQuestion[] = [
  {
    id: 'decision',
    text: 'Do you want a set of options to choose from, rather than a finished piece?',
    help: 'Say yes for strategy options, concepts, names or research ideas: the result is your decision, with the options laid out side by side.',
    routesTo: 'c2',
  },
  {
    id: 'code-change',
    text: 'Is it a code change written by an AI agent, where size or ease of review is the problem?',
    help: 'Say yes when agent-written changes come out bloated or hard to review. This makes the change smaller and easier to read; whether the code is correct stays with your own tests and CI.',
    routesTo: 'c7',
  },
  {
    id: 'media',
    text: 'Is the piece made of video, images or voice-over produced by specialist AI models?',
    help: 'Say yes for ad creative or short videos built shot by shot. Without a video provider set up, a run stops at the storyboard and images.',
    routesTo: 'c5',
  },
  {
    id: 'visual',
    text: 'Is it something people look at on screen, such as a web page, an app screen or a deck?',
    help: 'Say yes when how it looks is most of the job. In this version the recipe builds web pages, such as landing and product pages.',
    routesTo: 'c1',
  },
  {
    id: 'fiction',
    text: 'Is it fiction or other invented-world writing that you write yourself?',
    help: 'Say yes for short stories, novels, serials or scripts. You write every sentence; the AI suggests premises and points out weak spots, and never writes your text.',
    routesTo: 'c6a',
  },
  {
    id: 'series',
    text: 'Is it bylined, brand or teaching writing that you publish as a series?',
    help: 'Say yes for a newsletter, a column, regular brand articles or teaching units, where each piece should sound like you and not like the last one. Each run writes one piece.',
    routesTo: 'c3',
  },
  {
    id: 'effort-signal',
    text: 'Does the writing need to show your own effort or fit, like an application, a proposal, a grant or a personal letter?',
    help: 'Say yes when the reader judges you by it. You write it yourself; the AI only points out what to trim, what sounds formulaic and how it compares with strong examples.',
    routesTo: 'c6',
  },
];

/**
 * Where 03's flowchart goes when every answer is "no": C4 Reader-Ready, for everyday internal documents.
 * The product spec (§4) treats "no yes" as no fit and suggests composing a recipe; the advisor reconciles the two
 * (for example, by recommending this recipe as a partial fit alongside the offer to compose).
 */
export const CHOOSER_FALLBACK = 'c4';
