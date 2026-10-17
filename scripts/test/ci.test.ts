/**
 * The CI workflow (.github/workflows/verify.yml; ADR-0103) and what the README says about it: `pnpm verify` on one job
 * per operating system, reporting only, with pinned tools and actions, no secrets and the full history; and the
 * README's platform claim names exactly the systems CI runs on.
 */
import { describe, expect, it } from 'vitest';
import { read, section } from './docs.ts';

const workflow = read('.github/workflows/verify.yml');
const pkg = JSON.parse(read('package.json')) as { packageManager?: string; scripts: Record<string, string> };
const readme = read('README.md');

/** The job matrix: one entry per operating system, written `- { name: …, os: …, playwright: … }`. */
const matrix = [...workflow.matchAll(/^\s*- \{ name: ([\w-]+), os: ([\w.-]+), playwright: ([^}]+?) \}\s*$/gm)].map((m) => ({ name: m[1] ?? '', os: m[2] ?? '', playwright: (m[3] ?? '').trim() }));

describe('the CI workflow (ADR-0103)', () => {
  it('has one job per operating system: Windows and Linux, on pinned runner images', () => {
    expect(matrix).toEqual([
      { name: 'windows', os: 'windows-2025', playwright: 'chromium' },
      { name: 'linux', os: 'ubuntu-24.04', playwright: '--with-deps chromium' },
    ]);
    expect(workflow).toMatch(/^\s+runs-on: \$\{\{ matrix\.os \}\}$/m);
  });

  it('runs `pnpm verify` itself, so it checks exactly what a person runs before merging', () => {
    expect(workflow).toMatch(/^\s+run: pnpm verify$/m);
    expect(pkg.scripts.verify).toBe('pnpm -s typecheck && pnpm test && pnpm e2e');
  });

  it('runs on pushes to main, by hand and weekly, and on no other branch', () => {
    const on = /^on:\n([\s\S]*?)\n\S/m.exec(workflow)?.[1] ?? '';
    expect(on).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(on).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(on).toMatch(/^ {4}- cron: '[\d ]+\* \* \d'$/m);
    expect(on).not.toMatch(/pull_request/);
  });

  it('a newer push cancels an older run on the same branch', () => {
    expect(workflow).toMatch(/^concurrency:\n {2}group: verify-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m);
  });

  it('pins every action to a commit, reads with a read-only token, keeps no credentials and uses no secrets', () => {
    const uses = [...workflow.matchAll(/^\s+uses: (\S+)/gm)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(1);
    for (const u of uses) expect(u, u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(workflow).toMatch(/persist-credentials: false/);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it('checks out the whole history, which the decision-log check reads', () => {
    expect(workflow).toMatch(/fetch-depth: 0/);
  });

  it('pins Node in .node-version and pnpm in packageManager, and uses both', () => {
    expect(read('.node-version').trim()).toMatch(/^24\.\d+\.\d+$/);
    expect(workflow).toMatch(/node-version-file: \.node-version/);
    expect(pkg.packageManager).toMatch(/^pnpm@11\.\d+\.\d+$/);
    expect(workflow).toMatch(/npm install --global "\$\(node -p "require\('\.\/package\.json'\)\.packageManager"\)"/);
    expect(workflow).toMatch(/pnpm install --frozen-lockfile/);
  });

  it('provisions Chromium (with its Linux libraries) and the Temporal CLI before the tests', () => {
    expect(workflow).toMatch(/playwright install \$\{\{ matrix\.playwright \}\}/);
    expect(workflow).toMatch(/TestWorkflowEnvironment\.createLocal\(\)/);
  });

  it('on Linux only: Noto CJK in place of WenQuanYi Zen Hei, and an AppArmor profile that lets Playwright’s Chromium start its sandbox', () => {
    const linuxOnly = (step: string) => {
      const at = workflow.indexOf(`- name: ${step}`);
      expect(at, step).toBeGreaterThan(0);
      expect(workflow.slice(at).split('\n')[1]?.trim(), step).toBe("if: ${{ matrix.name == 'linux' }}");
    };
    linuxOnly("Fonts as on Ubuntu's desktop");
    expect(workflow).toContain('apt-get install --yes --no-install-recommends fonts-noto-cjk');
    expect(workflow).toContain('apt-get remove --yes fonts-wqy-zenhei');
    linuxOnly("Let Playwright's Chromium start its OS sandbox");
    expect(workflow).toContain(`"profile playwright-chromium $HOME/.cache/ms-playwright/chromium*/chrome-*/chrome{,-headless-shell} flags=(unconfined) {" '  userns,'`);
    // The machine-wide restriction stays on.
    expect(workflow).not.toMatch(/apparmor_restrict_unprivileged_userns/);
  });
});

describe('the README on platforms and CI (ADR-0103)', () => {
  const systems = matrix.map((m) => ({ windows: 'Windows', linux: 'Linux', macos: 'macOS' })[m.name] ?? m.name);

  it('claims exactly the systems CI runs on, and macOS later', () => {
    const quick = section(readme, '## Quick start') ?? '';
    expect(quick).toContain(`${systems.join(' and ')}; macOS later`);
    expect(readme).not.toMatch(/Windows, macOS and Linux/);
  });

  it('has a CI section that says what runs where, that it blocks nothing, and how to read the last run on main', () => {
    const ci = section(readme, '## CI') ?? '';
    expect(ci).toContain('.github/workflows/verify.yml');
    expect(ci).toContain('`pnpm verify`');
    for (const m of matrix) expect(ci).toContain(m.os);
    expect(ci).toContain('gh run list --branch main --limit 1');
    expect(ci).toMatch(/blocks nothing|refuses nothing/);
  });

  it('no longer says that nothing runs the checks automatically', () => {
    expect(readme).not.toMatch(/No CI service|no CI service/);
  });
});
