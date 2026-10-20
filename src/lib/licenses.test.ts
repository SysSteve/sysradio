// @vitest-environment node
import { expect, it } from 'vitest';
// @ts-expect-error plain JS build script without type declarations
import { render } from '../../scripts/licenses.mjs';

it('lists every license text once, with all packages using it', () => {
  const apache = 'Apache License\nVersion 2.0';
  const out: string = render([
    {
      name: 'b',
      version: '1.0.0',
      license: 'MIT OR Apache-2.0',
      repository: '',
      texts: ['MIT (c) B', apache],
    },
    { name: 'a', version: '2.0.0', license: 'Apache-2.0', repository: '', texts: [apache] },
    { name: 'c', version: '0.1.0', license: 'BSD-3-Clause', repository: 'https://c', texts: [] },
  ]);
  expect(out.match(/Apache License/g)).toHaveLength(1);
  expect(out).toContain('a 2.0.0 (Apache-2.0), b 1.0.0 (MIT OR Apache-2.0)');
  expect(out).toContain('MIT (c) B');
  expect(out).toContain('c 0.1.0: BSD-3-Clause https://c');
  expect(out).toContain('(3 packages)');
});
