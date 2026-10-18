/**
 * The CI workflow (.github/workflows/verify.yml; ADR-0103) and what the README says about it: `pnpm verify` on one job
 * per operating system, reporting only, with pinned tools and actions, no secrets and the full history; and the
 * README's platform claim names exactly the systems CI runs on.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { filesUnder, read, REPO, section } from './docs.ts';
import { actionProblems, usesValues } from './workflow-guard.ts';

const workflow = read('.github/workflows/verify.yml');
const pkg = JSON.parse(read('package.json')) as { packageManager?: string; scripts: Record<string, string> };
const readme = read('README.md');

/** The job matrix: one entry per operating system, written `- { name: …, os: …, playwright: … }`. */
const matrix = [...workflow.matchAll(/^\s*- \{ name: ([\w-]+), os: ([\w.-]+), playwright: ([^}]+?) \}\s*$/gm)].map((m) => ({ name: m[1] ?? '', os: m[2] ?? '', playwright: (m[3] ?? '').trim() }));

type Step = { name?: string; id?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown> };
/** The job's steps, as YAML reads them. */
const steps = (parse(workflow) as { jobs: { verify: { steps: Step[] } } }).jobs.verify.steps;

/** The script the README gives for Ubuntu 24.04 and later (ADR-0105). */
const SCRIPT = 'scripts/linux/allow-chromium-sandbox.sh';

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
    // pnpm/action-setup reads packageManager itself, so the workflow sets no version. At the pinned SHA, a `version`
    // input that differs from packageManager stops it with an error ("Multiple versions of pnpm specified"); the same
    // version passes, but would be a second place to keep in step.
    const setup = /^ {6}- name: pnpm[^\n]*\n {8}uses: pnpm\/action-setup@([0-9a-f]{40}) # v6\.1\.0\n(?! {8}with:)/m.exec(workflow);
    expect(setup?.[1]).toBe('ea17c68df8912ef543352723c149a84f56e3d413');
    expect(workflow).toContain('given a `version` input that differs from it, it stops with an error');
    expect(workflow).not.toMatch(/given a second one/);
    expect(workflow).not.toMatch(/npm install --global/);
    expect(workflow.indexOf('pnpm/action-setup')).toBeGreaterThan(workflow.indexOf('actions/setup-node'));
    expect(workflow).toMatch(/pnpm install --frozen-lockfile/);
  });

  it('provisions Chromium (with its Linux libraries) and the Temporal CLI before the tests', () => {
    expect(workflow).toMatch(/playwright install \$\{\{ matrix\.playwright \}\}/);
    expect(steps.filter((s) => /playwright install/.test(s.run ?? ''))).toHaveLength(1);
    expect(workflow).toMatch(/TestWorkflowEnvironment\.createLocal\(\)/);
  });

  it("on Linux only: Noto CJK in place of WenQuanYi Zen Hei, and the README's script after Playwright's own install: one AppArmor profile, on Playwright's own folder, that says what else it allows", () => {
    const linuxOnly = (step: string) => {
      const at = workflow.indexOf(`- name: ${step}`);
      expect(at, step).toBeGreaterThan(0);
      expect(workflow.slice(at).split('\n')[1]?.trim(), step).toBe("if: ${{ matrix.name == 'linux' }}");
    };
    linuxOnly("Fonts as on Ubuntu's desktop");
    expect(workflow).toContain('apt-get install --yes --no-install-recommends fonts-noto-cjk');
    expect(workflow).toContain('apt-get remove --yes fonts-wqy-zenhei');
    linuxOnly("Let Playwright's Chromium start its OS sandbox");

    // CI runs the script the README gives a Linux user, and byway's own message names, after Playwright's own install and
    // before the tests, so every run tries those steps on a fresh Ubuntu 24.04 machine (ADR-0105). Nothing else is set up
    // for it: byway takes Chromium from Playwright's own folder, as on a person's machine.
    const at = steps.findIndex((s) => (s.name ?? '').startsWith("Let Playwright's Chromium start its OS sandbox"));
    expect(steps[at]?.run?.trim()).toBe(`sh ${SCRIPT}`);
    expect(steps.findIndex((s) => /playwright install/.test(s.run ?? ''))).toBeLessThan(at);
    expect(at).toBeLessThan(steps.findIndex((s) => s.run === 'pnpm verify'));
    expect(workflow).not.toMatch(/PLAYWRIGHT_BROWSERS_PATH|GITHUB_ENV|\/opt\//);
    expect(section(readme, '## Renderer')).toContain(`sh ${SCRIPT}`);
    const sandbox = read('packages/runner/src/sandbox.ts');
    expect(sandbox).toContain(`export const APPARMOR_SCRIPT = '${SCRIPT}';`);
    expect(sandbox).not.toMatch(/ROOT_BROWSERS_FOLDER|\/opt\//);

    // The script: one profile, on Playwright's own folder as Playwright finds it on Linux (XDG_CACHE_HOME moves it), for
    // the headless shell and full Chromium in the folder layout Playwright 1.63 uses; it refuses a folder PLAYWRIGHT_BROWSERS_PATH moves elsewhere.
    // It installs nothing and runs nothing of byway's as root: its only commands as root write the profile and load it.
    const script = read(SCRIPT);
    expect(script).toContain('\nfolder="${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright"\n');
    expect([...script.matchAll(/profile playwright-chromium (\S+)/g)].map((m) => m[1])).toEqual(['$folder/chromium*/chrome-*/chrome{,-headless-shell}']);
    expect(script).toContain(`"profile playwright-chromium $folder/chromium*/chrome-*/chrome{,-headless-shell} flags=(unconfined) {" '  userns,'`);
    expect(script).toContain('if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then');
    const asRoot = script.split('\n').filter((l) => /\bsudo\b/.test(l) && !/^\s*(#|echo )/.test(l));
    expect(asRoot).toEqual([expect.stringMatching(/\| sudo tee "\$profile" > \/dev\/null$/), 'sudo apparmor_parser --replace "$profile"']);
    expect(script).not.toMatch(/\/opt\/|PLAYWRIGHT_BROWSERS_PATH=|playwright install|chown|chmod/);
    // It says plainly, at its top and in what it prints at the end, what else the profile allows, and the alternative.
    const header = script.slice(0, script.indexOf('set -eu'));
    const printed = script.slice(script.indexOf('sudo apparmor_parser --replace'));
    for (const said of [header, printed]) {
      expect(said).toMatch(/any program running as you can (then|now) create user namespaces through this profile/);
      expect(said).toContain('LD_PRELOAD');
      expect(said).toContain('aa-exec');
      expect(said).toContain('kernel.apparmor_restrict_unprivileged_unconfined is 0');
      expect(said).toContain("switch byway's sandbox off in Settings");
    }
    expect(spawnSync('git', ['ls-files', '--stage', SCRIPT], { cwd: REPO, encoding: 'utf8' }).stdout).toMatch(/^100755 /);
    // The machine-wide restriction stays on: the script only reads it, and the workflow does not touch it.
    expect(script).not.toMatch(/sysctl|> *"?\$restrict|tee[^\n]*restrict/);
    expect(workflow).not.toMatch(/apparmor_restrict_unprivileged_userns/);
    // It is valid shell where a POSIX shell is at hand (on Windows, Git's, when it is on the PATH), and it refuses a moved
    // folder, and one whose path would change what the profile covers, before it asks for anything.
    const sh = spawnSync('sh', ['-n', path.join(REPO, SCRIPT)], { encoding: 'utf8' });
    if (!(process.platform === 'win32' && sh.error) && process.getuid?.() !== 0) {
      expect(sh.status, sh.stderr).toBe(0);
      const run = (env: Record<string, string>) => spawnSync('sh', [path.join(REPO, SCRIPT)], { encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '', ...env } });
      const moved = run({ PLAYWRIGHT_BROWSERS_PATH: '/elsewhere' });
      expect(moved.status).toBe(1);
      expect(moved.stderr).toContain("PLAYWRIGHT_BROWSERS_PATH is set (/elsewhere). This script covers Playwright's own folder only");
      const spaced = run({ XDG_CACHE_HOME: '/home/a b/.cache' });
      expect(spaced.status).toBe(1);
      expect(spaced.stderr).toContain("Playwright's folder, /home/a b/.cache/ms-playwright, has a space or one of");
      const relative = run({ XDG_CACHE_HOME: 'cache' });
      expect(relative.status).toBe(1);
      expect(relative.stderr).toContain("Playwright's folder, cache/ms-playwright, is not a full path");
    }
  });

  it('nowhere says the profile gives the namespaces to Chromium alone, that the rest of the machine stays restricted, that the sandbox off keeps the restriction whole, or that the profile covers every version', () => {
    // The ADRs quote them as what the checks found untrue: round 2's checks the first two (ADR-0105 and ADR-0103's later
    // note), round 3's checks and the check of a3d271f the others (ADR-0105, Evidence).
    for (const file of [SCRIPT, '.github/workflows/verify.yml', 'README.md', 'apps/web/README.md', 'packages/runner/src/sandbox.ts', 'packages/runner/src/pages.ts', 'scripts/serve.ts', 'docs/backlog.md']) {
      expect(read(file), file).not.toMatch(/and nothing else, create user namespaces|for nothing else; the rest|rest of the machine stays restricted|Chromium alone|only the Chromium there|restriction whole|every version in that folder|Chromium, any version/);
    }
  });

  it('when a job fails, uploads the end-to-end server log and Playwright’s traces from where the suite writes them, at most one of each per operating system, each skipped when it finds no file (ADR-0106)', () => {
    // Where the suite writes them: scripts/e2e.ts puts the server's output in the system temp folder, and Playwright
    // keeps a trace and a screenshot of each failed browser test in apps/web/test-results.
    expect(read('scripts/e2e.ts')).toContain("const logFile = path.join(tmpdir(), 'byway-e2e-server.log');");
    const config = read('apps/web/playwright.config.ts');
    expect(config).toContain("outputDir: './test-results',");
    expect(config).toContain("trace: 'retain-on-failure',");
    expect(config).toContain("screenshot: 'only-on-failure',");

    const at = (name: string) => steps.findIndex((s) => s.name === name);
    const verify = steps.findIndex((s) => s.run === 'pnpm verify');
    const names = ['Where the end-to-end server log is (on failure)', 'Upload the end-to-end server log (on failure)', "Upload Playwright's traces and screenshots (on failure)"];
    // The last three steps, after `pnpm verify`, in this order, and only when a step before them failed.
    expect(names.map(at)).toEqual([verify + 1, verify + 2, verify + 3]);
    expect(steps.length).toBe(verify + 4);
    for (const name of names) expect(steps[at(name)]?.if, name).toBe('${{ failure() }}');

    // The first finds the system temp folder as scripts/e2e.ts does, on the machine it runs on.
    const where = steps[at(names[0]!)]!;
    expect(where.id).toBe('e2e-log');
    const script = /^node -e "(.*)" >> "\$GITHUB_OUTPUT"$/.exec(where.run ?? '')?.[1];
    expect(script).toBeDefined();
    const printed = spawnSync(process.execPath, ['-e', script!], { encoding: 'utf8' });
    expect(printed.stdout.trim()).toBe(`path=${path.join(realpathSync.native(tmpdir()), 'byway-e2e-server.log')}`);

    const UPLOAD = 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
    expect(workflow.split(`uses: ${UPLOAD} # v7.0.1`).length - 1).toBe(2);
    expect(steps[at(names[1]!)]).toMatchObject({ uses: UPLOAD, with: { name: 'e2e-server-log-${{ matrix.name }}', path: '${{ steps.e2e-log.outputs.path }}', 'if-no-files-found': 'ignore', 'retention-days': 14 } });
    expect(steps[at(names[2]!)]).toMatchObject({ uses: UPLOAD, with: { name: 'playwright-results-${{ matrix.name }}', path: 'apps/web/test-results', 'if-no-files-found': 'ignore', 'retention-days': 14 } });
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

  // The round-1 check of this guard found these spellings passing a line reader; each is valid YAML that a YAML reader
  // (yaml@2.9.1) reads as `uses: actions/cache@v4`, or as a run naming the secrets context.
  it.each([
    ['a double-quoted key with an escape', '      - "u\\x73es": actions/cache@v4'],
    ['a double-quoted key with a Unicode escape', '      - "\\u0075ses": actions/cache@v4'],
    ['a complex key', '      - ? uses\n        : actions/cache@v4'],
    ['an alias', '      - name: &ref actions/cache@v4\n        run: echo\n      - uses: *ref'],
    ['a key in capitals', '      - USES: actions/cache@v4'],
  ])('fails on an unpinned action in %s, read as YAML', (_, steps) => {
    expect(one(steps)).toHaveLength(1);
  });

  it('fails on an unpinned action in a flow pair inside a flow sequence', () => {
    expect(check({ '.github/workflows/w.yml': 'on: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps: [uses: actions/cache@v4]\n' })).toHaveLength(1);
  });

  it('fails closed on a pinned action whose `uses` is not written plainly on its line: the line reader is the backstop for a YAML reader that reads it otherwise', () => {
    for (const steps of [`      - "u\\x73es": actions/cache@${SHA}`, `      - ? uses\n        : actions/cache@${SHA}`, `      - uses:\n          actions/cache@${SHA}`]) {
      expect(one(steps), steps).toEqual([expect.stringContaining('write it as "uses: <value>" on one line')]);
    }
  });

  it('fails closed on a line that shows an unpinned `uses` where the YAML reader reads text (a script): the line reader stands on its own', () => {
    expect(one('      - run: |\n          uses: actions/cache@v4')).toEqual([expect.stringContaining('.github/workflows/w.yml:7: actions/cache@v4 is not pinned')]);
  });

  it.each([
    ['a hexadecimal escape', '      - run: "echo ${{ s\\x65crets.TOKEN }}"'],
    ['a Unicode escape', '      - run: "echo ${{ \\u0073ecrets.TOKEN }}"'],
    ['an escaped line break', '      - run: "echo ${{ sec\\\n          rets.TOKEN }}"'],
  ])('fails on secrets written with %s in a double-quoted value', (_, steps) => {
    expect(one(steps)).toHaveLength(1);
  });

  it.each([
    ['a duplicate key', `      - uses: actions/cache@${SHA}\n        uses: actions/setup-node@${SHA}`],
    ['a tag the reader does not know', `      - uses: !pinned actions/cache@${SHA}`],
    ['a key that is a list', `      - ? [uses]\n        : actions/cache@${SHA}`],
    ['text that is not YAML', `      - uses: [actions/cache@${SHA}`],
  ])('fails closed on %s', (_, steps) => {
    expect(one(steps).length).toBeGreaterThan(0);
  });

  it('holds a job’s container and its services to images pinned by digest, and fails an action built from a Dockerfile', () => {
    const DIGEST = `sha256:${'b'.repeat(64)}`;
    const jobWith = (lines: string) => ({ '.github/workflows/w.yml': `on: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n${lines}\n    steps:\n      - run: echo\n` });
    expect(check(jobWith(`    container: node@${DIGEST}\n    services:\n      db:\n        image: postgres@${DIGEST}\n      cache: redis@${DIGEST}`))).toEqual([]);
    expect(check(jobWith(`    container:\n      image: node@${DIGEST}\n      options: --cpus 1`))).toEqual([]);
    for (const lines of ['    container: node:24', '    container:\n      image: node:24', '    container:\n      image: ${{ matrix.image }}', '    container:\n      options: --cpus 1', '    services:\n      db:\n        image: postgres:latest', '    services:\n      cache: redis']) {
      expect(check(jobWith(lines)), lines).toEqual([expect.stringMatching(/is not pinned by its digest|names no image/)]);
    }
    const action = (image: string) => ({ '.github/workflows/w.yml': job('      - uses: ./.github/actions/tool'), '.github/actions/tool/action.yml': `runs:\n  using: docker\n  image: ${image}\n` });
    expect(check(action(`docker://alpine@${DIGEST}`))).toEqual([]);
    expect(check(action('docker://alpine:3'))).toEqual([expect.stringContaining('runs.image')]);
    expect(check(action('Dockerfile'))).toEqual([expect.stringContaining('built from a Dockerfile')]);
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

  it('gives the Playwright install command each CI job runs: on Linux, with --with-deps, and then the script', () => {
    const tests = section(readme, '## Tests') ?? '';
    expect(tests).toContain('`pnpm --filter ./apps/web exec playwright install chromium`');
    expect(tests).toContain('on Linux, `pnpm --filter ./apps/web exec playwright install --with-deps chromium`');
    for (const m of matrix) expect(tests, m.name).toContain(`exec playwright install ${m.playwright}\``);
    expect(tests).toContain(`\`sh ${SCRIPT}\``);
    expect(readme).not.toMatch(/PLAYWRIGHT_BROWSERS_PATH=|\/opt\//);
  });

  it('no longer says that nothing runs the checks automatically', () => {
    expect(readme).not.toMatch(/No CI service|no CI service/);
  });
});
