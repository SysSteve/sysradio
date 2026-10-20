// Writes the winget manifests for a published release into winget/<version>/:
//   node scripts/winget.mjs 0.3.2
// Downloads the Windows setup from the GitHub release to compute its SHA-256.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const ID = 'SysSteve.SysRadio';
const SCHEMA = '1.12.0';
const REPO = 'https://github.com/SysSteve/sysradio';

export function manifests(version, sha256, { arpPublisher = 'SysSteve' } = {}) {
  const head = (kind) =>
    `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${kind}.${SCHEMA}.schema.json\n\n`;
  const url = `${REPO}/releases/download/v${version}/SysRadio_${version}_x64-setup.exe`;
  return {
    [`${ID}.yaml`]: `${head('version')}PackageIdentifier: ${ID}
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${SCHEMA}
`,
    [`${ID}.installer.yaml`]: `${head('installer')}PackageIdentifier: ${ID}
PackageVersion: ${version}
InstallerType: nullsoft
Scope: user
UpgradeBehavior: install
ProductCode: SysRadio
ReleaseDate: ${new Date().toISOString().slice(0, 10)}
AppsAndFeaturesEntries:
- DisplayName: SysRadio
  Publisher: ${arpPublisher}
  DisplayVersion: ${version}
  ProductCode: SysRadio
Dependencies:
  PackageDependencies:
  - PackageIdentifier: Microsoft.EdgeWebView2Runtime
Installers:
- Architecture: x64
  InstallerUrl: ${url}
  InstallerSha256: ${sha256.toUpperCase()}
ManifestType: installer
ManifestVersion: ${SCHEMA}
`,
    [`${ID}.locale.en-US.yaml`]: `${head('defaultLocale')}PackageIdentifier: ${ID}
PackageVersion: ${version}
PackageLocale: en-US
Publisher: SysSteve
PublisherUrl: https://github.com/SysSteve
PublisherSupportUrl: ${REPO}/issues
PrivacyUrl: ${REPO}/blob/main/PRIVACY.md
PackageName: SysRadio
PackageUrl: ${REPO}
License: MIT
LicenseUrl: ${REPO}/blob/main/LICENSE
ShortDescription: A fast, private internet radio player.
Description: SysRadio plays tens of thousands of internet radio stations from the free radio-browser.info directory. It shows live song titles and offers favorites, search by country, region, language and genre, your own stream URLs, an equalizer, an animated spectrum, a floating mini player, customizable shortcuts, tray and media keys. No account, no ads, no tracking.
Moniker: sysradio
Tags:
- equalizer
- internet-radio
- music
- open-source
- radio
- streaming
ReleaseNotesUrl: ${REPO}/releases/tag/v${version}
ManifestType: defaultLocale
ManifestVersion: ${SCHEMA}
`,
  };
}

if (process.argv[2]) {
  const version = process.argv[2].replace(/^v/, '');
  const arpPublisher = process.argv[3] ?? 'SysSteve';
  const url = `${REPO}/releases/download/v${version}/SysRadio_${version}_x64-setup.exe`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const sha256 = createHash('sha256')
    .update(Buffer.from(await res.arrayBuffer()))
    .digest('hex');
  const dir = `winget/${version}`;
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(manifests(version, sha256, { arpPublisher })))
    writeFileSync(`${dir}/${name}`, text);
  console.log(`${dir}: ${sha256}`);
}
