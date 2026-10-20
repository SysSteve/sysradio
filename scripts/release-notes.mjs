// Prints the release notes for a version from CHANGELOG.md, followed by install notes.
//   node scripts/release-notes.mjs 0.2.1
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export function notesFor(changelog, version) {
  const start = changelog.indexOf(`## [${version}]`);
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const body = changelog.slice(changelog.indexOf('\n', start) + 1);
  const end = body.search(/^## \[|^\[[^\]]+\]: /m);
  return (end < 0 ? body : body.slice(0, end)).trim();
}

export const INSTALL = `### Install

- **Windows 10/11 (64-bit):** \`SysRadio_<version>_x64-setup.exe\`. Installs for your user, no admin rights needed. A newer installer updates SysRadio in place; favorites and settings stay.
- **macOS 11 Big Sur or later:** \`SysRadio_<version>_universal.dmg\` (Apple silicon and Intel).

Requirements: internet connection; on Windows the Microsoft Edge WebView2 runtime (built into Windows 11 and current Windows 10, otherwise the installer adds it). Details: [system requirements](https://github.com/SysSteve/sysradio#system-requirements).

The installers are not code-signed yet. Windows may show "Windows protected your PC": choose **More info → Run anyway**; with Smart App Control on, Windows 11 blocks unsigned apps until code signing is in place. On macOS, the first start says Apple could not verify the app: open **System Settings → Privacy & Security**, click **Open Anyway** and confirm with **Open**.`;

// Run directly (not imported)? Compared as paths, so it also works on Windows.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const version = (process.argv[2] ?? '').replace(/^v/, '');
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  console.log(`${notesFor(changelog, version)}\n\n${INSTALL.replaceAll('<version>', version)}`);
}
