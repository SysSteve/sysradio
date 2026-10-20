import type { EqPreset, EqSettings } from './types';

/** Centre frequencies of the 10-band equalizer (Hz). */
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_MAX_DB = 12;
export const MANUAL = 'manual';
export const CUSTOM_PRESET_PREFIX = 'user:';

const flat = () => EQ_BANDS.map(() => 0);

/** Built-in presets; names come from the translations (`eq.preset.<id>`). */
export const BUILTIN_PRESETS: { id: string; gains: number[] }[] = [
  { id: 'flat', gains: flat() },
  { id: 'pop', gains: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2] },
  { id: 'rock', gains: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5] },
  { id: 'jazz', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: 'classical', gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { id: 'electronic', gains: [6, 5, 2, 0, -2, 1, 0, 1, 4, 5] },
  { id: 'hiphop', gains: [6, 5, 2, 3, -1, -1, 1, -1, 2, 3] },
  { id: 'bass', gains: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', gains: [0, 0, 0, 0, 0, 1, 2, 4, 6, 7] },
  { id: 'voice', gains: [-3, -2, -1, 1, 4, 5, 4, 2, 0, -2] },
  { id: 'loudness', gains: [6, 4, 1, 0, -1, 0, -1, 1, 4, 5] },
  { id: 'acoustic', gains: [4, 3, 2, 1, 1, 1, 2, 3, 3, 2] },
];

export const defaultEq: EqSettings = {
  enabled: false,
  presetId: 'flat',
  gains: flat(),
  custom: [],
};

export function clampGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.round(Math.min(EQ_MAX_DB, Math.max(-EQ_MAX_DB, db)) * 2) / 2;
}

function validGains(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== EQ_BANDS.length) return null;
  return value.map((g) => clampGain(Number(g)));
}

/** Stored settings may be damaged or from an older version. */
export function restoreEq(raw: unknown): EqSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof EqSettings, unknown>
  >;
  const custom: EqPreset[] = Array.isArray(value.custom)
    ? value.custom.flatMap((p) => {
        const preset = p as Partial<EqPreset>;
        const gains = validGains(preset?.gains);
        if (typeof preset?.id !== 'string' || typeof preset.name !== 'string' || !gains) return [];
        return [{ id: preset.id, name: preset.name.slice(0, 40), gains }];
      })
    : [];
  const presetId = typeof value.presetId === 'string' ? value.presetId : 'flat';
  const known = presetId === MANUAL || !!findPreset(presetId, custom);
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : false,
    presetId: known ? presetId : 'flat',
    gains: validGains(value.gains) ?? flat(),
    custom,
  };
}

export function findPreset(
  id: string,
  custom: EqPreset[],
): { id: string; gains: number[] } | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
}

export function applyPreset(eq: EqSettings, id: string): EqSettings {
  const preset = findPreset(id, eq.custom);
  return preset ? { ...eq, presetId: id, gains: [...preset.gains] } : eq;
}

export function setBand(eq: EqSettings, index: number, db: number): EqSettings {
  if (index < 0 || index >= EQ_BANDS.length) return eq;
  const gains = [...eq.gains];
  gains[index] = clampGain(db);
  return { ...eq, gains, presetId: MANUAL };
}

/** Saves the current curve as a custom preset (same name replaces it). */
export function saveCustom(
  eq: EqSettings,
  name: string,
  makeId: () => string = () => crypto.randomUUID(),
): EqSettings {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return eq;
  const existing = eq.custom.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const id = existing?.id ?? `${CUSTOM_PRESET_PREFIX}${makeId()}`;
  const preset = { id, name: trimmed, gains: [...eq.gains] };
  const custom = existing
    ? eq.custom.map((p) => (p.id === id ? preset : p))
    : [...eq.custom, preset];
  return { ...eq, custom, presetId: id };
}

export function deleteCustom(eq: EqSettings, id: string): EqSettings {
  const custom = eq.custom.filter((p) => p.id !== id);
  return { ...eq, custom, presetId: eq.presetId === id ? MANUAL : eq.presetId };
}

/**
 * Pre-amplification in dB so that boosted bands do not clip: half of the largest boost
 * (filters overlap, a full cut would sound too quiet).
 */
export function headroom(gains: number[]): number {
  const boost = Math.max(0, ...gains);
  return -boost * 0.5;
}

/** Filter type per band: shelves at both ends, peaks in between. */
export function bandType(index: number): BiquadFilterType {
  if (index === 0) return 'lowshelf';
  if (index === EQ_BANDS.length - 1) return 'highshelf';
  return 'peaking';
}

/** "1 kHz", "125 Hz" */
export function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}
