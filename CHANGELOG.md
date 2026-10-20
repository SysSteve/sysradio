# Changelog

All notable changes to SysRadio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-10-20

### Added

- Settings → About shows the licenses of all included open-source libraries and links to the
  source code.
- If the interface cannot start, SysRadio shows the error instead of an empty window, and
  writes a log file for support (`%LOCALAPPDATA%\de.syssteve.sysradio\logs` on Windows,
  `~/Library/Logs/de.syssteve.sysradio` on macOS).

### Fixed

- The selected station shows its current name and logo after favorites are refreshed.

## [0.2.0] - 2026-10-20

### Added

- Search by country (all countries, localized names), region (DACH, Latin America), language,
  26 genres and sort order.
- HLS stations (`.m3u8`).
- Add your own stations by URL, including `.pls`, `.m3u` and `.m3u8` playlists; edit them later.
- Reorder favorites with drag and drop.
- 10-band equalizer with 12 presets and your own presets.
- Animated spectrum in the player.
- Floating player: a small, freely resizable window that stays on top.
- Customizable keyboard shortcuts, inside the app and system-wide, shown in tooltips.
- Spanish and French.
- New design.

### Changed

- Running a newer Windows installer updates SysRadio in place, without uninstalling first.

### Fixed

- Keyboard shortcuts did not work after clicking a button.

## [0.1.1] - 2026-10-20

### Fixed

- The Windows volume mixer shows "SysRadio" with its icon instead of "Microsoft Edge WebView2".

## [0.1.0] - 2026-10-20

First version: search, favorites, history, now playing, tray, media keys, autostart, English
and German.

[Unreleased]: https://github.com/SysSteve/sysradio/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/SysSteve/sysradio/releases/tag/v0.2.1
[0.2.0]: https://github.com/SysSteve/sysradio/commits/v0.2.0
[0.1.1]: https://github.com/SysSteve/sysradio/commits/v0.1.1
[0.1.0]: https://github.com/SysSteve/sysradio/commits/v0.1.0
