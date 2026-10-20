import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PRESETS,
  EQ_BANDS,
  MANUAL,
  applyPreset,
  bandLabel,
  defaultEq,
  deleteCustom,
  headroom,
  restoreEq,
  saveCustom,
  setBand,
} from './eq';

describe('equalizer', () => {
  it('every built-in preset has one gain per band within ±12 dB', () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(preset.gains, preset.id).toHaveLength(EQ_BANDS.length);
      expect(
        preset.gains.every((g) => Math.abs(g) <= 12),
        preset.id,
      ).toBe(true);
    }
  });

  it('moving a slider turns the preset into a manual curve, clamped and in half dB', () => {
    const eq = setBand(applyPreset(defaultEq, 'rock'), 2, 20.3);
    expect(eq.presetId).toBe(MANUAL);
    expect(eq.gains[2]).toBe(12);
    expect(setBand(defaultEq, 0, 3.26).gains[0]).toBe(3.5);
  });

  it('saves, replaces by name and deletes custom presets', () => {
    let n = 0;
    const id = () => String(++n);
    let eq = saveCustom(setBand(defaultEq, 0, 6), ' Mein Auto ', id);
    expect(eq.custom).toEqual([{ id: 'user:1', name: 'Mein Auto', gains: eq.gains }]);
    expect(eq.presetId).toBe('user:1');
    eq = saveCustom(setBand(eq, 1, 3), 'mein auto', id);
    expect(eq.custom).toHaveLength(1);
    expect(eq.custom[0]!.gains[1]).toBe(3);
    expect(saveCustom(eq, '   ', id)).toBe(eq);
    eq = deleteCustom(eq, 'user:1');
    expect(eq.custom).toEqual([]);
    expect(eq.presetId).toBe(MANUAL);
  });

  it('leaves headroom for boosts', () => {
    expect(headroom([0, 0, 0])).toBe(-0);
    expect(headroom([6, -3, 2])).toBe(-3);
  });

  it('restores damaged settings safely', () => {
    expect(restoreEq(null)).toEqual(defaultEq);
    const restored = restoreEq({
      enabled: true,
      presetId: 'user:gone',
      gains: [1, 2, 3],
      custom: [{ id: 'user:a', name: 'A', gains: EQ_BANDS.map(() => 99) }, { id: 5 }],
    });
    expect(restored.enabled).toBe(true);
    expect(restored.presetId).toBe('flat');
    expect(restored.gains).toEqual(defaultEq.gains);
    expect(restored.custom).toEqual([{ id: 'user:a', name: 'A', gains: EQ_BANDS.map(() => 12) }]);
  });

  it('labels bands', () => {
    expect(bandLabel(125)).toBe('125 Hz');
    expect(bandLabel(16000)).toBe('16 kHz');
  });
});
