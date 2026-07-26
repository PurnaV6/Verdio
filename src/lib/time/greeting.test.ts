import { describe, expect, it } from 'vitest';
import { getTimeGreeting } from './greeting';

function at(hour: number) {
  const date = new Date(2026, 6, 26, hour, 0, 0);
  return getTimeGreeting(date);
}

describe('getTimeGreeting', () => {
  it('uses the device-local morning period', () => {
    expect(at(5)).toBe('Good morning');
    expect(at(11)).toBe('Good morning');
  });

  it('uses the device-local afternoon period', () => {
    expect(at(12)).toBe('Good afternoon');
    expect(at(17)).toBe('Good afternoon');
  });

  it('uses the device-local evening period', () => {
    expect(at(18)).toBe('Good evening');
    expect(at(21)).toBe('Good evening');
  });

  it('uses a night greeting overnight', () => {
    expect(at(22)).toBe('Good night');
    expect(at(4)).toBe('Good night');
  });
});
