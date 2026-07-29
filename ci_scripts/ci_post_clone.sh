#!/bin/sh
# Xcode Cloud post-clone.
#
# Energy Epoch ships iOS via **local Mac Archive**, not Xcode Cloud.
# If a Cloud workflow is still connected to this repo, every push to main
# emails build failures. Prefer: App Store Connect → Xcode Cloud → delete/disable
# the workflow.
#
# Until then, set up Capacitor so SPM path deps resolve (POSIX paths + node_modules).
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "==> Energy Epoch Xcode Cloud post-clone"
echo "    Prefer disabling Xcode Cloud; canonical ship path is local Archive."

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: node and brew missing"
    exit 1
  fi
  brew install node@22 || brew install node
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_node
node -v
npm -v

npm ci
npm run build
npx cap sync ios
node scripts/fix-ios-spm-paths.mjs

# Belt: force POSIX separators even if cap rewrote them
node scripts/fix-ios-spm-paths.mjs

echo "==> ci_post_clone done"
