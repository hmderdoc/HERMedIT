import { describe, it, expect } from 'vitest';
import { CHARSETS, DEFAULT_CHARSET } from '../src/ui/charsets';

describe('F-key character sets', () => {
  it('every set has exactly ten F1..F10 slots of valid CP437 codes', () => {
    expect(CHARSETS.length).toBeGreaterThan(0);
    for (const set of CHARSETS) {
      expect(set.length).toBe(10);
      for (const code of set) {
        expect(code).toBeGreaterThanOrEqual(0);
        expect(code).toBeLessThanOrEqual(255);
      }
    }
  });

  it('defaults to the classic blocks set', () => {
    expect(CHARSETS[DEFAULT_CHARSET]).toEqual([176, 177, 178, 219, 223, 220, 221, 222, 254, 250]);
  });
});
