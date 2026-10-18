#!/bin/sh
# Lets Playwright's Chromium start its OS sandbox on a Linux whose AppArmor restricts unprivileged user namespaces
# (Ubuntu does by default from 24.04; 23.10 brought the restriction in without turning it on). It adds one AppArmor
# profile, playwright-chromium, attached to Playwright's Chromium programs (the headless shell byway draws pages with,
# and full Chromium, any version) in Playwright's own browsers folder, ${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright.
# The profile lets them create user namespaces, which Chromium's sandbox is built from, and confines them in no other
# way, as Ubuntu's own profile for Google Chrome does. A Playwright upgrade needs nothing more: the profile covers every
# version in that folder. It covers that folder only, so it stops if PLAYWRIGHT_BROWSERS_PATH is set.
#
# What that allows, plainly: any program running as you can then create user namespaces through this profile, which is
# what the restriction exists to stop. It can start one of those Chromium programs with a library of its own
# (LD_PRELOAD); on Ubuntu 24.04, where kernel.apparmor_restrict_unprivileged_unconfined is 0 by default, it can enter
# the profile by name with aa-exec; and it can put a program of its own in that folder, which is yours to write. Ubuntu's
# own profile for Google Chrome can be used in the first two ways too. The alternative is to leave the restriction whole
# and switch byway's sandbox off in Settings, which has its own risk: a malicious page or image, together with a bug in
# Chromium, could then run as you. Choose for each machine.
#
# The README's Renderer section gives this script, and CI's Linux job runs it after Playwright's own install
# (.github/workflows/verify.yml), so every CI run tries these steps on a fresh Ubuntu 24.04 machine (ADR-0105).
#
# Run it as yourself (sh scripts/linux/allow-chromium-sandbox.sh), not with sudo: the profile names your own folder,
# and the script asks for your password for the two commands that need it.
set -eu

if [ "$(id -u)" = 0 ]; then
  echo "Run this as yourself, not as root: byway does not run as root, and the profile names your own folder." >&2
  exit 1
fi
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  echo "PLAYWRIGHT_BROWSERS_PATH is set ($PLAYWRIGHT_BROWSERS_PATH). This script covers Playwright's own folder only: unset it here and where you start byway, then run this again." >&2
  exit 1
fi

# Playwright's own folder, as Playwright finds it on Linux.
folder="${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright"
case "$folder" in
  /*) ;;
  *)
    echo "Playwright's folder, $folder, is not a full path, which this script does not handle." >&2
    exit 1
    ;;
esac
# The profile names the folder as it is: a space, or a character AppArmor reads as a pattern, would change what it covers.
if printf '%s' "$folder" | grep -q '[][[:space:]*?{}^"#,\]'; then
  echo "Playwright's folder, $folder, has a space or one of * ? [ ] { } ^ \" # , \\ in its path, which this script does not handle." >&2
  exit 1
fi

restrict=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
if [ ! -r "$restrict" ]; then
  echo "This Linux has no $restrict, so AppArmor does not restrict user namespaces here and no profile is needed."
  exit 0
fi
echo "kernel.apparmor_restrict_unprivileged_userns = $(cat "$restrict")"
unconfined=/proc/sys/kernel/apparmor_restrict_unprivileged_unconfined
if [ -r "$unconfined" ]; then
  echo "kernel.apparmor_restrict_unprivileged_unconfined = $(cat "$unconfined")"
fi

profile=/etc/apparmor.d/playwright-chromium
printf '%s\n' 'abi <abi/4.0>,' 'include <tunables/global>' '' "profile playwright-chromium $folder/chromium*/chrome-*/chrome{,-headless-shell} flags=(unconfined) {" '  userns,' '}' | sudo tee "$profile" > /dev/null
sudo apparmor_parser --replace "$profile"

echo
echo "Added the AppArmor profile $profile: Playwright's Chromium in $folder may start its OS sandbox now."
echo "Start byway again."
echo
echo "What it allows: any program running as you can now create user namespaces through this profile. It can start one"
echo "of those Chromium programs with a library of its own (LD_PRELOAD), or enter the profile with aa-exec while"
echo "kernel.apparmor_restrict_unprivileged_unconfined is 0 (Ubuntu 24.04's default), as with Ubuntu's own profile for"
echo "Google Chrome; or it can put a program of its own in $folder."
echo "To keep the restriction whole instead, remove the profile (sudo apparmor_parser --remove $profile, then"
echo "sudo rm $profile) and switch byway's sandbox off in Settings, which has its own risk: a malicious page or"
echo "image, together with a bug in Chromium, could then run as you."
