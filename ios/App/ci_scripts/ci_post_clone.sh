#!/bin/sh
# Xcode Cloud — after clone, before xcodebuild.
# Capacitor needs node_modules + web dist/ + POSIX paths in Package.swift.
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  echo "==> Installing Node via Homebrew (Xcode Cloud image)"
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: neither node nor brew found"
    exit 1
  fi
  brew install node@22 || brew install node
  # shellenv for non-interactive
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

echo "==> Node / npm"
ensure_node
node -v
npm -v

echo "==> npm ci"
npm ci

echo "==> Capacitor sync (build web + ios Package.swift)"
npm run build
npx cap sync ios
node scripts/fix-ios-spm-paths.mjs

echo "==> ci_post_clone done"
