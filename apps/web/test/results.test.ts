import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Storyboard } from '../src/components/results.tsx';
import { parseUnifiedDiff } from '../src/view/diff.ts';
import { clipKind, parseOptions, parseStoryboard, resultKind, storyboardArtifacts } from '../src/view/result.ts';
import { excerpt, withoutLeadingTitle, exportFileName, slugify, titleFromProblem } from '../src/view/text.ts';

const DIFF = `diff --git a/src/total.ts b/src/total.ts
index 1111111..2222222 100644
--- a/src/total.ts
+++ b/src/total.ts
@@ -1,5 +1,4 @@
 export function total(items: number[]): number {
-  // TODO: remove debug flag
-  const debug = false;
+  const sum = items.reduce((a, b) => a + b, 0);
   return sum;
 }
@@ -10,2 +9,3 @@ export function other() {
 const a = 1;
+const b = 2;
 const c = 3;

Why: The debug flag was never read, so removing it shrinks the change without altering behaviour.
Verified with the existing unit tests.`;

describe('diff viewer model', () => {
  it('parses files, hunks and line numbers from a unified diff', () => {
    const { files } = parseUnifiedDiff(DIFF);
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file).toMatchObject({ oldPath: 'src/total.ts', newPath: 'src/total.ts', additions: 2, deletions: 2 });
    expect(file?.hunks).toHaveLength(2);
    expect(file?.hunks[0]?.lines.map((l) => [l.kind, l.oldLine ?? null, l.newLine ?? null])).toEqual([
      ['context', 1, 1],
      ['del', 2, null],
      ['del', 3, null],
      ['add', null, 2],
      ['context', 4, 3],
      ['context', 5, 4],
    ]);
    expect(file?.hunks[1]?.header).toBe('@@ -10,2 +9,3 @@ export function other() {');
  });

  it('separates the closing "Why:" paragraph from the diff', () => {
    expect(parseUnifiedDiff(DIFF).why).toBe(
      'The debug flag was never read, so removing it shrinks the change without altering behaviour.\nVerified with the existing unit tests.',
    );
  });

  it('handles new files and diffs without a git header', () => {
    const { files, why } = parseUnifiedDiff('--- /dev/null\n+++ b/notes.md\n@@ -0,0 +1,2 @@\n+one\n+two\n');
    expect(files[0]).toMatchObject({ oldPath: '/dev/null', newPath: 'notes.md', additions: 2, deletions: 0 });
    expect(why).toBeUndefined();
  });
});

describe('result parsing', () => {
  it('chooses a viewer by medium', () => {
    expect(['web-page', 'prose', 'options', 'media', 'code-diff'].map((m) => resultKind(m as never))).toEqual([
      'page',
      'markdown',
      'options',
      'storyboard',
      'diff',
    ]);
  });

  it('reads an options list and rejects anything else', () => {
    const json = JSON.stringify({ options: [{ title: 'Go small', pitch: 'Start with one city', rationale: 'Cheap to test' }] });
    expect(parseOptions(json)).toEqual([{ title: 'Go small', pitch: 'Start with one city', rationale: 'Cheap to test' }]);
    expect(parseOptions('{"options":"nope"}')).toBeNull();
    expect(parseOptions('not json')).toBeNull();
  });

  it('reads a storyboard with optional frame images', () => {
    const json = JSON.stringify({
      storyboard: [{ shot: 1, description: 'Open on hands', imagePrompt: 'hands, clay', durationSec: 3, imageArtifactId: 'sha256:f' }],
      voiceover: 'Made slowly.',
    });
    expect(parseStoryboard(json)).toEqual({
      shots: [{ shot: 1, description: 'Open on hands', imagePrompt: 'hands, clay', durationSec: 3, imageArtifactId: 'sha256:f' }],
      voiceover: 'Made slowly.',
      totalSec: 3,
    });
    expect(parseStoryboard('{}')).toBeNull();
  });

  it('reads the on-screen copy a storyboard may carry: a headline, a tagline and each shot’s caption (C4)', () => {
    const json = JSON.stringify({
      storyboard: [
        { shot: 1, description: 'Open on hands', imagePrompt: 'hands', durationSec: 3, caption: 'Made by hand' },
        { shot: 2, description: 'The street', imagePrompt: 'street', durationSec: 4 },
      ],
      voiceover: 'Made slowly.',
      headline: 'Bread, the slow way',
      tagline: 'Open at seven',
    });
    const board = parseStoryboard(json);
    expect(board).toMatchObject({ headline: 'Bread, the slow way', tagline: 'Open at seven' });
    expect(board?.shots[0]?.caption).toBe('Made by hand');
    expect(board?.shots[1]).not.toHaveProperty('caption');
    // Without them it is the storyboard it always was.
    expect(parseStoryboard(JSON.stringify({ storyboard: [{ shot: 1, description: 'd', imagePrompt: 'i', durationSec: 2 }], voiceover: 'v' }))).not.toHaveProperty('headline');
  });

  it('shows the on-screen copy, and two storyboards side by side keep their own voice-over headings (C4, UX-14)', () => {
    const board = parseStoryboard(
      JSON.stringify({ storyboard: [{ shot: 1, description: 'Open on hands', imagePrompt: 'hands', durationSec: 3, caption: 'Made by hand' }], voiceover: 'Made slowly.', headline: 'Bread, the slow way', tagline: 'Open at seven' }),
    );
    if (!board) throw new Error('no board');
    const html = renderToStaticMarkup(createElement('div', null, createElement(Storyboard, { board }), createElement(Storyboard, { board })));
    expect(html).toContain('Bread, the slow way');
    expect(html).toContain('Open at seven');
    expect(html).toContain('Made by hand');
    const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(labelled).toHaveLength(2);
    expect(new Set(labelled).size).toBe(2);
    for (const id of labelled) expect(html).toContain(`id="${id}"`);
  });

  it('reads each shot’s clip, lists what the storyboard shows, and shows a placeholder clip as an image', () => {
    const json = JSON.stringify({
      storyboard: [
        { shot: 1, description: 'Open on hands', imagePrompt: 'hands', durationSec: 3, imageArtifactId: 'sha256:f1', clipArtifactId: 'sha256:c1' },
        { shot: 2, description: 'The street', imagePrompt: 'street', durationSec: 4, imageArtifactId: 'sha256:f2' },
      ],
      voiceover: 'Made slowly.',
    });
    const board = parseStoryboard(json);
    expect(board?.shots[0]?.clipArtifactId).toBe('sha256:c1');
    expect(board?.shots[1]).not.toHaveProperty('clipArtifactId');
    expect(board ? storyboardArtifacts(board) : []).toEqual(['sha256:f1', 'sha256:c1', 'sha256:f2']);
    expect(clipKind('video/mp4')).toBe('video');
    expect(clipKind('image/svg+xml')).toBe('image');
    expect(clipKind(undefined)).toBe('link');
  });

  it('shows a shot with a clip and no still by its clip alone, never as a frame still to come (F12 (b))', () => {
    // With a video model C5 makes shot 1's still alone; the later shots have their clips.
    const board = parseStoryboard(
      JSON.stringify({
        storyboard: [
          { shot: 1, description: 'Open on hands', imagePrompt: 'hands', durationSec: 3, imageArtifactId: 'sha256:f1', clipArtifactId: 'sha256:c1' },
          { shot: 2, description: 'The street', imagePrompt: 'street', durationSec: 4, clipArtifactId: 'sha256:c2' },
          { shot: 3, description: 'The cup', imagePrompt: 'cup', durationSec: 3 },
        ],
        voiceover: 'Made slowly.',
      }),
    );
    const html = renderToStaticMarkup(createElement(Storyboard, { board: board! }));
    const shots = html.split('<li class="shot">').slice(1);
    expect(shots[0]).toContain('<figcaption>Frame</figcaption>');
    expect(shots[1]).not.toContain('No frame yet');
    expect(shots[1]).not.toContain('<figcaption>Frame</figcaption>');
    expect(shots[1]).toContain('<figcaption>Clip</figcaption>');
    // A shot with neither still keeps its placeholder.
    expect(shots[2]).toContain('No frame yet');
  });
});

describe('text helpers', () => {
  it('makes a short run title from the problem', () => {
    expect(titleFromProblem('a landing page for my pottery studio in Lisbon. It should feel calm.')).toBe(
      'A landing page for my pottery studio in Lisbon',
    );
    expect(titleFromProblem('   ')).toBe('Untitled');
    const long = titleFromProblem('Write a memo to the leadership team about moving the quarterly planning offsite to a cheaper venue');
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith('…')).toBe(true);
  });

  it('excerpts text without markdown syntax', () => {
    expect(excerpt('# Title\n\nSome **bold** text\n- item', 40)).toBe('Title: Some bold text item');
    expect(excerpt('## Done?\nYes', 40)).toBe('Done? Yes');
    expect(excerpt('one two three four five', 12)).toBe('one two…');
  });

  it('drops a card heading when the caption above the card already says the same', () => {
    expect(withoutLeadingTitle('### Make it a ritual\n\nTurn it into a habit.', 'Make it a ritual')).toBe('Turn it into a habit.');
    expect(withoutLeadingTitle('### Something else\n\nBody', 'Make it a ritual')).toBe('### Something else\n\nBody');
    expect(withoutLeadingTitle('No heading here', 'No heading here')).toBe('No heading here');
  });

  it('names export files', () => {
    expect(slugify('Memo: Q3 offsite (draft #2)!')).toBe('memo-q3-offsite-draft-2');
    expect(slugify('***')).toBe('byway-result');
    expect(exportFileName('Memo: Q3 offsite', 'text/markdown')).toBe('memo-q3-offsite.md');
    expect(exportFileName('Page', 'text/html')).toBe('page.html');
    expect(exportFileName('Ideas', 'application/json')).toBe('ideas.json');
    expect(exportFileName('Fix', 'text/x-diff')).toBe('fix.patch');
    expect(exportFileName('Frame', 'image/png')).toBe('frame.png');
    // Every kind mediaServing serves keeps its own extension, not .txt (WEB-3).
    expect(exportFileName('Clip', 'video/mp4')).toBe('clip.mp4');
    expect(exportFileName('Clip', 'video/webm')).toBe('clip.webm');
    expect(exportFileName('Loop', 'image/gif')).toBe('loop.gif');
    expect(exportFileName('Frame', 'image/avif')).toBe('frame.avif');
    expect(exportFileName('Voice', 'audio/mpeg')).toBe('voice.mp3');
    expect(exportFileName('Voice', 'audio/wav')).toBe('voice.wav');
    expect(exportFileName('Voice', 'audio/ogg')).toBe('voice.ogg');
    expect(exportFileName('Other', 'application/x-unknown')).toBe('other.txt');
  });
});
