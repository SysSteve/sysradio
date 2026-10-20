// Collects the licences of everything SysRadio ships: the JavaScript packages that end up in
// the Vite bundle and the Rust crates linked into the app (normal dependencies, all targets).
// Used as a Vite plugin; emits `third-party-licenses.txt`, shown under Settings → About.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, sep } from 'node:path';

// rustup's default location, for shells that did not load it into PATH.
const env = {
  ...process.env,
  PATH: [process.env.PATH, join(homedir(), '.cargo', 'bin')].join(delimiter),
};
const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });

const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)([.-].*)?$/i;

function licenseTexts(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => LICENSE_FILE.test(f))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Package root and name for a module path inside node_modules. */
function packageOf(id) {
  const marker = `${sep}node_modules${sep}`;
  const at = id.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = id.slice(at + marker.length).split(sep);
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return join(id.slice(0, at + marker.length), name);
}

export function npmPackages(moduleIds) {
  const roots = new Set();
  for (const id of moduleIds) {
    const root = packageOf(id.replace(/^\0/, '').split('?')[0]);
    if (root && existsSync(join(root, 'package.json'))) roots.add(root);
  }
  return [...roots].map((root) => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const repo =
      typeof pkg.repository === 'string'
        ? pkg.repository
        : (pkg.repository?.url ?? pkg.homepage ?? '');
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? 'UNKNOWN',
      repository: repo,
      texts: licenseTexts(root),
    };
  });
}

/** Target of the current build: Tauri sets it for the frontend build; otherwise this machine. */
function targetTriple() {
  const triple = process.env.TAURI_ENV_TARGET_TRIPLE;
  if (triple) return triple === 'universal-apple-darwin' ? 'aarch64-apple-darwin' : triple;
  const host = run('rustc', ['-vV']).match(/^host: (.+)$/m);
  return host?.[1] ?? '';
}

export function cargoPackages(manifest) {
  const triple = targetTriple();
  const args = ['metadata', '--format-version', '1', '--manifest-path', manifest];
  // Only crates that are linked on this platform (no GTK on Windows, no WebView2 on macOS).
  if (triple) args.push('--filter-platform', triple);
  const meta = JSON.parse(run('cargo', args));
  const members = new Set(meta.workspace_members);
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const root = meta.packages.find((p) => p.name === 'sysradio');
  const seen = new Set();
  const queue = [root.id];
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      // Only what gets linked: normal dependencies (any target), no build or dev ones.
      if (dep.dep_kinds.some((k) => k.kind === null)) queue.push(dep.pkg);
    }
  }
  return [...seen]
    .filter((id) => !members.has(id))
    .map((id) => byId.get(id))
    .map((p) => ({
      name: p.name,
      version: p.version,
      license: p.license ?? (p.license_file ? 'see file' : 'UNKNOWN'),
      repository: p.repository ?? '',
      texts: licenseTexts(dirname(p.manifest_path)),
    }));
}

/** Every distinct licence text appears once, with the packages that ship it. */
export function render(packages) {
  const sorted = [...packages].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  const groups = new Map();
  const withoutText = [];
  for (const p of sorted) {
    if (p.texts.length === 0) withoutText.push(p);
    for (const text of p.texts) {
      const key = text.replace(/\s+/g, ' ');
      const group = groups.get(key) ?? { text, packages: [] };
      group.packages.push(p);
      groups.set(key, group);
    }
  }
  const line = '='.repeat(78);
  const out = [
    'SysRadio – third-party licenses',
    '',
    'SysRadio is open source under the MIT License. It includes the following open-source',
    `software (${sorted.length} packages). Their licenses and copyright notices follow.`,
    '',
  ];
  for (const group of groups.values()) {
    out.push(line);
    out.push(group.packages.map((p) => `${p.name} ${p.version} (${p.license})`).join(', '));
    out.push(line, '', group.text, '');
  }
  if (withoutText.length) {
    out.push(
      line,
      'Packages without a license file in their distribution (license and source):',
      line,
      '',
    );
    for (const p of withoutText)
      out.push(`${p.name} ${p.version}: ${p.license} ${p.repository}`.trim());
    out.push('');
  }
  return out.join('\n');
}

/** Vite plugin: emits third-party-licenses.txt next to the app. */
export function licenses({ manifest = 'src-tauri/Cargo.toml' } = {}) {
  return {
    name: 'sysradio-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      const ids = new Set();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') for (const id of Object.keys(chunk.modules)) ids.add(id);
      }
      const packages = [...npmPackages(ids), ...cargoPackages(manifest)];
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.txt',
        source: render(packages),
      });
    },
  };
}
