/**
 * Знаков после запятой у кнопки быстрой суммы. Целое число показываем без дроби, дробное —
 * с двумя знаками: 0.12 $ и 4.40 $ не должны превращаться в «0» и «4», иначе подпись
 * не совпадает с вставляемым в поле значением. Томаны (IRR) всегда целые.
 */
export function quickAmountDecimals(value: number, currency: string): number {
  if (currency === 'IRR') return 0;
  return Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2;
}

export function formatQuickValue(value: number, currency: string): string {
  return value.toFixed(quickAmountDecimals(value, currency));
}
