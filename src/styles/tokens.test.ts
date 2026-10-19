// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import tokens from '../../brand/tokens.json';
// @ts-expect-error plain JS build script without type declarations
import { render } from '../../scripts/tokens.mjs';

it('tokens.css is generated from the current brand/tokens.json (run `pnpm tokens`)', () => {
  const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  expect(css).toBe(render(tokens));
});
