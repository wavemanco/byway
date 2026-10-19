#!/bin/sh
# Read-only: what this WSL Ubuntu offers Chromium's Linux sandbox.
uname -r
grep -E '^(NAME|VERSION)=' /etc/os-release
if command -v node >/dev/null 2>&1; then echo "node $(node --version)"; else echo "node absent"; fi
ls "$HOME/.cache/ms-playwright" 2>/dev/null || echo "no playwright browsers"
echo "apparmor_restrict_unprivileged_userns=$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo absent)"
echo "max_user_namespaces=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null)"
echo "uid=$(id -u)"
if unshare --user --map-root-user true 2>/dev/null; then echo "unprivileged userns: ok"; else echo "unprivileged userns: refused"; fi
