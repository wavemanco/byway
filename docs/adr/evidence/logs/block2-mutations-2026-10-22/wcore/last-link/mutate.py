"""Apply each mutation in a JSON list, run its tests, record whether they failed, and restore the file byte for byte.

Usage: python -I mutate.py <repo> <mutations.json> <log>
Each mutation: {"name", "file", "old", "new", "tests": [paths], "grep"?: vitest -t filter}
"""
import json
import subprocess
import sys
from pathlib import Path

repo = Path(sys.argv[1])
mutations = json.loads(Path(sys.argv[2]).read_text(encoding='utf8'))
log = Path(sys.argv[3])
results = []
for m in mutations:
    f = repo / m['file']
    original = f.read_bytes()
    text = original.decode('utf8')
    if text.count(m['old']) != 1:
        results.append({'name': m['name'], 'status': f"NOT APPLIED (old found {text.count(m['old'])} times)"})
        continue
    f.write_bytes(text.replace(m['old'], m['new']).encode('utf8'))
    try:
        cmd = ['pnpm', 'exec', 'vitest', 'run', *m['tests']]
        if m.get('grep'):
            cmd += ['-t', m['grep']]
        p = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, encoding='utf8', errors='replace', shell=(sys.platform == 'win32'), timeout=900)
        out = p.stdout + p.stderr
        summary = [l.strip() for l in out.splitlines() if l.strip().startswith(('Tests ', 'Test Files'))]
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith(('×', 'FAIL'))][:8]
        results.append({'name': m['name'], 'status': 'CAUGHT' if p.returncode != 0 else 'MISSED', 'summary': summary, 'failed': failed})
    finally:
        f.write_bytes(original)
    print(results[-1]['name'], results[-1]['status'], flush=True)
log.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding='utf8')
