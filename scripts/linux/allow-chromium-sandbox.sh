#!/bin/sh
# Lets Playwright's Chromium start its OS sandbox on a Linux whose AppArmor restricts unprivileged user namespaces
# (Ubuntu does by default from 24.04; 23.10 brought the restriction in without turning it on). It adds one AppArmor
# profile, playwright-chromium, attached to Playwright's Chromium programs (the headless shell byway draws pages with,
# and full Chromium, in the folder layout Playwright 1.63 uses) in Playwright's own browsers folder,
# ${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright, named as the folder it really is when a symbolic link leads to it.
# The profile lets them create user namespaces, which Chromium's sandbox is built from, and confines them in no other
# way, as Ubuntu's own profile for Google Chrome does. A Playwright upgrade that keeps that layout needs nothing more;
# CI's Linux tests, which run with the sandbox on, show when one does not. It covers that folder only, so it stops if
# PLAYWRIGHT_BROWSERS_PATH is set.
#
# What that allows, plainly: any program running as you can then create user namespaces through this profile, which is
# what the restriction exists to stop. It can start one of those Chromium programs with a library of its own
# (LD_PRELOAD); on Ubuntu 24.04, where kernel.apparmor_restrict_unprivileged_unconfined is 0 by default, it can enter
# the profile by name with aa-exec; and it can put a program of its own in that folder, which is yours to write. Ubuntu's
# own profile for Google Chrome can be used in the first two ways too (with aa-exec, whether or not Chrome is
# installed). The alternative is to add no profile and switch byway's sandbox off in Settings, which has its own risk:
# a malicious page or image, together with a bug in Chromium, could then run as you. Without this profile the
# restriction is as Ubuntu set it, and on Ubuntu 24.04 that is not whole either: Ubuntu loads its own profiles of this
# kind, Google Chrome's among them, whether or not those programs are installed, and while
# kernel.apparmor_restrict_unprivileged_unconfined is 0 any program running as you can enter one with aa-exec.
# Choose for each machine.
#
# The README's Renderer section gives this script, and CI's Linux job runs it after Playwright's own install
# (.github/workflows/verify.yml), so every CI run tries these steps on a fresh Ubuntu 24.04 machine (ADR-0105).
#
# Run it as yourself (sh scripts/linux/allow-chromium-sandbox.sh), not with sudo: the profile names your own folder,
# and the script asks for your password for the two commands that need it.
set -eu

if [ "$(id -u)" = 0 ]; then
  echo "Run this as yourself, not as root: the profile names your own folder, and Chromium does not start its sandbox for root anyway (start byway as an ordinary user)." >&2
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
plain_path() {
  if printf '%s' "$1" | grep -q '[][[:space:]*?{}^"#,\]'; then
    echo "Playwright's folder, $1, has a space or one of * ? [ ] { } ^ \" # , \\ in its path, which this script does not handle." >&2
    exit 1
  fi
}
plain_path "$folder"

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

# AppArmor matches the file Chromium really runs from, after symbolic links: name that folder.
if [ ! -d "$folder" ]; then
  echo "Playwright's folder, $folder, does not exist yet: install Playwright's Chromium first (the README's Renderer section), then run this again." >&2
  exit 1
fi
real=$(cd "$folder" && pwd -P)
if [ "$real" != "$folder" ]; then
  echo "Playwright's folder, $folder, leads to $real: the profile names $real, where Chromium really runs from."
  plain_path "$real"
  folder=$real
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
echo "To take the profile away instead, remove it (sudo apparmor_parser --remove $profile, then sudo rm $profile)"
echo "and switch byway's sandbox off in Settings, which has its own risk: a malicious page or image, together with a bug"
echo "in Chromium, could then run as you. The restriction is then as Ubuntu set it: while"
echo "kernel.apparmor_restrict_unprivileged_unconfined is 0 (printed above), Ubuntu's own profiles, loaded whether or not"
echo "their programs are installed, already let a program running as you get round it with aa-exec."
