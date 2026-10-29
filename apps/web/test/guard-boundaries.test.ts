/**
 * Guard: the import boundary and the dependency direction (spec §2, §6, CR12). Nothing in packages/ imports apps/;
 * product code never imports evaluation instruments; each workspace package depends only on the packages its layer
 * allows, in its manifest and in what its source imports; and client components never load server-only modules.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bywayPackage, filesUnder, importSpecifiers, isEvalInstrument, REPO, typeOnlySpecifiers, workspacePackages } from './guards/scan.ts';

/**
 * Which workspace packages each one may depend on. web, runner and advisor are spec §2's (Phase 3 brief); the rest is
 * the stack below them as it stands, so a dependency pointing up the stack fails here.
 */
const ALLOWED: Record<string, readonly string[]> = {
  web: ['advisor', 'runner', 'store', 'gateway', 'prompts', 'catalog', 'contracts', 'protocol', 'recipe', 'canonical'],
  runner: ['gateway', 'store', 'prompts', 'catalog', 'recipe', 'validator', 'protocol', 'contracts', 'canonical'],
  advisor: ['gateway', 'catalog', 'recipe', 'validator', 'protocol', 'prompts', 'contracts', 'canonical'],
  catalog: ['canonical', 'contracts', 'protocol', 'recipe'],
  gateway: ['canonical', 'contracts'],
  prompts: ['contracts', 'protocol'],
  store: ['contracts'],
  contracts: ['protocol', 'recipe'],
  validator: ['canonical', 'protocol', 'recipe'],
  recipe: ['canonical', 'protocol'],
  protocol: [],
  canonical: [],
  /** The research CLI (engine Milestone 0). */
  cli: ['canonical', 'catalog', 'protocol', 'recipe', 'validator'],
};

const SOURCE = /\.(ts|tsx|mts|js|mjs)$/;
const packages = workspacePackages();
/** Code each package ships: its src, plus the app's routes and its root modules (tests are not shipped). */
const shipped = (dir: string) => [
  ...filesUnder(path.join(dir, 'src'), SOURCE),
  ...filesUnder(path.join(dir, 'app'), SOURCE),
  ...['proxy.ts', 'next.config.ts'].map((f) => path.join(dir, f)).filter((f) => existsSync(f)),
];

const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');

describe('the scanners', () => {
  it('find every kind of import, including dynamic ones the bundler is told to skip', () => {
    const source = [
      "import { a } from '@byway/a';",
      "import type { B } from '@byway/b';",
      "export { c } from './c.ts';",
      "import 'server-only';",
      "const d = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/d');",
      "const e = require('e');",
    ].join('\n');
    expect(importSpecifiers(source).sort()).toEqual(['./c.ts', '@byway/a', '@byway/b', '@byway/d', 'e', 'server-only']);
    expect([...typeOnlySpecifiers(source)]).toEqual(['@byway/b']);
    expect(bywayPackage('@byway/runner/client')).toBe('runner');
  });

  it('recognise evaluation instruments by package or path, and nothing else', () => {
    for (const s of ['@byway/eval', '../../py/eval/judge.py', 'judge-instrument', '@byway/judge-instruments', '../instruments/rubric.ts', './eval/index.ts']) expect(isEvalInstrument(s), s).toBe(true);
    for (const s of ['./syntax.ts', './evaluate.ts', '@byway/gateway', 'node:path', '../view/judge.ts']) expect(isEvalInstrument(s), s).toBe(false);
  });
});

describe('dependency direction (spec §2)', () => {
  it('knows every workspace package', () => {
    expect(packages.map((p) => p.name).filter((name) => !(name in ALLOWED))).toEqual([]);
    // And actually reads their code.
    expect(packages.filter((p) => shipped(p.dir).length === 0).map((p) => p.name)).toEqual([]);
  });

  it('keeps each package manifest within its allowed dependencies', () => {
    const offenders = packages.flatMap((p) => p.dependencies.filter((d) => !ALLOWED[p.name]?.includes(d)).map((d) => `${p.name} → ${d}`));
    expect(offenders).toEqual([]);
  });

  it('keeps what each package imports within its allowed dependencies, and declared in its manifest', () => {
    const offenders: string[] = [];
    for (const p of packages) {
      for (const file of shipped(p.dir)) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          const dep = bywayPackage(spec);
          if (!dep || dep === p.name) continue;
          if (!ALLOWED[p.name]?.includes(dep)) offenders.push(`${rel(file)} imports ${spec} (not allowed for ${p.name})`);
          else if (!p.dependencies.includes(dep)) offenders.push(`${rel(file)} imports ${spec}, which ${p.name}'s package.json does not declare`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("resolves every package its code and tests import from its own manifest, never the repo root's, and imports every @byway package it declares (BUILD-4)", () => {
    // The root's devDependencies are the tools it runs every package's tests with (vitest); its dependencies are none.
    const tools = Object.keys((JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }).devDependencies ?? {});
    const offenders: string[] = [];
    for (const p of packages) {
      const manifest = JSON.parse(readFileSync(path.join(p.dir, 'package.json'), 'utf8')) as { name: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
      const resolves = new Set([...declared, ...tools]);
      const imported = new Set<string>();
      for (const file of [...shipped(p.dir), ...filesUnder(path.join(p.dir, 'test'), SOURCE)]) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          if (/^(\.|node:|@\/)/.test(spec)) continue;
          // The package's name: "@scope/name" or "name", without a subpath.
          const name = spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');
          imported.add(name);
          // The app's tests quote sample sources to its scanners, and Next resolves the app; so only packages/ here.
          const checked = path.relative(path.join(REPO, 'packages'), p.dir).split(path.sep)[0] !== '..' && /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name);
          if (checked && name !== manifest.name && !resolves.has(name)) offenders.push(`${rel(file)} imports ${spec}, which ${manifest.name}'s package.json does not declare`);
        }
      }
      for (const dep of declared) if (dep.startsWith('@byway/') && !imported.has(dep)) offenders.push(`${manifest.name} declares ${dep} and imports nothing from it`);
    }
    expect(offenders).toEqual([]);
  });

  it('never reaches into another package or the app by relative path', () => {
    const offenders: string[] = [];
    for (const p of packages) {
      for (const file of [...shipped(p.dir), ...filesUnder(path.join(p.dir, 'test'), SOURCE)]) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          if (!spec.startsWith('.')) continue;
          const target = path.resolve(path.dirname(file), spec);
          if (path.relative(p.dir, target).startsWith('..')) offenders.push(`${rel(file)} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the import boundary (spec §2, §6)', () => {
  it('nothing in packages/ imports apps/', () => {
    const offenders = filesUnder(path.join(REPO, 'packages'), SOURCE).flatMap((file) =>
      importSpecifiers(readFileSync(file, 'utf8'))
        .filter((spec) => spec === '@byway/web' || spec.startsWith('@byway/web/') || /(^|\/)apps\//.test(spec))
        .map((spec) => `${rel(file)} imports ${spec}`),
    );
    expect(offenders).toEqual([]);
    expect(packages.filter((p) => p.dir.includes(`${path.sep}packages${path.sep}`) && [...p.dependencies, ...p.devDependencies].includes('web')).map((p) => p.name)).toEqual([]);
  });

  it('product code never imports evaluation instruments (CR12)', () => {
    const product = packages.filter((p) => p.name !== 'cli');
    const offenders = product.flatMap((p) =>
      [...shipped(p.dir), path.join(p.dir, 'package.json')].flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        const specs = file.endsWith('package.json') ? Object.keys({ ...JSON.parse(text).dependencies }) : importSpecifiers(text);
        return specs.filter(isEvalInstrument).map((spec) => `${rel(file)} → ${spec}`);
      }),
    );
    expect(offenders).toEqual([]);
  });

  it('client components load no server modules (keys and the engine stay on the server)', () => {
    const web = packages.find((p) => p.name === 'web');
    if (!web) throw new Error('apps/web not found');
    const offenders: string[] = [];
    for (const file of shipped(web.dir)) {
      const text = readFileSync(file, 'utf8');
      if (!/^\s*['"]use client['"]/.test(text)) continue;
      const typeOnly = typeOnlySpecifiers(text);
      for (const spec of importSpecifiers(text)) {
        const serverSide = /(^|\/)(services|server)\//.test(spec) || spec === 'server-only' || ['advisor', 'runner', 'store', 'gateway', 'prompts', 'catalog'].includes(bywayPackage(spec) ?? '');
        if (serverSide && !typeOnly.has(spec)) offenders.push(`${rel(file)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the app reaches the engine packages only through the services seam, and the runner only through its client entry', () => {
    const web = packages.find((p) => p.name === 'web');
    if (!web) throw new Error('apps/web not found');
    const seam = path.join(web.dir, 'src', 'services');
    const offenders: string[] = [];
    for (const file of shipped(web.dir)) {
      const text = readFileSync(file, 'utf8');
      const typeOnly = typeOnlySpecifiers(text);
      for (const spec of importSpecifiers(text)) {
        const dep = bywayPackage(spec);
        if (dep === 'runner' && spec !== '@byway/runner/client') offenders.push(`${rel(file)} imports ${spec} (the worker, esbuild and Playwright must not load in the web process)`);
        if (dep && ['advisor', 'runner', 'store', 'gateway', 'prompts', 'catalog'].includes(dep) && !typeOnly.has(spec) && !file.startsWith(seam)) offenders.push(`${rel(file)} imports ${spec} outside src/services`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
