# Security policy

Please **do not** report security issues in public issues.

Use GitHub's private vulnerability reporting instead: open the
[Security tab](https://github.com/SysSteve/sysradio/security) of this repository and choose
**Report a vulnerability**. You will get an answer as soon as possible, usually within a week.

Areas of particular interest:

- the local stream proxy (`src-tauri/crates/streamproxy`), which listens on `127.0.0.1` and
  requires a random per-run token,
- handling of untrusted data from stations and the station directory (titles, logos,
  playlists),
- the app's content security policy and Tauri permissions (`src-tauri/capabilities`).

Only the latest release receives fixes.
