"""Apply one textual mutation to a file, run a vitest command, restore the file, report whether the tests caught it."""
import subprocess, sys, json
cfg = json.load(open(sys.argv[1], encoding='utf8'))
root = cfg['root']
for m in cfg['mutations']:
    path = root + '/' + m['file']
    orig = open(path, encoding='utf8').read()
    if m['old'] not in orig:
        print('MISSING', m['name']); continue
    open(path, 'w', encoding='utf8').write(orig.replace(m['old'], m['new'], 1))
    try:
        r = subprocess.run(m['cmd'], shell=True, cwd=root, capture_output=True, text=True, encoding='utf8', errors='replace')
        out = r.stdout + r.stderr
        tail = [l for l in out.splitlines() if 'Tests' in l and ('failed' in l or 'passed' in l)]
        print(('CAUGHT' if r.returncode != 0 else 'SURVIVED'), m['name'], '|', tail[-1].strip() if tail else out[-300:])
    finally:
        open(path, 'w', encoding='utf8').write(orig)
