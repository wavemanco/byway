import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseTemplateFile } from '../src/template.ts';

const file = (front: string, body: string) => `---\n${front}\n---\n${body}`;
const FRONT = [
  'id: product.c4.draft',
  'version: 2',
  'fidelity: project',
  'slots: problem, brief',
  'output: artifact:prose',
  'source: 03 C4 wiring; 06-runbook C4',
].join('\n');

describe('template files', () => {
  it('reads front matter, an optional system section and the user section', () => {
    const text = file(FRONT, '## system\nYou write memos.\n\n## user\n<problem>\n{{problem}}\n</problem>\n{{brief}}\n');
    const t = parseTemplateFile(text, 'product.c4.draft.md');
    expect(t).toMatchObject({ id: 'product.c4.draft', medium: undefined, version: 2, fidelity: 'project', slots: ['problem', 'brief'], output: 'artifact:prose' });
    expect(t.source).toBe('03 C4 wiring; 06-runbook C4');
    expect(t.system).toBeDefined();
    expect(t.hash).toBe(`sha256:${createHash('sha256').update(text).digest('hex')}`);
  });

  it('hashes the file with LF line endings, so a CRLF checkout records the same hash', () => {
    const lf = file(FRONT, '## user\n{{problem}} {{brief}}\n');
    expect(parseTemplateFile(lf.replace(/\n/g, '\r\n'), 'product.c4.draft.md').hash).toBe(parseTemplateFile(lf, 'product.c4.draft.md').hash);
  });

  it('allows a template with no system section and no slots', () => {
    const t = parseTemplateFile(file(FRONT.replace('slots: problem, brief', 'slots:'), '## user\nJust text.\n'), 'product.c4.draft.md');
    expect(t.system).toBeUndefined();
    expect(t.slots).toEqual([]);
  });

  it('reads the medium of a variant from its file name', () => {
    const t = parseTemplateFile(file(FRONT, '## user\n{{problem}}{{brief}}'), 'product.c4.draft@prose.md');
    expect(t.medium).toBe('prose');
  });

  it('rejects a file without front matter', () => {
    expect(() => parseTemplateFile('## user\nx', 'product.c4.draft.md')).toThrow(/front matter/);
  });

  it.each([
    ['an id that differs from the file name', FRONT, '## user\n{{problem}}{{brief}}', 'other.md', /does not match/],
    ['an unknown medium suffix', FRONT, '## user\n{{problem}}{{brief}}', 'product.c4.draft@poster.md', /medium/],
    ['a bad fidelity', FRONT.replace('project', 'loose'), '## user\n{{problem}}{{brief}}', 'product.c4.draft.md', /fidelity/],
    ['an unknown output contract', FRONT.replace('artifact:prose', 'poem'), '## user\n{{problem}}{{brief}}', 'product.c4.draft.md', /output/],
    ['a non-numeric version', FRONT.replace('version: 2', 'version: two'), '## user\n{{problem}}{{brief}}', 'product.c4.draft.md', /version/],
    ['an unknown front-matter key', `${FRONT}\nauthor: me`, '## user\n{{problem}}{{brief}}', 'product.c4.draft.md', /author/],
    ['a missing source', FRONT.replace(/^source:.*$/m, 'source:'), '## user\n{{problem}}{{brief}}', 'product.c4.draft.md', /source/],
    ['no user section', FRONT, '## system\nx {{problem}}{{brief}}', 'product.c4.draft.md', /## user/],
    ['text before the first section', FRONT, 'stray\n## user\n{{problem}}{{brief}}', 'product.c4.draft.md', /before/],
    ['a declared slot the body never uses', FRONT, '## user\n{{problem}}', 'product.c4.draft.md', /brief/],
    ['a used slot that is not declared', FRONT, '## user\n{{problem}}{{brief}}{{seed}}', 'product.c4.draft.md', /seed/],
    ['an unknown slot name', FRONT.replace('brief', 'nonsense'), '## user\n{{problem}}', 'product.c4.draft.md', /nonsense/],
  ])('rejects %s', (_what, front, body, name, error) => {
    expect(() => parseTemplateFile(file(front, body), name)).toThrow(error);
  });
});
