#!/bin/sh
# Lets Playwright's Chromium start its OS sandbox on a Linux that restricts unprivileged user namespaces through AppArmor
# (Ubuntu does by default from 24.04; 23.10 brought the restriction in without turning it on). It adds one AppArmor
# profile, playwright-chromium, that allows user namespaces for Playwright's Chromium binaries only (the headless shell
# byway draws pages with, and full Chromium) under Playwright's default folder, ~/.cache/ms-playwright. The rest of the
# machine stays restricted. A Playwright upgrade needs nothing more: the pattern covers its new folders.
#
# The README's Renderer section gives this script, and CI's Linux job runs it (.github/workflows/verify.yml), so every
# CI run tries these exact steps on a fresh Ubuntu 24.04 machine (ADR-0105).
#
# Run it as yourself from the byway folder (sh scripts/linux/allow-chromium-sandbox.sh), not with sudo: the profile
# names your home folder, and the script asks for your password for the two commands that need it.
set -eu

if [ "$(id -u)" = 0 ]; then
  echo "Run this as yourself, not as root: byway does not run as root, and the profile names your home folder." >&2
  exit 1
fi
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  echo "PLAYWRIGHT_BROWSERS_PATH is set. This script covers Playwright's default folder ($HOME/.cache/ms-playwright) only." >&2
  exit 1
fi
case "$HOME" in
  *[[:space:]]*)
    echo "Your home folder's path has a space in it, which this script does not handle." >&2
    exit 1
    ;;
esac

restrict=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
if [ ! -r "$restrict" ]; then
  echo "This Linux has no $restrict, so AppArmor does not restrict user namespaces here and no profile is needed."
  exit 0
fi
echo "kernel.apparmor_restrict_unprivileged_userns = $(cat "$restrict")"

profile=/etc/apparmor.d/playwright-chromium
printf '%s\n' 'abi <abi/4.0>,' 'include <tunables/global>' "profile playwright-chromium $HOME/.cache/ms-playwright/chromium*/chrome-*/chrome{,-headless-shell} flags=(unconfined) {" '  userns,' '}' | sudo tee "$profile" > /dev/null
sudo apparmor_parser --replace "$profile"
echo "Added the AppArmor profile $profile: Playwright's Chromium may start its OS sandbox now. Start byway again."
