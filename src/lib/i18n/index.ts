import type { Language } from '../types';
import { de, type MessageKey, type Messages } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';

export const languages = { de, en, es, fr } satisfies Record<Exclude<Language, 'auto'>, Messages>;
export type Locale = keyof typeof languages;

/** Names of the languages in themselves, for the language picker. */
export const languageNames: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
};

/** `auto` follows the system language when SysRadio speaks it, English otherwise. */
export function resolveLocale(setting: Language, systemLanguage: string): Locale {
  if (setting !== 'auto') return setting;
  const base = systemLanguage.toLowerCase().split(/[-_]/)[0] ?? '';
  return base in languages ? (base as Locale) : 'en';
}

/** Region of the system language (`de-AT` → `AT`), used for "popular in your country". */
export function systemCountry(systemLanguage: string): string {
  const region = systemLanguage.split(/[-_]/)[1]?.toUpperCase() ?? '';
  if (/^[A-Z]{2}$/.test(region)) return region;
  return systemLanguage.toLowerCase().startsWith('de') ? 'DE' : '';
}

type Args<K extends MessageKey> = Messages[K] extends (...args: infer A) => string ? A : [];

export type Translate = <K extends MessageKey>(key: K, ...args: Args<K>) => string;

export function translator(locale: Locale): Translate {
  const messages: Messages = languages[locale];
  return (key, ...args) => {
    const message = messages[key] as string | ((...a: unknown[]) => string);
    return typeof message === 'function' ? message(...args) : message;
  };
}

export type { MessageKey, Messages };
