// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import pkg from '../../package.json';
// @ts-expect-error plain JS build script without type declarations
import { notesFor } from '../../scripts/release-notes.mjs';

const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');

it('CHANGELOG.md has a section for the current version (release notes come from it)', () => {
  const notes: string = notesFor(changelog, pkg.version);
  expect(notes.length).toBeGreaterThan(20);
  expect(notes).not.toContain('## [');
});

it('Cargo.toml and package.json carry the same version', () => {
  const cargo = readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  expect(cargo).toMatch(new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"$`, 'm'));
});
