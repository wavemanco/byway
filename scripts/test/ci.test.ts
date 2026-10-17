/**
 * The CI workflow (.github/workflows/verify.yml; ADR-0103) and what the README says about it: `pnpm verify` on one job
 * per operating system, reporting only, with pinned tools and actions, no secrets and the full history; and the
 * README's platform claim names exactly the systems CI runs on.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, read, REPO, section } from './docs.ts';
import { actionProblems, usesValues } from './workflow-guard.ts';

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
    // TEMPORARY, this commit only: the workflow also runs for fix/fx-d4-ci, to prove it before the merge.
    expect(on).toMatch(/^ {2}push:\n {4}# TEMPORARY[^\n]*\n {4}branches: \[main, fix\/fx-d4-ci\]$/m);
    expect(on).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(on).toMatch(/^ {4}- cron: '[\d ]+\* \* \d'$/m);
    expect(on).not.toMatch(/pull_request/);
  });

  it('a newer run on the same branch, of any trigger, cancels one still going, and the workflow, README and ADR-0103 say so', () => {
    // One group per ref, whatever started the run: a push, the weekly run or a run started by hand.
    expect(workflow).toMatch(/^concurrency:\n {2}group: verify-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m);
    const said = 'A newer run on the same branch, of any trigger (a push, the weekly run or a run started by hand), cancels one still going.';
    expect(workflow).toContain(`# ${said}`);
    expect(section(readme, '## CI')).toContain(said);
    expect(read('docs/adr/0103-adr-log-rule-and-ci.md')).toContain(said);
    for (const text of [workflow, readme, read('docs/adr/0103-adr-log-rule-and-ci.md')]) expect(text).not.toMatch(/A newer push cancels/);
  });

  it('pins every action and reusable workflow it uses to a commit, in every file under .github and every local action, and names no secrets', () => {
    const files = Object.fromEntries(filesUnder('.github', /\.ya?ml$/).map((f) => [f, read(f)]));
    expect(Object.keys(files)).toContain('.github/workflows/verify.yml');
    expect(usesValues('.github/workflows/verify.yml', workflow).length).toBeGreaterThan(1);
    expect(actionProblems(files, (rel) => (existsSync(path.join(REPO, rel)) ? read(rel) : undefined))).toEqual([]);
  });

  it('reads with a read-only token and keeps no credentials after checkout', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(workflow).toMatch(/persist-credentials: false/);
  });

  it('checks out the whole history, which the decision-log check reads', () => {
    expect(workflow).toMatch(/fetch-depth: 0/);
  });

  it('pins Node in .node-version and pnpm in packageManager, and uses both', () => {
    expect(read('.node-version').trim()).toMatch(/^24\.\d+\.\d+$/);
    expect(workflow).toMatch(/node-version-file: \.node-version/);
    // The owner's decision (ADR-0103 §3): the newest pnpm 11 release at or above 11.13.1. npm marks 11.12.0 as broken
    // ("Please upgrade to v11.13.1 or newer"). `npm view pnpm dist-tags` on 2026-10-17: latest-11 is 11.28.6.
    expect(pkg.packageManager).toBe('pnpm@11.28.6');
    // pnpm/action-setup reads packageManager itself; given a version of its own as well, it stops with an error.
    const setup = /^ {6}- name: pnpm[^\n]*\n {8}uses: pnpm\/action-setup@([0-9a-f]{40}) # v6\.1\.0\n(?! {8}with:)/m.exec(workflow);
    expect(setup?.[1]).toBe('ea17c68df8912ef543352723c149a84f56e3d413');
    expect(workflow).not.toMatch(/npm install --global/);
    expect(workflow.indexOf('pnpm/action-setup')).toBeGreaterThan(workflow.indexOf('actions/setup-node'));
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

describe('the pin and secrets guard fails on a bad workflow', () => {
  const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
  const job = (steps: string) => `on: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n${steps}\n`;
  const check = (files: Record<string, string>) => actionProblems(files);
  const one = (steps: string) => check({ '.github/workflows/w.yml': job(steps) });

  it('passes actions pinned to a full commit SHA, in either step form, and a Docker image pinned by digest', () => {
    expect(one(`      - uses: actions/cache@${SHA} # v4\n      - name: Node\n        uses: actions/setup-node@${SHA}\n      - uses: docker://node@sha256:${'a'.repeat(64)}`)).toEqual([]);
  });

  it.each([
    ['a "- uses:" step', '      - uses: actions/cache@v4\n        with:\n          path: x'],
    ['a "uses:" key under "- name:"', '      - name: Cache\n        uses: actions/cache@v4'],
    ['a flow mapping', '      - { uses: actions/cache@v4 }'],
    ['a double-quoted value', '      - uses: "actions/cache@v4"'],
    ['a quoted key', "      - 'uses': actions/cache@v4"],
    ['a short SHA', '      - uses: actions/cache@3d3c42e'],
    ['a branch', '      - uses: actions/cache@main'],
    ['no ref at all', '      - uses: actions/cache'],
    ['a Docker image by tag', '      - uses: docker://node:24'],
    ['a value on the next line', '      - uses:\n          actions/cache@v4'],
  ])('fails on an unpinned action in %s', (_, steps) => {
    expect(one(steps)).toHaveLength(1);
  });

  it('fails on a reusable workflow called by tag or branch, and passes one called by commit', () => {
    const call = (ref: string) => check({ '.github/workflows/w.yml': `on: push\njobs:\n  call:\n    uses: octo/repo/.github/workflows/build.yml@${ref}\n` });
    expect(call('v1')).toHaveLength(1);
    expect(call('main')).toHaveLength(1);
    expect(call(SHA)).toEqual([]);
  });

  it('reads a local composite action or reusable workflow and fails on an unpinned action inside it, or on one that is missing', () => {
    const files = (inner: string) => ({
      '.github/workflows/w.yml': job('      - uses: ./.github/actions/setup\n      - uses: ./tools/release'),
      '.github/actions/setup/action.yml': `runs:\n  using: composite\n  steps:\n    - uses: actions/cache@${inner}\n`,
    });
    const tools = (rel: string) => (rel === 'tools/release/action.yaml' ? `runs:\n  using: composite\n  steps:\n    - run: echo\n      shell: bash\n` : undefined);
    expect(actionProblems(files(SHA), tools)).toEqual([]);
    expect(actionProblems(files('v4'), tools)).toEqual([expect.stringContaining('.github/actions/setup/action.yml:4')]);
    expect(actionProblems(files(SHA))).toEqual([expect.stringContaining('./tools/release')]);
    const reusable = { '.github/workflows/w.yml': 'on: push\njobs:\n  call:\n    uses: ./.github/workflows/build.yml\n' };
    expect(actionProblems(reusable)).toEqual([expect.stringContaining('./.github/workflows/build.yml')]);
    expect(actionProblems({ ...reusable, '.github/workflows/build.yml': job('      - uses: actions/cache@v4') })).toEqual([expect.stringContaining('.github/workflows/build.yml:6')]);
  });

  it.each([
    ['an expression', '      - run: echo "${{ secrets.TOKEN }}"'],
    ['an index', "      - run: echo \"${{ secrets['TOKEN'] }}\""],
    ['the whole context', '      - run: echo "${{ toJSON(secrets) }}"'],
    ['capitals', '      - run: echo "${{ SECRETS.TOKEN }}"'],
    ['an environment variable', '      - run: echo "$TOKEN"\n        env:\n          TOKEN: ${{ secrets.TOKEN }}'],
  ])('fails on secrets in %s', (_, steps) => {
    expect(one(steps)).toHaveLength(1);
  });

  it('fails on a reusable workflow given the caller’s secrets', () => {
    expect(check({ '.github/workflows/w.yml': `on: push\njobs:\n  call:\n    uses: octo/repo/.github/workflows/build.yml@${SHA}\n    secrets: inherit\n` })).toHaveLength(1);
  });
});

describe('branch and tag protection, as set on GitHub (ADR-0103 §8)', () => {
  // `gh api repos/wavemanco/byway/rulesets` on 2026-10-17: "Protect main" (~DEFAULT_BRANCH: deletion,
  // non_fast_forward) and "Protect tags" (~ALL tags: deletion, update, non_fast_forward), neither with a bypass actor.
  const adr = section(read('docs/adr/0103-adr-log-rule-and-ci.md'), '### 8. Branch protection, and what CR14 still lacks') ?? '';
  const playbook = read('docs/playbook.md').split('\n').find((l) => l.startsWith('| **Public record for the charter**')) ?? '';

  it('ADR-0103 says both rulesets exist, with their rules and no bypass list', () => {
    expect(adr).toContain('"Protect main"');
    expect(adr).toMatch(/"Protect main"[^.]*`deletion` and `non_fast_forward` on the default branch/);
    expect(adr).toMatch(/"Protect tags"[^.]*`deletion`, `update` and `non_fast_forward` on all tags/);
    expect(adr).toMatch(/no bypass list/);
    expect(adr).not.toMatch(/Branch protection is the owner's setting, made by/);
  });

  it('the playbook no longer lists protected branches as still to do, and names the rulesets', () => {
    expect(playbook).not.toMatch(/protected branches too/);
    expect(playbook).toContain('"Protect main" and "Protect tags"');
  });
});

describe('the README on platforms and CI (ADR-0103)', () => {
  const systems = matrix.map((m) => ({ windows: 'Windows', linux: 'Linux', macos: 'macOS' })[m.name] ?? m.name);

  it('claims exactly the systems CI runs on, and macOS later', () => {
    const quick = section(readme, '## Quick start') ?? '';
    expect(quick).toContain(`${systems.join(' and ')}; macOS later`);
    expect(readme).not.toMatch(/Windows, macOS and Linux/);
  });

  it('names the Node and pnpm versions CI pins, and says pnpm switches itself to the pinned one', () => {
    const quick = section(readme, '## Quick start') ?? '';
    const pnpm = (pkg.packageManager ?? '').replace(/^pnpm@/, '');
    expect(quick).toContain(`with Node ${read('.node-version').trim()} and pnpm ${pnpm}`);
    expect(quick).toContain('pnpm switches itself to the version pinned in `package.json` (`packageManager`), downloading it once');
  });

  it('has a CI section that says what runs where, that it blocks nothing, and how to read the last run on main', () => {
    const ci = section(readme, '## CI') ?? '';
    expect(ci).toContain('.github/workflows/verify.yml');
    expect(ci).toContain('`pnpm verify`');
    for (const m of matrix) expect(ci).toContain(m.os);
    expect(ci).toContain('gh run list --branch main --limit 1');
    expect(ci).toMatch(/blocks nothing|refuses nothing/);
  });

  it('gives the Playwright install command each CI job runs: on Linux, with --with-deps', () => {
    const tests = section(readme, '## Tests') ?? '';
    expect(tests).toContain('`pnpm --filter ./apps/web exec playwright install chromium`');
    expect(tests).toContain('on Linux, `pnpm --filter ./apps/web exec playwright install --with-deps chromium`');
    for (const m of matrix) expect(tests, m.name).toContain(`exec playwright install ${m.playwright}\``);
  });

  it('no longer says that nothing runs the checks automatically', () => {
    expect(readme).not.toMatch(/No CI service|no CI service/);
  });
});
