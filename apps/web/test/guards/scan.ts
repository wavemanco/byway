/**
 * Static scans for the guard tests (spec §2 dependency direction, §4 claims, §6 credibility guardrails): the workspace's
 * packages and their manifests, source files, and the module specifiers they import.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export interface WorkspacePackage {
  /** The short name: `web` for @byway/web, `runner` for @byway/runner. */
  name: string;
  dir: string;
  dependencies: string[];
  devDependencies: string[];
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'test-results', 'playwright-report', 'coverage', '.git']);

/** Files under `dir` (recursively) whose names match `pattern`, skipping dependencies and build output. */
export function filesUnder(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(name) ? [] : filesUnder(full, pattern);
    return pattern.test(name) ? [full] : [];
  });
}

/** Every workspace package (packages/* and apps/*) with its @byway dependencies by short name. */
export function workspacePackages(): WorkspacePackage[] {
  const dirs = ['packages', 'apps'].flatMap((group) =>
    readdirSync(path.join(REPO, group))
      .map((name) => path.join(REPO, group, name))
      .filter((dir) => existsSync(path.join(dir, 'package.json'))),
  );
  return dirs.map((dir) => {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const own = (deps: Record<string, string> | undefined) => Object.keys(deps ?? {}).filter((d) => d.startsWith('@byway/')).map((d) => d.slice('@byway/'.length));
    return { name: manifest.name.replace(/^@byway\//, ''), dir, dependencies: own(manifest.dependencies), devDependencies: own(manifest.devDependencies) };
  });
}

/**
 * The module specifiers a source file imports: static imports and re-exports, side-effect imports, dynamic `import()`
 * (comments before the string allowed, as in `import(/* turbopackIgnore: true *\/ 'x')`) and `require()`.
 */
export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) out.push(m[1] as string);
  return [...new Set(out)];
}

/** Specifiers imported only as types (`import type … from`), which never load at run time. */
export function typeOnlySpecifiers(source: string): Set<string> {
  const typeOnly = new Set<string>();
  for (const m of source.matchAll(/\bimport\s+type\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g)) typeOnly.add(m[1] as string);
  // A specifier that is also imported for values is not type-only.
  for (const m of source.matchAll(/\bimport\s+(?!type\s)[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g)) typeOnly.delete(m[1] as string);
  return typeOnly;
}

/** The @byway package a specifier names, by short name (`@byway/runner/client` → `runner`). */
export function bywayPackage(specifier: string): string | undefined {
  return /^@byway\/([^/]+)/.exec(specifier)?.[1];
}

/**
 * Research evaluation instruments (CR12): the judge instruments and the future `py/eval` side, by package or path
 * segment. Product code must never import them, whatever they end up being called within this pattern.
 */
export function isEvalInstrument(specifier: string): boolean {
  const s = specifier.toLowerCase().replace(/\\/g, '/');
  if (s.includes('py/eval')) return true;
  return s.split('/').some((segment) => /^(evals?|evaluation|judge-instruments?|instruments?)(\.[a-z]+)?$/.test(segment) || /^judge-instrument/.test(segment));
}

/** A template's text without its front matter, whose `source:` line cites the documents it follows. */
export function templateText(raw: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}
