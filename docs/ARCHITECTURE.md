# Architecture

SysRadio is a [Tauri 2](https://tauri.app) app: a Svelte 5 interface in the system web view
(WebView2 on Windows, WebKit on macOS) and a Rust shell. Playback happens in the web view; the
Rust side provides a local stream proxy, the station directory client, tray, windows and
autostart.

```
┌──────────────────────── SysRadio (Tauri) ─────────────────────────┐
│  Web view (Svelte)                        Rust                    │
│  ┌──────────────┐  commands/events  ┌───────────────────────────┐ │
│  │ App, player  │ ────────────────▶ │ lib.rs: tray, windows,    │ │
│  │ <audio>      │ ◀──────────────── │ autostart, commands       │ │
│  └──────┬───────┘  "now-playing"    ├───────────────────────────┤ │
│         │ http://127.0.0.1:port     │ streamproxy::proxy        │──┼──▶ stations
│         └──────────────────────────▶│  ICY titles, HLS, CORS    │ │
│                                     ├───────────────────────────┤ │
│                                     │ streamproxy::directory    │──┼──▶ radio-browser.info
│                                     └───────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path                            | Contents                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                          | Interface: `App.svelte` (main window), `MiniApp.svelte` (floating player), `components/`, `lib/`                                                                                                                                                          |
| `src/lib/`                      | State (`app.svelte.ts`), player (`player.svelte.ts`), Web Audio chain (`audio-graph.ts`), equalizer (`eq.ts`), shortcuts (`keybindings.ts`), favorites (`library.ts`), regions and genres (`catalog.ts`), platform layer (`platform.ts`), texts (`i18n/`) |
| `src-tauri/src/`                | Rust shell: `lib.rs` (windows, tray, commands), `mixer.rs` (Windows volume mixer name)                                                                                                                                                                    |
| `src-tauri/crates/streamproxy/` | Stream proxy, ICY parser, HLS rewriting, directory client, stream URL checks; testable without Tauri                                                                                                                                                      |
| `e2e/`                          | Playwright and axe tests, screenshots                                                                                                                                                                                                                     |
| `brand/`                        | Design tokens (`tokens.json`) and the app icon                                                                                                                                                                                                            |

## Playback

1. `Player.play(station)` starts a new session and points the `<audio>` element at
   `http://127.0.0.1:<port>/stream?t=<token>&s=<session>&u=<station URL>`.
2. The proxy requests the stream with `Icy-MetaData: 1`. If the station sends `icy-metaint`,
   `IcyDemuxer` separates audio from metadata; audio goes to the web view, each new
   `StreamTitle` becomes a `now-playing` event `{session, title}`.
3. The player only accepts titles of the current session.
4. If a stream drops, the player reconnects after 1, 2, 4, 8 and 15 seconds, then shows an
   error with "Try again". The proxy ends streams that send no data for 20 seconds.
5. HLS stations use hls.js; the proxy rewrites playlists (`/hls`) so that segments (`/seg`)
   also come through it.

The `<audio>` element runs in CORS mode, so the Web Audio chain (pre-gain → 10 biquad filters →
analyser) can process it for the equalizer and the spectrum. The proxy sends CORS headers only
for the app's own origins.

## Platform layer

`src/lib/platform.ts` contains everything the interface needs from the shell.
`tauriPlatform()` calls the Rust commands and plugins; `browserPlatform()` runs the same
interface in a plain browser for `pnpm dev`, the Playwright tests and screenshots (sample
stations, a generated sample tune, `localStorage`, `BroadcastChannel` between windows).

## Windows

- `main`: the player; it also plays the audio.
- `mini` (`mini.html`): the floating player. A borderless, always-on-top, freely resizable
  window that mirrors the main window (`player-snapshot`, `player-spectrum` events) and sends
  commands back (`player-command`).
- Both start hidden. The interface calls `show_ui` when it is ready; with `--minimized`
  (autostart) SysRadio stays in the tray.

## Storage

Tauri store `sysradio.json` in the app data folder:

- `settings`: volume, language, window options, equalizer, shortcuts, update preference
- `library`: favorites (in display order) and history (up to 25)

Stored data is validated on load (`restoreSettings`, `restoreLibrary`).

## Updates

The Tauri updater checks
`https://github.com/SysSteve/sysradio/releases/latest/download/latest.json`. Update packages
are signed in CI; the app only installs updates signed with the project key (public key in
`src-tauri/tauri.conf.json`). The Windows installer (`src-tauri/windows/installer.nsi`, based
on Tauri's template) updates in place without uninstalling.

## Security

- The stream proxy listens on `127.0.0.1` only and requires a random per-run token. It fetches
  only `http(s)` URLs; logos only as raster images up to 1 MB.
- Content security policy in `tauri.conf.json`; Tauri permissions in
  `src-tauri/capabilities/default.json`.
- TLS through rustls with the operating system's certificate store.

## Checks

| Command                                             | What it does                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm check`                                        | Prettier, svelte-check, Vitest, Rust tests of the proxy crate              |
| `pnpm check:rust`                                   | The whole Rust app in Docker: rustfmt, clippy (warnings are errors), tests |
| `pnpm test:e2e:docker`                              | Playwright and axe in the official Playwright Docker image                 |
| `pnpm screens`                                      | Screenshots of all views                                                   |
| `cargo run -p streamproxy --example live -- "name"` | Live check against real stations (in `src-tauri/`)                         |
