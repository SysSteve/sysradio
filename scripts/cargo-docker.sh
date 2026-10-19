#!/bin/sh
# Formats-check, lints (warnings are errors) and tests all Rust code, including the Tauri app,
# in a container with the Linux web view libraries. Caches live in ~/.cache/sysradio-docker.
#   sh scripts/cargo-docker.sh            fmt check, clippy, tests
#   sh scripts/cargo-docker.sh cargo …    any cargo command
set -eu
cd "$(dirname "$0")/.."
CACHE="$HOME/.cache/sysradio-docker"
mkdir -p "$CACHE/cargo" "$CACHE/target"
docker build -q -t sysradio-rust -f scripts/rust.Dockerfile scripts >/dev/null
[ -d dist ] || pnpm build

if [ $# -eq 0 ]; then
  set -- sh -c 'cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace'
fi
docker run --rm --init \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e CARGO_HOME=/cache/cargo -e CARGO_TARGET_DIR=/cache/target \
  -v "$CACHE:/cache" -v "$PWD:/work" -w /work/src-tauri \
  sysradio-rust "$@"
