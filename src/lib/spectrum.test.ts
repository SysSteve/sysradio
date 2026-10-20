import { expect, it } from 'vitest';
import { idleLevels, toLevels } from './spectrum';

it('maps bins to log-spaced bars between 0 and 1', () => {
  const bins = new Uint8Array(128);
  bins[1] = 255; // ~190 Hz at 48 kHz
  const levels = toLevels(bins, 16);
  expect(levels).toHaveLength(16);
  expect(levels.every((l) => l >= 0 && l <= 1)).toBe(true);
  expect(Math.max(...levels.slice(0, 6))).toBeGreaterThan(0.8);
  expect(Math.max(...levels.slice(10))).toBe(0);
});

it('idle motion stays in a calm range', () => {
  const levels = idleLevels(20, 1234);
  expect(levels.every((l) => l > 0 && l < 0.6)).toBe(true);
});
