/**
 * Guard: no control in the app takes the native `disabled` state unless it is reviewed here (R5). A focused control
 * that disables itself (a busy Send, a Start pressed with Enter, "Choose all" once all are chosen) drops keyboard focus
 * to the page body, and on Start and the paid Start button `disabled` was also the only guard against a second press.
 * Controls that act use useAction and ActionButton instead (src/components/useAction.ts): aria-disabled and aria-busy,
 * still focusable, with a synchronous guard against a second start. The keyboard behaviour runs in e2e/keyboard.spec.ts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { disabledUses, filesUnder, REPO } from './guards/scan.ts';

/**
 * Every reviewed use, one entry per use, and why the native state is right there: it is set by something other than
 * pressing that control, or focus is somewhere else when it is set.
 */
const ALLOWED: { file: string; element: string; reason: string }[] = [
  {
    file: 'apps/web/src/components/Examples.tsx',
    element: 'fieldset',
    reason: 'Disabled while the run starts (its `disabled` prop, from Start). Focus is on Start, outside it, and nothing in it may change what is being sent.',
  },
  {
    file: 'apps/web/src/components/Examples.tsx',
    element: 'button',
    reason: '"Paste an example", disabled once five examples are listed. Pressing it moves focus to the new example’s field, so it is never disabled under focus.',
  },
  {
    file: 'apps/web/src/components/Switch.tsx',
    element: 'button',
    reason: 'The caller’s `disabled`: a switch that cannot be used here at all, set by configuration (Settings’ Demo mode when pnpm demo forced it or no key is set), never by pressing it. Busy uses aria-disabled.',
  },
];

const WEB = path.join(REPO, 'apps', 'web');
const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/');
const SCANS = { timeout: 30_000 };

describe('the disabled scan', () => {
  it('finds the attribute on any intrinsic element, bare or with a value, across lines, and DOM writes', () => {
    const uses = [
      '<button type="button" onClick={go} disabled={busy}>Send</button>',
      '<button\n  type="button"\n  disabled\n>\n  Send\n</button>',
      '<input type="file" multiple disabled={full || adding} onChange={(ev) => void add(ev)} />',
      '<fieldset className="x" disabled={disabled}>',
      '<button onClick={() => keep(i)} disabled={a > b}>Keep</button>',
      '<button className={`button ${size}`} title="it\'s fine" disabled>Go</button>',
      'el.disabled = true;',
      "button.setAttribute('disabled', '');",
      "button.toggleAttribute('disabled', busy);",
    ];
    for (const source of uses) expect(disabledUses(source), source).toHaveLength(1);
    expect(disabledUses('const x = 1;\n\n<button\n  disabled={busy}\n>')[0]).toMatchObject({ element: 'button', line: 3 });
  });

  it('does not count aria-disabled, data-disabled, a component’s prop, a variable, text, a quoted value, a comment or a comparison', () => {
    const others = [
      '<button type="button" aria-disabled={busy} aria-busy={busy}>Send</button>',
      "<label className=\"button\" data-disabled={full ? 'true' : undefined}>",
      '<Switch checked={on} onChange={set} disabled={forced} />',
      '<Examples entries={examples} onChange={onExamples} disabled={busy} />',
      'const [disabled, setDisabled] = useState<boolean>(false);',
      '<p>Nothing here is ever disabled.</p>',
      '<button title="disabled while busy" aria-disabled={busy}>Go</button>',
      '{/* <button disabled>Old</button> */}',
      '// <button disabled>Old</button>',
      'if (el.disabled === true) return;',
      'const ok = useRef<number | null>(null); const off = disabled && ready;',
    ];
    for (const source of others) expect(disabledUses(source), source).toEqual([]);
  });
});

describe('native disabled state in apps/web (R5)', SCANS, () => {
  it('is used only where reviewed', () => {
    const files = [...filesUnder(path.join(WEB, 'src'), /\.(ts|tsx)$/), ...filesUnder(path.join(WEB, 'app'), /\.(ts|tsx)$/)];
    const found = files.flatMap((file) => disabledUses(readFileSync(file, 'utf8')).map((use) => ({ key: `${rel(file)} <${use.element}>`, at: `${rel(file)}:${use.line} ${use.text}` })));
    const key = (a: { file: string; element: string }) => `${a.file} <${a.element}>`;
    // One allowed entry per use: a second disabled button in a reviewed file is a new use, and fails.
    const unreviewed = [...found];
    for (const allowed of ALLOWED) {
      const i = unreviewed.findIndex((f) => f.key === key(allowed));
      if (i >= 0) unreviewed.splice(i, 1);
    }
    expect(unreviewed.map((f) => f.at), 'Use ActionButton (aria-disabled, focusable) for these, or review them in ALLOWED with a reason').toEqual([]);
    // And every reviewed use is still there: a stale entry would let a new use through unreviewed.
    const stale = ALLOWED.filter((allowed) => found.filter((f) => f.key === key(allowed)).length < ALLOWED.filter((a) => key(a) === key(allowed)).length);
    expect(stale.map(key)).toEqual([]);
  });
});
