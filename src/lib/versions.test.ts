// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import pkg from '../../package.json';

/**
 * Tauri refuses to build when an npm package and its Rust crate differ in major.minor
 * (v0.3.0 release failed that way). Crates are pinned exactly in Cargo.toml; the lockfile must
 * follow the pins.
 */
const cargoToml = readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const cargoLock = readFileSync(new URL('../../src-tauri/Cargo.lock', import.meta.url), 'utf8');
const npm: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

function locked(crate: string): string | undefined {
  return cargoLock.match(new RegExp(`name = "${crate}"\\nversion = "([^"]+)"`))?.[1];
}
const minor = (v: string) =>
  v
    .replace(/^[=^~]/, '')
    .split('.')
    .slice(0, 2)
    .join('.');

it('every Tauri npm package matches its crate (major.minor)', () => {
  const pairs = Object.keys(npm)
    .filter((name) => name.startsWith('@tauri-apps/plugin-') || name === '@tauri-apps/api')
    .map((name) => [
      name,
      name === '@tauri-apps/api' ? 'tauri' : name.replace('@tauri-apps/plugin-', 'tauri-plugin-'),
    ]);
  expect(pairs.length).toBeGreaterThan(5);
  for (const [name, crate] of pairs) {
    const version = locked(crate!);
    expect(version, `${crate} in Cargo.lock`).toBeDefined();
    expect(minor(version!), `${name} ${npm[name!]} vs ${crate} ${version}`).toBe(
      minor(npm[name!]!),
    );
  }
});

it('Tauri crates are pinned exactly and the lockfile follows the pins', () => {
  const pins = [...cargoToml.matchAll(/^(tauri[\w-]*) = (?:\{ version = )?"([^"]+)"/gm)];
  expect(pins.length).toBeGreaterThan(5);
  for (const [, crate, spec] of pins) {
    expect(spec, crate).toMatch(/^=\d+\.\d+\.\d+$/);
    expect(locked(crate!), crate).toBe(spec!.slice(1));
  }
});
