import type { Facet } from './types';

/** Regions as groups of countries (the directory only knows countries). */
export const REGIONS: Record<'dach' | 'latam', string[]> = {
  dach: ['DE', 'AT', 'CH'],
  // Mexico, Central America, the Spanish- and French-speaking Caribbean, South America.
  latam: [
    'MX',
    'GT',
    'BZ',
    'SV',
    'HN',
    'NI',
    'CR',
    'PA',
    'CU',
    'DO',
    'PR',
    'HT',
    'CO',
    'VE',
    'EC',
    'PE',
    'BO',
    'CL',
    'AR',
    'UY',
    'PY',
    'BR',
  ],
};
export type RegionId = keyof typeof REGIONS;

/** Genres: translation key and the directory tag searched for. The first ones are quick picks. */
export const GENRES = [
  ['pop', 'pop'],
  ['rock', 'rock'],
  ['news', 'news'],
  ['latin', 'latin'],
  ['electronic', 'electronic'],
  ['jazz', 'jazz'],
  ['classical', 'classical'],
  ['hiphop', 'hip hop'],
  ['talk', 'talk'],
  ['sports', 'sports'],
  ['blues', 'blues'],
  ['dance', 'dance'],
  ['house', 'house'],
  ['soul', 'soul'],
  ['reggae', 'reggae'],
  ['salsa', 'salsa'],
  ['country', 'country'],
  ['folk', 'folk'],
  ['metal', 'metal'],
  ['indie', 'indie'],
  ['oldies', 'oldies'],
  ['80s', '80s'],
  ['90s', '90s'],
  ['schlager', 'schlager'],
  ['chillout', 'chillout'],
  ['ambient', 'ambient'],
] as const;
export const QUICK_GENRES = 8;

/** Localised names via the browser's Intl data, falling back to the directory's name. */
export function displayName(facet: Facet, locale: string, type: 'region' | 'language'): string {
  if (facet.code) {
    try {
      const name = new Intl.DisplayNames([locale], { type }).of(
        type === 'region' ? facet.code.toUpperCase() : facet.code,
      );
      if (name && name.toLowerCase() !== facet.code.toLowerCase()) return name;
    } catch {
      // Unknown code: use the directory's name below.
    }
  }
  return facet.name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Facets with localised names, sorted alphabetically in the UI language. */
export function localisedFacets(list: Facet[], locale: string, type: 'region' | 'language') {
  return list
    .map((facet) => ({ ...facet, label: displayName(facet, locale, type) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
