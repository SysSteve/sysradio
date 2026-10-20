import type { Facet, Station } from './types';

/** Fictional stations for the browser variant (development, tests, screenshots). */
function station(
  id: string,
  name: string,
  countryCode: string,
  tags: string[],
  bitrate = 128,
  language = '',
): Station {
  return {
    id,
    name,
    url: `https://example.org/${id}.mp3`,
    homepage: '',
    favicon: '',
    tags,
    country: countryCode,
    countryCode,
    language,
    codec: 'MP3',
    bitrate,
  };
}

export const sampleStations: Station[] = [
  station('s1', 'Beispielwelle Pop', 'DE', ['pop', 'hits']),
  station('s2', 'Testfunk Rock', 'DE', ['rock', 'classic rock']),
  station('s3', 'Alpenradio Musterberg', 'AT', ['schlager', 'volksmusik']),
  station('s4', 'Jazzkeller Demo', 'CH', ['jazz', 'swing'], 192),
  station('s5', 'Nachrichten Probe 24', 'DE', ['news', 'talk'], 64),
  station('s6', 'Klassik Muster', 'AT', ['classical', 'klassik'], 256),
  station('s7', 'Electro Sample FM mit einem sehr langen Sendernamen', 'DE', [
    'electronic',
    'house',
  ]),
  station('s8', 'Chillout Platzhalter', 'CH', ['chillout', 'lounge']),
  station('s9', 'Radio Ejemplo Quito', 'EC', ['latin', 'salsa'], 128, 'spanish'),
  station('s10', 'Estéreo Muestra Bogotá', 'CO', ['latin', 'vallenato'], 96, 'spanish'),
];

/** Countries and languages for the filter lists of the browser variant. */
export const sampleFacets: { countries: Facet[]; languages: Facet[] } = {
  countries: [
    { value: 'DE', code: 'DE', name: 'Germany', count: 6275 },
    { value: 'AT', code: 'AT', name: 'Austria', count: 610 },
    { value: 'CH', code: 'CH', name: 'Switzerland', count: 540 },
    { value: 'EC', code: 'EC', name: 'Ecuador', count: 320 },
    { value: 'CO', code: 'CO', name: 'Colombia', count: 800 },
  ],
  languages: [
    { value: 'german', code: 'de', name: 'german', count: 4411 },
    { value: 'spanish', code: 'es', name: 'spanish', count: 5350 },
  ],
};
