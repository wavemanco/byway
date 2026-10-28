/**
 * Start's attach control rendered to HTML (react-dom/server, no browser). At five attachments the attach button goes;
 * before, nothing took its place, so the limit was not stated anywhere. Now a note says it, as text and not as a control,
 * so the Tab order is what it was (e2e/keyboard.spec.ts checks focus lands in the fifth name field).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ATTACH_LIMIT_NOTE, AttachControl, MAX_ATTACHMENTS } from '../src/components/StartForm.tsx';
import { decodeAttachments } from '../src/components/startDraft.ts';
import { ProblemInput } from '../src/server/schemas.ts';

const shown = (count: number) => renderToStaticMarkup(createElement(AttachControl, { count, onAttach: () => undefined }));
const attachments = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Note ${i + 1}`, text: 'x' }));

describe("Start's attach control", () => {
  it('is the attach button while another attachment fits', () => {
    expect(shown(0)).toBe('<button type="button" class="button">Attach a draft or diff</button>');
    for (let n = 1; n < MAX_ATTACHMENTS; n++) expect(shown(n)).toBe('<button type="button" class="button">Attach another</button>');
  });

  it('at the limit, is a note that says it, and no control at all', () => {
    expect(shown(MAX_ATTACHMENTS)).toBe(`<span class="muted small">${ATTACH_LIMIT_NOTE}</span>`);
    expect(shown(MAX_ATTACHMENTS)).not.toMatch(/<button|tabindex|aria-disabled|disabled/);
  });

  it('states the limit the server keeps: five attachments are taken, a sixth is refused', () => {
    expect(ATTACH_LIMIT_NOTE).toBe('byway takes up to five attachments for one problem.');
    expect(MAX_ATTACHMENTS).toBe(5);
    expect(ProblemInput.safeParse({ text: 'A memo', attachments: attachments(5) }).success).toBe(true);
    expect(ProblemInput.safeParse({ text: 'A memo', attachments: attachments(6) }).success).toBe(false);
  });

  it("keeps the text limits the server keeps, in the request and in the kept draft (WEB-8)", () => {
    const ok = (text: string, name = 'Note', body = 'x') => ProblemInput.safeParse({ text, attachments: [{ name, text: body }] }).success;
    expect(ok('x'.repeat(20_000))).toBe(true);
    expect(ok('x'.repeat(20_001))).toBe(false);
    expect(ok('A memo', 'n'.repeat(200))).toBe(true);
    expect(ok('A memo', 'n'.repeat(201))).toBe(false);
    expect(ok('A memo', 'Note', 'x'.repeat(200_000))).toBe(true);
    expect(ok('A memo', 'Note', 'x'.repeat(200_001))).toBe(false);
    expect(decodeAttachments([{ name: 'n'.repeat(200), text: 'x'.repeat(200_000) }])).toHaveLength(1);
    expect(decodeAttachments([{ name: 'n'.repeat(201), text: 'x' }])).toBeNull();
    expect(decodeAttachments([{ name: 'Note', text: 'x'.repeat(200_001) }])).toBeNull();
    expect(decodeAttachments(attachments(5))).toHaveLength(5);
    expect(decodeAttachments(attachments(6))).toBeNull();
  });
});
