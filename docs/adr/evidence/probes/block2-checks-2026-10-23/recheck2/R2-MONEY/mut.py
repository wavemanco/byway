import sys, subprocess, json, os
root = r"C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/b2rc2/m"
muts = json.load(open(sys.argv[1], encoding='utf-8'))
tests = sys.argv[2:] or ['packages/gateway/test/clip-wait.test.ts']
for m in muts:
    path = os.path.join(root, m['file'])
    orig = open(path, 'rb').read()
    s = orig.decode('utf-8')
    if s.count(m['old']) != 1:
        print(m['id'], 'NOT UNIQUE/NOT FOUND', s.count(m['old'])); continue
    open(path, 'wb').write(s.replace(m['old'], m['new']).encode('utf-8'))
    try:
        r = subprocess.run('pnpm exec vitest run ' + ' '.join(m.get('tests', tests)), shell=True, cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        out = r.stdout + r.stderr
        lines = [l for l in out.splitlines() if ('FAIL' in l or 'Tests ' in l or '×' in l)]
        print('=== ', m['id'], 'KILLED' if r.returncode != 0 else 'SURVIVED')
        for l in lines[:25]: print('   ', l[:300])
        open(os.path.join(os.path.dirname(sys.argv[1]), m['id'] + '.log'), 'w', encoding='utf-8').write(out)
    finally:
        open(path, 'wb').write(orig)
    assert open(path, 'rb').read() == orig
print('restored')
