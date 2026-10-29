/**
 * The CI workflow (.github/workflows/verify.yml; ADR-0103) and what the README says about it: `pnpm verify` on one job
 * per operating system, reporting only, with pinned tools and actions, no secrets and the full history; the weekly
 * run's report of the Playwright pin (scripts/playwright-pin.ts, the owner's answer of 2026-10-21 on D4), which fails
 * nothing; and the README's platform claim names exactly the systems CI runs on.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { pinReport, pinsIn, PINNED, REGISTRY, report, type Registry, type ReportOptions } from '../playwright-pin.ts';
import { filesUnder, read, REPO, section } from './docs.ts';
import { actionProblems, usesValues } from './workflow-guard.ts';

const workflow = read('.github/workflows/verify.yml');
const pkg = JSON.parse(read('package.json')) as { packageManager?: string; scripts: Record<string, string> };
const readme = read('README.md');

/** The job matrix: one entry per operating system, written `- { name: …, os: …, playwright: … }`. */
const matrix = [...workflow.matchAll(/^\s*- \{ name: ([\w-]+), os: ([\w.-]+), playwright: ([^}]+?) \}\s*$/gm)].map((m) => ({ name: m[1] ?? '', os: m[2] ?? '', playwright: (m[3] ?? '').trim() }));

type Step = { name?: string; id?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: unknown; 'continue-on-error'?: boolean; 'timeout-minutes'?: number };
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
      // As root (an `id` of its own on the PATH says 0): refused before anything else (D2 (h)).
      const bin = mkdtempSync(path.join(tmpdir(), 'byway-id-'));
      writeFileSync(path.join(bin, 'id'), '#!/bin/sh\necho 0\n', { mode: 0o755 });
      const root = run({ PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` });
      expect(root.status).toBe(1);
      expect(root.stderr).toContain('Run this as yourself, not as root');
      rmSync(bin, { recursive: true, force: true });
      // The two refusals after the restriction is read, on a Linux whose AppArmor restricts user namespaces (CI's):
      // each stops before sudo, so the real profile is never written.
      if (existsSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns')) {
        const tmp = mkdtempSync(path.join(tmpdir(), 'byway-apparmor-'));
        const missing = run({ XDG_CACHE_HOME: tmp });
        expect(missing.status).toBe(1);
        expect(missing.stderr).toContain(`Playwright's folder, ${tmp}/ms-playwright, does not exist yet`);
        mkdirSync(path.join(tmp, 'a b', 'ms-playwright'), { recursive: true });
        mkdirSync(path.join(tmp, 'cache'));
        symlinkSync(path.join(tmp, 'a b', 'ms-playwright'), path.join(tmp, 'cache', 'ms-playwright'));
        const linked = run({ XDG_CACHE_HOME: path.join(tmp, 'cache') });
        expect(linked.status).toBe(1);
        expect(linked.stdout).toContain(`Playwright's folder, ${tmp}/cache/ms-playwright, leads to ${realpathSync(tmp)}/a b/ms-playwright`);
        expect(linked.stderr).toContain(`Playwright's folder, ${realpathSync(tmp)}/a b/ms-playwright, has a space or one of`);
        rmSync(tmp, { recursive: true, force: true });
      }
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
  const playbook = read('docs/playbook.md').split('\n').find((l) => l.includes('| **Public record for the charter**')) ?? '';

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

/**
 * The owner's answer of 2026-10-21 on the Playwright cadence (D4): "Within two weeks of each release (Recommended)",
 * with "The weekly CI run reports when the pin falls behind." The report runs on the weekly run, once, and fails
 * nothing; what it says is tested here on npm's record as a fixture, never on the network.
 */
describe("the weekly run's report of the Playwright pin (D4)", () => {
  const day = (d: string) => new Date(`${d}T12:00:00.000Z`);
  /** npm's record as the registry answers it: the latest release, and when each version came out. */
  const registry = (latest: string, time: Record<string, string>): Registry => ({ 'dist-tags': { latest }, time: { created: '2020-01-01T00:00:00.000Z', ...time } });
  const PINS = [
    { where: 'packages/runner', version: '1.63.0' },
    { where: 'apps/web', version: '1.63.0' },
  ];
  const RELEASES = { '1.63.0': '2026-09-04T22:45:21.732Z', '1.64.0-alpha-2026-09-20': '2026-09-20T00:00:00.000Z', '1.64.0': '2026-10-07T20:42:55.791Z', '1.64.1': '2026-10-14T11:54:49.998Z' };
  type Fetch = NonNullable<ReportOptions['fetch']>;
  const answer = (status: number, body: () => Promise<unknown>): Fetch => async () => ({ ok: status === 200, status, json: body });
  /**
   * A root whose two package files pin Playwright as given, so that what report() says does not depend on the
   * repository's own pins, which move with every update (ADR-0110). The repository's pins are read in their own test.
   */
  const pinnedAt = (version: string): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'byway-pin-root-'));
    for (const { file, name } of PINNED) {
      mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(root, file), JSON.stringify({ dependencies: { [name]: version } }));
    }
    return root;
  };

  it('runs on the weekly run only, on one job, after Node is set up and before the tests, and cannot fail the job', () => {
    const at = steps.findIndex((s) => s.run === 'node scripts/playwright-pin.ts');
    expect(steps.filter((s) => /playwright-pin/.test(s.run ?? ''))).toHaveLength(1);
    const step = steps[at]!;
    expect(step.if).toBe("${{ github.event_name == 'schedule' && matrix.name == 'linux' }}");
    expect(step['continue-on-error']).toBe(true);
    expect(step['timeout-minutes']).toBeLessThanOrEqual(5);
    expect(step).not.toHaveProperty('env');
    expect(step).not.toHaveProperty('uses');
    expect(at).toBeGreaterThan(steps.findIndex((s) => (s.name ?? '').startsWith('Node (')));
    expect(at).toBeLessThan(steps.findIndex((s) => s.run === 'pnpm verify'));
    // The script exits 0 whatever it finds: nothing in it sets an exit code.
    const script = read('scripts/playwright-pin.ts');
    expect(script).not.toMatch(/process\.exit|exitCode/);
    expect(script.trim().split('\n').at(-1)).toBe('if (import.meta.main) await report({ ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}) });');
  });

  it("reads the pins the two packages have, and npm's record with no key", () => {
    const pins = pinsIn(REPO);
    expect(pins.map((p) => p.where)).toEqual(['packages/runner', 'apps/web']);
    for (const [i, { file, name }] of PINNED.entries()) {
      const pkg = JSON.parse(read(file)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      expect(pins[i]!.version, file).toBe(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
    }
    expect(REGISTRY).toBe('https://registry.npmjs.org/playwright');
  });

  it('a pin a minor release behind: when that minor came out, and how much of the two weeks is left, or that they are up', () => {
    expect(pinReport(PINS, registry('1.64.1', RELEASES), day('2026-10-21'))).toEqual({
      behind: true,
      lines: [
        "byway pins Playwright 1.63.0 (packages/runner and apps/web); npm's latest release is 1.64.1, out on 2026-10-14.",
        '1.64.0, the first minor release after the pin, came out on 2026-10-07, 13 days ago. The cadence the owner chose on 2026-10-21 is an update within two weeks of each minor release, sooner for a high or critical Chromium security fix: 1 day is left.',
      ],
    });
    expect(pinReport(PINS, registry('1.64.1', RELEASES), day('2026-10-10')).lines[1]).toMatch(/came out on 2026-10-07, 2 days ago\. .*: 12 days are left\.$/);
    expect(pinReport(PINS, registry('1.64.1', RELEASES), day('2026-10-30')).lines[1]).toMatch(/22 days ago\. .*: the two weeks are up\.$/);
  });

  it('a pin a patch behind, a pin at the latest release, and pins that differ', () => {
    const patch = pinReport([{ where: 'packages/runner', version: '1.64.0' }], registry('1.64.1', RELEASES), day('2026-10-21'));
    expect(patch.behind).toBe(true);
    expect(patch.lines[1]).toMatch(/^It is a patch release of the pinned minor\./);
    expect(pinReport(PINS, registry('1.63.0', RELEASES), day('2026-10-21'))).toEqual({ behind: false, lines: ["byway pins Playwright 1.63.0 (packages/runner and apps/web), npm's latest release."] });
    const differ = pinReport([PINS[0]!, { where: 'apps/web', version: '1.64.1' }], registry('1.64.1', RELEASES), day('2026-10-21'));
    expect(differ.lines[0]).toBe('The Playwright pins differ: packages/runner 1.63.0, apps/web 1.64.1. They should name one release.');
    expect(differ.lines[1]).toMatch(/^byway pins Playwright 1\.63\.0 \(packages\/runner\); /);
  });

  it("never fails: what it cannot read is said in one line, which goes to the run's summary too", async () => {
    const run = async (fetch: Fetch, root = pinnedAt('1.63.0')) => {
      const lines: string[] = [];
      const summary = path.join(mkdtempSync(path.join(tmpdir(), 'byway-pin-')), 'summary.md');
      writeFileSync(summary, '');
      const before = process.exitCode;
      await expect(report({ fetch, root, now: () => day('2026-10-21'), print: (l) => lines.push(l), summary })).resolves.toBeUndefined();
      expect(process.exitCode).toBe(before);
      return { lines, summary: readFileSync(summary, 'utf8') };
    };
    const cases: [string, Fetch, string][] = [
      ['no network', async () => Promise.reject(new Error('getaddrinfo ENOTFOUND registry.npmjs.org')), 'getaddrinfo ENOTFOUND registry.npmjs.org'],
      ['an error status', answer(503, async () => ({})), "npm's registry answered 503"],
      ['an answer that is not JSON', answer(200, async () => Promise.reject(new SyntaxError('Unexpected token'))), 'Unexpected token'],
      ['no latest release', answer(200, async () => ({ 'dist-tags': { latest: 'soon' } })), 'npm names no latest release'],
    ];
    for (const [what, fetch, said] of cases) {
      const out = await run(fetch);
      expect(out.lines, what).toEqual([`Whether the Playwright pin has fallen behind could not be read (${said}), so this run reports nothing on it.`]);
      expect(out.summary, what).toContain(out.lines[0]);
    }
    // Package files that pin no single release.
    expect((await run(answer(200, async () => registry('1.64.1', RELEASES)), pinnedAt('^1.63.0'))).lines[0]).toContain('does not pin playwright to one release');
    // An answer that quotes a line break and a workflow command stays one plain line (B-020; the price report's plain()).
    const planted = await run(answer(200, async () => Promise.reject(new SyntaxError('Unexpected token in "x\n::error::planted\r\n##[warning]also"'))));
    expect(planted.lines).toEqual(['Whether the Playwright pin has fallen behind could not be read (Unexpected token in "x ::error::planted ## [warning]also"), so this run reports nothing on it.']);
    expect(planted.summary).toContain(planted.lines[0]);
  });

  it("marks a pin that is behind with one warning on the run's page, and a pin at the latest release with none", async () => {
    const lines: string[] = [];
    const at = (latest: string) => answer(200, async () => registry(latest, RELEASES));
    // Fixture pins: the repository's own reach 1.64.1 at their first update, and would then be behind no fixture here.
    const root = pinnedAt('1.63.0');
    await report({ fetch: at('1.64.1'), root, now: () => day('2026-10-21'), print: (l) => lines.push(l) });
    const warnings = lines.filter((l) => l.startsWith('::warning'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^::warning title=Playwright pin::byway pins Playwright 1\.63\.0 \(packages\/runner and apps\/web\); npm's latest release is 1\.64\.1/);
    expect(warnings[0]).not.toMatch(/[\r\n]/);
    lines.length = 0;
    await report({ fetch: at('1.63.0'), root, now: () => day('2026-10-21'), print: (l) => lines.push(l) });
    expect(lines).toEqual(["byway pins Playwright 1.63.0 (packages/runner and apps/web), npm's latest release."]);
  });
});

/**
 * The owner's answer of 2026-10-21 23:15 on keeping the price table current: "Weekly report + monthly re-read + date
 * in the app (Recommended)", with "A weekly CI report (reporting only) compares OpenRouter's price API exactly and
 * checks the other providers' pages for changed figures". The report runs on the weekly run, once, and fails nothing,
 * as the Playwright pin's does; what it says is tested in price-report.test.ts.
 */
describe("the weekly run's price report (PRICE-CADENCE)", () => {
  it('runs on the weekly run only, on one job, after Node is set up and before the tests, and cannot fail the job', () => {
    const at = steps.findIndex((s) => s.run === 'node scripts/price-report.ts');
    expect(steps.filter((s) => /price-report/.test(s.run ?? ''))).toHaveLength(1);
    const step = steps[at]!;
    expect(step.name).toBe("Do the providers' pages still give byway's prices? (the weekly run, Linux only; it reports and fails nothing)");
    expect(step.if).toBe("${{ github.event_name == 'schedule' && matrix.name == 'linux' }}");
    expect(step['continue-on-error']).toBe(true);
    expect(step['timeout-minutes']).toBeLessThanOrEqual(5);
    expect(step).not.toHaveProperty('env');
    expect(step).not.toHaveProperty('uses');
    expect(at).toBeGreaterThan(steps.findIndex((s) => (s.name ?? '').startsWith('Node (')));
    expect(at).toBeLessThan(steps.findIndex((s) => s.run === 'pnpm verify'));
    // The script exits 0 whatever it finds: nothing in it sets an exit code.
    const script = read('scripts/price-report.ts');
    expect(script).not.toMatch(/process\.exit|exitCode/);
    expect(script.trim().split('\n').at(-1)).toBe('if (import.meta.main) await report({ ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}) });');
    // The weekly schedule's comment names both reports.
    expect(workflow).toMatch(/weekly run also says whether the Playwright pin has fallen behind npm's latest release and whether the providers'\n\s+# pages still give byway's prices \(two steps below\)/);
  });

  it('runs with plain Node before the dependencies are installed: its imports are Node\'s own modules and prices.ts, which imports only types', () => {
    const script = read('scripts/price-report.ts');
    expect([...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1])).toEqual(['node:fs', '../packages/gateway/src/prices.ts']);
    expect([...read('packages/gateway/src/prices.ts').matchAll(/^import (.*) from '([^']+)';$/gm)].map((m) => [m[1]?.startsWith('type '), m[2]])).toEqual([[true, '@byway/contracts']]);
    // Loaded as a module (not run): plain Node strips both files' types; nothing is fetched.
    const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./scripts/price-report.ts'); console.log(typeof m.report);"], { cwd: REPO, encoding: 'utf8' });
    expect(loaded.stderr).toBe('');
    expect(loaded.stdout.trim()).toBe('function');
  });
});

describe("the weekly run's advisories report (X-VAL-4 (a))", () => {
  it('runs on the weekly run only, on one job, once pnpm is set up and before the tests, and cannot fail the job', () => {
    const at = steps.findIndex((s) => s.run === 'node scripts/advisories.ts');
    expect(steps.filter((s) => /advisories/.test(s.run ?? ''))).toHaveLength(1);
    const step = steps[at]!;
    expect(step.name).toBe("Do byway's dependencies or its Node have known advisories? (the weekly run, Linux only; it reports and fails nothing)");
    expect(step.if).toBe("${{ github.event_name == 'schedule' && matrix.name == 'linux' }}");
    expect(step['continue-on-error']).toBe(true);
    expect(step['timeout-minutes']).toBeLessThanOrEqual(5);
    expect(step).not.toHaveProperty('env');
    expect(step).not.toHaveProperty('uses');
    expect(at).toBeGreaterThan(steps.findIndex((s) => (s.uses ?? '').startsWith('pnpm/action-setup@')));
    expect(at).toBeLessThan(steps.findIndex((s) => s.run === 'pnpm verify'));
    // The script exits 0 whatever it finds: nothing in it sets an exit code.
    const script = read('scripts/advisories.ts');
    expect(script).not.toMatch(/process\.exit|exitCode/);
    expect(script.trim().split('\n').at(-1)).toBe('if (import.meta.main) await report({ ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}) });');
    expect(workflow).toMatch(/and whether byway's dependencies or its Node have known security\n\s+# advisories \(after pnpm is set up\)/);
  });
});
