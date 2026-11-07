import { describe, expect, it } from 'vitest';
import { formatQuickValue, quickAmountDecimals } from './quickAmount';

describe('quickAmount', () => {
  it('дробные суммы в долларах показываются с двумя знаками', () => {
    expect(formatQuickValue(0.12, 'USD')).toBe('0.12');
    expect(formatQuickValue(4.4, 'USD')).toBe('4.40');
  });

  it('целые суммы — без дроби', () => {
    expect(formatQuickValue(12, 'USD')).toBe('12');
    expect(formatQuickValue(12.001, 'USD')).toBe('12');
    expect(formatQuickValue(300, 'RUB')).toBe('300');
  });

  it('томаны всегда целые', () => {
    expect(quickAmountDecimals(1234.5, 'IRR')).toBe(0);
    expect(formatQuickValue(1234.5, 'IRR')).toBe('1235');
  });

  it('копеечные рубли не теряются', () => {
    expect(formatQuickValue(64.07, 'RUB')).toBe('64.07');
  });
});
