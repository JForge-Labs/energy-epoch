#!/bin/sh
# Runs before xcodebuild on Xcode Cloud.
set -e
cd "$CI_PRIMARY_REPOSITORY_PATH"
if [ ! -d node_modules/@capacitor/app ]; then
  echo "error: node_modules missing — Xcode Cloud post-clone did not install deps."
  echo "Disable Xcode Cloud for Energy Epoch (use local Mac Archive). Every git push will keep failing otherwise."
  exit 1
fi
node scripts/fix-ios-spm-paths.mjs || true
