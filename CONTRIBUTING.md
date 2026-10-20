# Contributing to SysRadio

Thanks for helping! A few notes keep things smooth.

## Reporting bugs and ideas

Open an [issue](https://github.com/SysSteve/sysradio/issues). For bugs, include your system
(Windows/macOS version), the SysRadio version (Settings → About) and, if it is about a
station, its name or stream URL.

## Pull requests

1. Fork, create a branch, make your change.
2. Keep the checks green before you push:

   ```bash
   pnpm check                 # format, types, unit tests, Rust tests of the proxy
   pnpm check:rust            # the whole Rust app (fmt, clippy, tests) in Docker
   pnpm test:e2e:docker       # browser and accessibility tests in Docker
   ```

3. Describe what changed and why.

Guidelines:

- **Accessibility is required** (WCAG 2.2 AA): everything works with the keyboard, has a
  visible focus and a label; new views go into `e2e/a11y.spec.ts`.
- **Texts** live in `src/lib/i18n/` (German is the source; English, Spanish and French must
  have every key). Never write user-facing text directly into components.
- **Design** uses the tokens in `brand/tokens.json` (`pnpm tokens` regenerates the CSS).
- **Privacy:** no tracking, no analytics, no new network services without discussion.
- Code, comments and commit messages in English.

By contributing you agree that your contribution is licensed under the MIT License.
