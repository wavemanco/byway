#!/bin/sh
# Lets the page renderer's Chromium start its OS sandbox on a Linux whose AppArmor restricts unprivileged user
# namespaces (Ubuntu does by default from 24.04; 23.10 brought the restriction in without turning it on), without
# giving those namespaces to any program you can change. It asks for your password for the steps that need root, and:
#
# 1. Installs Playwright's Chromium, with the system libraries it needs, in /opt/byway/ms-playwright, a folder only root
#    can change. It installs with byway's own Node and Playwright, so it is the version byway runs.
# 2. Adds one AppArmor profile, playwright-chromium, for the Chromium programs in that folder only (the headless shell
#    byway draws pages with, and full Chromium). The profile lets them create unprivileged user namespaces, which
#    Chromium's sandbox is built from, and confines them in no other way, as Ubuntu's own profile does for Google Chrome
#    in /opt/google/chrome. The rest of the machine stays restricted. The profile is not put on Playwright's own folder,
#    ~/.cache/ms-playwright: any program running as you can write there, so it could put a file there and get the
#    namespaces too, which is what the restriction exists to stop.
#
# byway takes Chromium from that folder only while PLAYWRIGHT_BROWSERS_PATH=/opt/byway/ms-playwright is set when it
# starts; the script ends by saying so. Run it again after every Playwright upgrade in byway: Playwright's own install,
# run as you, cannot write to that folder.
#
# The README's Renderer section gives this script, and CI's Linux job runs it and sets the variable
# (.github/workflows/verify.yml), so every CI run tries these steps on a fresh Ubuntu 24.04 machine (ADR-0105).
#
# Run it as yourself, in the byway folder, after pnpm install: sh scripts/linux/allow-chromium-sandbox.sh
set -eu

folder=/opt/byway/ms-playwright
profile=/etc/apparmor.d/playwright-chromium

if [ "$(id -u)" = 0 ]; then
  echo "Run this as yourself, not as root: it runs byway's own Node and Playwright, and asks for your password for the steps that need root." >&2
  exit 1
fi

restrict=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
if [ ! -r "$restrict" ]; then
  echo "This Linux has no $restrict, so AppArmor does not restrict user namespaces here and this script is not needed."
  echo "Install Playwright's Chromium in its own folder instead: pnpm --filter ./apps/web exec playwright install --with-deps chromium"
  exit 0
fi
echo "kernel.apparmor_restrict_unprivileged_userns = $(cat "$restrict")"

# byway's own Playwright: the one the page renderer loads (packages/runner).
if [ ! -f packages/runner/package.json ]; then
  echo "Run this in the byway folder." >&2
  exit 1
fi
node=$(command -v node) || {
  echo "Node is not on your PATH." >&2
  exit 1
}
cli=$(cd packages/runner && "$node" -e 'const p = require("node:path"); process.stdout.write(p.join(p.dirname(require.resolve("playwright/package.json")), "cli.js"))') || {
  echo "byway's Playwright was not found: run pnpm install first." >&2
  exit 1
}
version=$(cd packages/runner && "$node" -p 'require("playwright/package.json").version')

echo "Installing Playwright $version's Chromium, with the system libraries it needs, in $folder"
sudo install -d -o root -g root -m 755 /opt/byway "$folder"
sudo env PLAYWRIGHT_BROWSERS_PATH="$folder" "$node" "$cli" install --with-deps chromium
# Only root can change anything in it, whatever the download's own file modes.
sudo chown -R root:root /opt/byway
sudo chmod -R go-w /opt/byway

printf '%s\n' 'abi <abi/4.0>,' 'include <tunables/global>' '' "profile playwright-chromium $folder/chromium*/chrome-*/chrome{,-headless-shell} flags=(unconfined) {" '  userns,' '}' | sudo tee "$profile" > /dev/null
sudo apparmor_parser --replace "$profile"

echo
echo "Playwright $version's Chromium is in $folder, which only root can change, and the AppArmor profile $profile lets the"
echo "Chromium programs there, and nothing else, create user namespaces, so Chromium can start its OS sandbox."
echo "Start byway with this set, so that it takes Chromium from that folder; to keep it set, add the line to ~/.profile:"
echo
echo "  export PLAYWRIGHT_BROWSERS_PATH=$folder"
echo
echo "Run this script again after every Playwright upgrade in byway: Playwright's own install cannot write to $folder."
case "${PLAYWRIGHT_BROWSERS_PATH:-}" in
  "" | "$folder") ;;
  *) echo "PLAYWRIGHT_BROWSERS_PATH is $PLAYWRIGHT_BROWSERS_PATH in this shell now: byway would take Chromium from there, outside the profile." >&2 ;;
esac
