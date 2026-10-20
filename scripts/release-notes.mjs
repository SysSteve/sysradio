// Prints the release notes for a version from CHANGELOG.md, followed by install notes.
//   node scripts/release-notes.mjs 0.2.1
import { readFileSync } from 'node:fs';

export function notesFor(changelog, version) {
  const start = changelog.indexOf(`## [${version}]`);
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const body = changelog.slice(changelog.indexOf('\n', start) + 1);
  const end = body.search(/^## \[|^\[[^\]]+\]: /m);
  return (end < 0 ? body : body.slice(0, end)).trim();
}

export const INSTALL = `### Install

- **Windows 10/11:** \`SysRadio_<version>_x64-setup.exe\`. Installs for your user, no admin rights needed. A newer installer updates SysRadio in place.
- **macOS 11+:** \`SysRadio_<version>_universal.dmg\` (Apple silicon and Intel).

The installers are not code-signed yet. Windows may show "Windows protected your PC": choose **More info → Run anyway**. On macOS, open the app with right-click → **Open** the first time.`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = (process.argv[2] ?? '').replace(/^v/, '');
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  console.log(`${notesFor(changelog, version)}\n\n${INSTALL.replaceAll('<version>', version)}`);
}
