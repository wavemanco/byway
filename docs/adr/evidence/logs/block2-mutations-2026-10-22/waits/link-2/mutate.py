"""Apply each mutation in a JSON file, run the named vitest files in the package, and report whether the tests caught it.

Usage: python -I mutate.py <repo root> <mutations.json> [name filter]
Each mutation: {"name", "file", "old", "new", "pkg", "tests": [..], "grep"?: "-t pattern", "also"?: [{"old", "new"}]}
("also": more edits in the same file, each of which must match exactly once after the first).
The file is always restored, whatever happens.
"""
import json
import subprocess
import sys

root = sys.argv[1]
muts = json.load(open(sys.argv[2], encoding='utf-8'))
only = sys.argv[3] if len(sys.argv) > 3 else None
results = []
for m in muts:
    if only and only not in m['name']:
        continue
    path = f"{root}/{m['file']}"
    original = open(path, encoding='utf-8', newline='').read()
    count = original.count(m['old'])
    if count != 1:
        results.append((m['name'], f'NOT APPLIED (found {count})'))
        continue
    mutated = original.replace(m['old'], m['new'])
    ok = True
    for extra in m.get('also', []):
        n = mutated.count(extra['old'])
        if n != 1:
            results.append((m['name'], f'NOT APPLIED (also: found {n})'))
            ok = False
            break
        mutated = mutated.replace(extra['old'], extra['new'])
    if not ok:
        continue
    try:
        open(path, 'w', encoding='utf-8', newline='').write(mutated)
        cmd = ['npx.cmd', 'vitest', 'run', *m['tests']]
        if m.get('grep'):
            cmd += ['-t', m['grep']]
        r = subprocess.run(cmd, cwd=f"{root}/{m['pkg']}", capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        out = r.stdout + r.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith('×') or ' FAIL ' in l][:3]
        errors = [l.strip() for l in out.splitlines() if 'Error' in l and ('Reference' in l or 'Syntax' in l or 'Type' in l)][:2]
        results.append((m['name'], ('CAUGHT' if r.returncode != 0 else 'SURVIVED') + (' | ' + ' / '.join(failed) if failed else '') + (' || ' + ' / '.join(errors) if errors else '')))
    finally:
        open(path, 'w', encoding='utf-8', newline='').write(original)
for name, res in results:
    print(f'{name}: {res}')
