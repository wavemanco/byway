/**
 * A tripwire for the backlog's section "Before any distribution" (R2): nothing of byway is distributed yet, and before
 * anything is, byway needs its own licence file (R2 (a), the owner's call) and a licence and notice manifest generated
 * from the artifact (R2 (b)). As label.test.ts does for the study registry's first entry, this fails when a
 * distribution step appears while neither exists: a package.json that drops `private: true` or gains `bin` or
 * `publishConfig`, a Claude Code or Codex plugin or an MCP server manifest, or a workflow that publishes (the review's
 * R2 trace, 2026-10-18). It reads the files git tracks or would add.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { git } from './adr-log.ts';
import { REPO } from './docs.ts';

const SEE = "see docs/backlog.md, 'Before any distribution' (R2 (a) and (b))";
const files = git(REPO, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
/** What R2 (a) and (b) would add: byway's own licence file, and the licence and notice manifest beside it. */
const licensed = existsSync(path.join(REPO, 'LICENSE')) && files.some((f) => /^(NOTICE|THIRD[-_]PARTY[-_]NOTICES)(\.\w+)?$/i.test(f));

/**
 * A plugin or server manifest others install: Claude Code's and Codex's plugin folders, an MCP config or registry entry,
 * a packed desktop extension. Not every manifest.json: recipes/manifest.json is the recipes' own.
 */
const PLUGIN = /(^|\/)(\.claude-plugin|\.codex-plugin)\/|(^|\/)(\.mcp\.json|mcp\.json|server\.json)$|\.(dxt|mcpb)$/;

describe('nothing is distributed while byway has no licence and notice manifest (R2)', () => {
  it('reads the repository: its package files and its workflows', () => {
    expect(files).toContain('package.json');
    expect(files).toContain('.github/workflows/verify.yml');
  });

  it.skipIf(licensed)('every package.json stays private, with no bin or publishConfig', () => {
    const published = files
      .filter((f) => /(^|\/)package\.json$/.test(f))
      .filter((f) => {
        const pkg = JSON.parse(readFileSync(path.join(REPO, f), 'utf8')) as { private?: unknown; bin?: unknown; publishConfig?: unknown };
        return pkg.private !== true || pkg.bin !== undefined || pkg.publishConfig !== undefined;
      });
    expect(published, SEE).toEqual([]);
  });

  it.skipIf(licensed)('no plugin or MCP server manifest, and no workflow that publishes', () => {
    expect(files.filter((f) => PLUGIN.test(f)), SEE).toEqual([]);
    const publishing = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f) && /\b(npm|pnpm|yarn) publish\b|\bvsce publish\b|actions\/create-release|softprops\/action-gh-release|\bgh release create\b/.test(readFileSync(path.join(REPO, f), 'utf8')));
    expect(publishing, SEE).toEqual([]);
  });

  it('the patterns see what they are meant to', () => {
    for (const f of ['.claude-plugin/plugin.json', 'agent/.codex-plugin/plugin.json', '.mcp.json', 'tools/server.json', 'byway.mcpb']) expect(PLUGIN.test(f), f).toBe(true);
    for (const f of ['packages/gateway/src/plugin.ts', 'docs/mcp.md', 'apps/web/package.json', 'recipes/manifest.json']) expect(PLUGIN.test(f), f).toBe(false);
  });
});
