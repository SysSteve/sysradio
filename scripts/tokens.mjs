// Turns brand/tokens.json into CSS variables (src/styles/tokens.css): light by default,
// dark when the system asks for it. Run with `pnpm tokens`; a test checks the file is current.
import { readFileSync, writeFileSync } from 'node:fs';

/** @param {any} tokens */
export function render(tokens) {
  const vars = (/** @type {Record<string,string>} */ obj, prefix) =>
    Object.entries(obj).map(([k, v]) => `  --${prefix}${k}: ${v};`);
  const common = [
    ...vars(tokens.radius, 'radius-'),
    ...vars(tokens.space, 'space-'),
    ...vars(tokens.font, 'font-'),
    ...vars(tokens.shadow ?? {}, 'shadow-'),
  ];
  return [
    '/* Generated from brand/tokens.json by scripts/tokens.mjs. Do not edit. */',
    ':root {',
    '  color-scheme: light dark;',
    ...vars(tokens.color.light, ''),
    ...common,
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    ...vars(tokens.color.dark, '').map((l) => '  ' + l),
    '  }',
    '}',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('..', import.meta.url);
  const tokens = JSON.parse(readFileSync(new URL('brand/tokens.json', root), 'utf8'));
  writeFileSync(new URL('src/styles/tokens.css', root), render(tokens));
  console.log('src/styles/tokens.css written');
}
