import type { Language } from '../types';
import { de, type MessageKey, type Messages } from './de';
import { en } from './en';

export const languages = { de, en } satisfies Record<Exclude<Language, 'auto'>, Messages>;
export type Locale = keyof typeof languages;

/** `auto` follows the system: German for any `de-*`, English otherwise. */
export function resolveLocale(setting: Language, systemLanguage: string): Locale {
  if (setting !== 'auto') return setting;
  return systemLanguage.toLowerCase().startsWith('de') ? 'de' : 'en';
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
