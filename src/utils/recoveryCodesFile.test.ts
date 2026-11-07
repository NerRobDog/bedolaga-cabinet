import { describe, expect, it } from 'vitest';
import { buildRecoveryCodesText } from './recoveryCodesFile';

describe('buildRecoveryCodesText', () => {
  it('заголовок, сервис с датой, пронумерованные коды и памятка', () => {
    const text = buildRecoveryCodesText({
      heading: 'Резервные коды',
      appName: 'Cabinet',
      note: 'Каждый код действует один раз.',
      codes: ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'],
      generatedAt: new Date('2026-10-27T12:00:00Z'),
    });

    expect(text).toBe(
      [
        'Резервные коды',
        'Cabinet — 2026-10-27',
        '',
        ' 1. AAAA-BBBB-CCCC-DDDD',
        ' 2. EEEE-FFFF-GGGG-HHHH',
        '',
        'Каждый код действует один раз.',
        '',
      ].join('\n'),
    );
  });
});
