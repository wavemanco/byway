"""Apply one mutation (an exact text replacement) to a file, run vitest on the given tests, restore the file.

Usage: python -I b2money-mutate.py <repo> <file> <old-text-file> <new-text-file> <test paths...>
The old text must occur exactly once. The file is restored byte for byte from memory, whatever happens.
"""
import subprocess
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

repo, path, old_path, new_path, *tests = sys.argv[1:]
full = f"{repo}/{path}"
with open(full, "rb") as f:
    original = f.read()
old = open(old_path, "rb").read().decode("utf-8")
new = open(new_path, "rb").read().decode("utf-8")
text = original.decode("utf-8")
count = text.count(old)
if count != 1:
    print(f"MUTATION NOT APPLIED: the old text occurs {count} times")
    sys.exit(2)
try:
    with open(full, "wb") as f:
        f.write(text.replace(old, new).encode("utf-8"))
    run = subprocess.run(["npx.cmd", "vitest", "run", *tests], cwd=repo, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = run.stdout + run.stderr
    lines = [l for l in out.splitlines() if ("×" in l or "FAIL" in l or "Tests " in l or "Test Files" in l)]
    print(out[-2500:])
    print("KILLED" if run.returncode != 0 else "SURVIVED")
finally:
    with open(full, "wb") as f:
        f.write(original)
