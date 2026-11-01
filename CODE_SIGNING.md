# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

> **Status:** Code signing through the SignPath Foundation program is planned. Until it is set
> up, the Windows installers are **not** Authenticode-signed. This page will name the first signed version once there is one.

## What is signed

- Only official Windows release files of SysRadio (`SysRadio.exe` and
  `SysRadio_x.y.z_x64-setup.exe`) that GitHub Actions builds from this public repository.
- Releases are built from a version tag (`v*`) by the workflow in
  [`.github/workflows/release.yml`](.github/workflows/release.yml), on GitHub-hosted runners.
- Every signing request is approved by hand by the approver named below, after the automated
  build has passed.
- Signed files carry the product name `SysRadio` and the release version in their file
  metadata.
- Third-party binaries are never signed with this certificate.

The update packages are additionally signed with the Tauri updater key (minisign); the app only
installs updates with a valid signature. That signature is separate from Authenticode code
signing and does not replace it.

## Team roles

SysRadio is maintained by one person.

- Committers and reviewers: [SysSteve](https://github.com/SysSteve)
- Approvers: [SysSteve](https://github.com/SysSteve)

Changes from anyone else (pull requests) are reviewed by the maintainer before they are merged.
Changes to build scripts and workflows get the same review. All accounts with access to the
repository or to code signing use multi-factor authentication.

## Privacy policy

SysRadio does not collect, store or send personal data to the SysRadio project: no account, no
analytics, no tracking, no advertising. To work, it connects to the station directory
radio-browser.info, to the radio stations you play and to GitHub for update checks (the
automatic check can be turned off in Settings). Details:
[PRIVACY.md](PRIVACY.md).

## Verify a download

Official downloads are only on [GitHub Releases](https://github.com/SysSteve/sysradio/releases).
Once signing is active, the Windows files will show **SignPath Foundation** as the publisher
(file properties → Digital Signatures).

Something signed with this certificate that looks wrong? Please report it as described in
[SECURITY.md](SECURITY.md).
