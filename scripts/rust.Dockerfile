# Rust with the Linux libraries Tauri needs (web view, tray), for compiling and linting the
# whole app on machines without them (for example macOS). Used by scripts/cargo-docker.sh.
FROM rust:1.99-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev file \
  && rm -rf /var/lib/apt/lists/* \
  && rustup component add clippy rustfmt
