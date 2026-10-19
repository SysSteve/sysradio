import { describe, expect, it } from 'vitest';
import { languages, resolveLocale, systemCountry, translator } from './index';

describe('i18n', () => {
  it('every language has every text, none empty', () => {
    const keys = Object.keys(languages.de).sort();
    for (const [locale, messages] of Object.entries(languages)) {
      expect(Object.keys(messages).sort(), locale).toEqual(keys);
      for (const [key, value] of Object.entries(messages)) {
        const text =
          typeof value === 'function' ? (value as (...a: unknown[]) => string)('X', 2) : value;
        expect(text.trim(), `${locale} ${key}`).not.toBe('');
      }
    }
  });

  it('follows the system language unless set', () => {
    expect(resolveLocale('auto', 'de-AT')).toBe('de');
    expect(resolveLocale('auto', 'fr-FR')).toBe('en');
    expect(resolveLocale('de', 'en-US')).toBe('de');
  });

  it('derives the country for "popular near you"', () => {
    expect(systemCountry('de-AT')).toBe('AT');
    expect(systemCountry('de')).toBe('DE');
    expect(systemCountry('en')).toBe('');
  });

  it('fills parameters', () => {
    expect(translator('de')('search.count', 1)).toBe('1 Sender gefunden');
    expect(translator('en')('search.count', 3)).toBe('3 stations found');
  });
});
