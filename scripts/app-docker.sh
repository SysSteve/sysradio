#!/bin/sh
# Starts the real SysRadio app (debug build, bundled UI) on a virtual screen for a few seconds,
# prints its output and saves a screenshot to test-results/app-screen.png.
#   sh scripts/app-docker.sh [seconds]
set -eu
cd "$(dirname "$0")/.."
SECONDS_TO_RUN=${1:-15}
CACHE="$HOME/.cache/sysradio-docker"
mkdir -p "$CACHE/cargo" "$CACHE/target" "$CACHE/home" test-results
docker build -q -t sysradio-rust -f scripts/rust.Dockerfile scripts >/dev/null
docker build -q -t sysradio-app -f scripts/app-docker.Dockerfile scripts >/dev/null
pnpm build >/dev/null
docker run --rm --init \
  --user "$(id -u):$(id -g)" -e HOME=/cache/home \
  -e CARGO_HOME=/cache/cargo -e CARGO_TARGET_DIR=/cache/target \
  -e WEBKIT_DISABLE_COMPOSITING_MODE=1 -e RUST_BACKTRACE=1 \
  -v "$CACHE:/cache" -v "$PWD:/work" -w /work/src-tauri \
  sysradio-app sh -c "
    cargo build --features tauri/custom-protocol 2>&1 | tail -2 &&
    xvfb-run -a -s '-screen 0 1280x800x24' sh -c '
      /cache/target/debug/sysradio & APP=\$!
      sleep $SECONDS_TO_RUN
      import -window root /work/test-results/app-screen.png
      kill \$APP'
  "
