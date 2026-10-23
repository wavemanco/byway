"""Apply each mutation in a JSON file, run the named vitest files in the package, and report whether the tests caught it.

Usage: python -I mutate.py <repo root> <mutations.json>
Each mutation: {"name", "file", "old", "new", "pkg", "tests": [..], "grep"?: "-t pattern"}
The file is always restored, whatever happens.
"""
import json
import subprocess
import sys

root = sys.argv[1]
muts = json.load(open(sys.argv[2], encoding='utf-8'))
results = []
for m in muts:
    path = f"{root}/{m['file']}"
    original = open(path, encoding='utf-8').read()
    count = original.count(m['old'])
    if count != 1:
        results.append((m['name'], f'NOT APPLIED (found {count})'))
        continue
    try:
        open(path, 'w', encoding='utf-8', newline='\n').write(original.replace(m['old'], m['new']))
        cmd = ['npx.cmd', 'vitest', 'run', *m['tests']]
        if m.get('grep'):
            cmd += ['-t', m['grep']]
        r = subprocess.run(cmd, cwd=f"{root}/{m['pkg']}", capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        out = r.stdout + r.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith('×') or ' FAIL ' in l][:4]
        results.append((m['name'], ('CAUGHT' if r.returncode != 0 else 'SURVIVED') + (' | ' + ' / '.join(failed) if failed else '')))
    finally:
        open(path, 'w', encoding='utf-8', newline='\n').write(original)
for name, res in results:
    print(f'{name}: {res}')
