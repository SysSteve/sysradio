# Runs the real app (Rust + WebKitGTK web view) on a virtual screen, to reproduce problems that
# only appear in the Tauri build. Used by scripts/app-docker.sh.
FROM sysradio-rust
RUN apt-get update && apt-get install -y --no-install-recommends xvfb xauth dbus-x11 imagemagick \
      libwebkit2gtk-4.1-0 gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav \
  && rm -rf /var/lib/apt/lists/*
