import { expect, it } from 'vitest';
import { GENRES, REGIONS, displayName, localisedFacets } from './catalog';

it('regions contain Ecuador and Colombia, codes are unique', () => {
  expect(REGIONS.latam).toEqual(expect.arrayContaining(['EC', 'CO']));
  expect(new Set(REGIONS.latam).size).toBe(REGIONS.latam.length);
  expect(new Set(GENRES.map(([key]) => key)).size).toBe(GENRES.length);
});

it('localises country and language names', () => {
  const ec = { value: 'EC', code: 'EC', name: 'Ecuador', count: 1 };
  expect(displayName({ ...ec, value: 'DE', code: 'DE', name: 'Germany' }, 'de', 'region')).toBe(
    'Deutschland',
  );
  expect(
    displayName({ value: 'german', code: 'de', name: 'german', count: 1 }, 'fr', 'language'),
  ).toBe('allemand');
  expect(
    displayName({ value: 'klingon', code: '', name: 'klingon', count: 1 }, 'de', 'language'),
  ).toBe('Klingon');
  expect(
    localisedFacets(
      [ec, { value: 'AT', code: 'AT', name: 'Austria', count: 2 }],
      'es',
      'region',
    ).map((f) => f.label),
  ).toEqual(['Austria', 'Ecuador']);
});
