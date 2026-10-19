#!/bin/sh
# Runs the Playwright tests in Microsoft's Playwright image, so no Chrome is needed on the
# machine and results match on Windows, Linux and macOS. Extra arguments go to Playwright.
#   sh scripts/e2e-docker.sh [e2e/some.spec.ts]
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('@playwright/test/package.json').version")

pnpm build

# Own UID, so files written to dist and test-results do not end up owned by root.
docker run --rm --init \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 -e SCREENS="${SCREENS:-}" \
  -v "$PWD:/work" -w /work \
  "mcr.microsoft.com/playwright:v$VERSION-noble" \
  npx playwright test "$@"
