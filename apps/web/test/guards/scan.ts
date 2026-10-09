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

/**
 * Where a source file reads or sets an object field (`field`: an identifier), for a guard that reviews who touches it
 * (F13: ArtifactInfo.excerpt). Returns each use found, for the failure message. It sees:
 * - property access: `info.excerpt`, `info?.excerpt`, across a line break; a spread (`...excerpt`) is not one;
 * - element access or a computed key with a literal: `info['excerpt']`, `{ ['excerpt']: text }`;
 * - the field as a key in an object pattern or literal, which is every destructuring: `const { excerpt } = info`,
 *   `{ excerpt: text }`, `{ excerpt = '' }`, a parameter, a nested pattern, a quoted key; and an object that sets it.
 * Comments and import and export lists are left out, so a function of the same name and its import are not uses. A key
 * built at run time (`info[name]`) is not seen.
 */
export function fieldUses(source: string, field: string): string[] {
  if (!/^[A-Za-z_$][\w$]*$/.test(field)) throw new Error(`Not an identifier: ${field}`);
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // A line comment starts a line or follows a space (so `http://` in a string is kept).
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,?\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?)?\s*from\s*(['"])[^'"]*\1/g, ' ')
    .replace(/\bexport\s+(?:type\s+)?\{[^}]*\}/g, ' ');
  const f = field.replace(/\$/g, '\\$');
  const patterns = [
    new RegExp(`(?<!\\.)\\.\\s*${f}(?![\\w$])`, 'g'),
    new RegExp(`\\[\\s*(?:'${f}'|"${f}"|\`${f}\`)\\s*\\]`, 'g'),
    new RegExp(`[{,]\\s*(?:'${f}'|"${f}"|${f}(?![\\w$]))\\s*(?=[,}:]|=(?![=>]))`, 'g'),
  ];
  return patterns.flatMap((re) => [...code.matchAll(re)].map((m) => m[0].trim()));
}

/** One place source gives a control the native `disabled` state (disabledUses). */
export interface DisabledUse {
  /** The intrinsic element (`button`, `input`, `fieldset`, …), or `dom` for a write through the DOM. */
  element: string;
  /** 1-based line where the tag or the write starts. */
  line: number;
  /** The tag or the write as written, single-spaced, for the failure message. */
  text: string;
}

/** Blanks comments (a line comment starts a line or follows a space, so `https://` in a string stays), keeping every line break. */
function withoutComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|\s)(\/\/.*)$/gm, (_m, lead: string, comment: string) => lead + blank(comment));
}

/**
 * A JSX tag's attributes from `from` (just after its name) to its closing `>`, with every `{…}` expression and quoted
 * value blanked, so only attribute names are left; `end` is the index after the `>`. Null when no tag closes within
 * reach (the `<` was a type argument or a comparison).
 */
function tagAttributes(code: string, from: number): { names: string; end: number } | null {
  let names = '';
  let depth = 0;
  for (let i = from; i < code.length && i - from < 5000; i++) {
    const c = code[i] as string;
    if (c === '"' || c === "'" || c === '`') {
      // A string, at the tag's level (an attribute value) or inside an expression: skipped whole, escapes included.
      let close = i + 1;
      while (close < code.length && code[close] !== c) close += code[close] === '\\' ? 2 : 1;
      if (close >= code.length) return null;
      names += ' ';
      i = close;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { names, end: i + 1 };
    names += depth === 0 && c !== '}' ? c : ' ';
  }
  return null;
}

/**
 * Where source gives a control the native `disabled` state (R5). A focused control that becomes disabled drops focus to
 * the page body, so byway's controls say they are unavailable with aria-disabled instead (useAction.ts), and the guard
 * reviews every use this finds:
 * - an intrinsic JSX element (a lower-case tag: `<button>`, `<input>`, `<fieldset>`, …) with a `disabled` attribute, bare
 *   or with a value, on any line of a multi-line tag; `aria-disabled` and `data-disabled` are other attributes;
 * - a write through the DOM: `el.disabled = …`, `setAttribute('disabled', …)`, `toggleAttribute('disabled')`.
 * A component's own prop named `disabled` (`<Switch disabled>`) is not a use: what the component renders is scanned
 * where that is written. Comments are left out. Attributes spread in (`{...props}`) are not seen.
 */
export function disabledUses(source: string): DisabledUse[] {
  const code = withoutComments(source);
  const lineAt = (index: number) => code.slice(0, index).split('\n').length;
  const single = (text: string) => text.replace(/\s+/g, ' ').trim();
  const uses: DisabledUse[] = [];
  for (const m of code.matchAll(/<([a-z][\w-]*)(?=[\s/>])/g)) {
    const start = m.index;
    const tag = tagAttributes(code, start + m[0].length);
    if (tag && /(^|\s)disabled(?=[\s=/]|$)/.test(tag.names)) uses.push({ element: m[1] as string, line: lineAt(start), text: single(code.slice(start, tag.end)) });
  }
  for (const m of code.matchAll(/\.disabled\s*=(?!=)|\b(?:set|toggle)Attribute\(\s*['"]disabled['"]/g)) {
    const end = code.indexOf('\n', m.index);
    uses.push({ element: 'dom', line: lineAt(m.index), text: single(code.slice(m.index, end < 0 ? undefined : end)) });
  }
  return uses;
}
