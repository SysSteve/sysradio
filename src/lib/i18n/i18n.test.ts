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
    expect(resolveLocale('auto', 'fr-CA')).toBe('fr');
    expect(resolveLocale('auto', 'es-EC')).toBe('es');
    expect(resolveLocale('auto', 'it-IT')).toBe('en');
    expect(resolveLocale('de', 'en-US')).toBe('de');
  });

  it('derives the country for "popular near you"', () => {
    expect(systemCountry('de-AT')).toBe('AT');
    expect(systemCountry('de')).toBe('DE');
    expect(systemCountry('en')).toBe('');
  });

  it('French uses no-break spaces before : ; ! ? and inside « »', () => {
    for (const [key, value] of Object.entries(languages.fr)) {
      const text =
        typeof value === 'function' ? (value as (...a: unknown[]) => string)('X', 2) : value;
      // URLs ("http://") are exempt.
      const prose = text.replace(/https?:\/\//g, '');
      expect(prose, key).not.toMatch(/ [:;!?»]/);
      expect(prose, key).not.toMatch(/« /);
      expect(prose, key).not.toMatch(/[^\s\u00a0\u202f(][;!?]/);
    }
  });

  it('no typewriter quotes in user-facing texts', () => {
    for (const [locale, messages] of Object.entries(languages))
      for (const [key, value] of Object.entries(messages)) {
        const text =
          typeof value === 'function' ? (value as (...a: unknown[]) => string)('X', 2) : value;
        expect(text, `${locale} ${key}`).not.toMatch(/"/);
        if (locale !== 'en') expect(text, `${locale} ${key}`).not.toMatch(/'/);
      }
  });

  it('fills parameters', () => {
    expect(translator('de')('search.count', 1)).toBe('1 Sender gefunden');
    expect(translator('en')('search.count', 3)).toBe('3 stations found');
  });
});
