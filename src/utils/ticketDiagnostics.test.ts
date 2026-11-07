import { describe, expect, it } from 'vitest';
import { buildDiagnostics, isDiagnosticsComplete } from './ticketDiagnostics';

const FULL = {
  platform: 'ios',
  app: 'happ',
  network: 'wifi',
  symptom: 'slow',
  since: 'today',
} as const;

describe('ticket diagnostics', () => {
  it('is complete only when all five fields hold a known option', () => {
    expect(isDiagnosticsComplete(FULL)).toBe(true);
    expect(isDiagnosticsComplete({ ...FULL, since: undefined })).toBe(false);
    expect(isDiagnosticsComplete({ ...FULL, network: 'satellite' })).toBe(false);
    expect(isDiagnosticsComplete({})).toBe(false);
  });

  it('builds the request body with ids only', () => {
    expect(buildDiagnostics(FULL)).toEqual(FULL);
    expect(buildDiagnostics({ ...FULL, since: undefined })).toBeNull();
  });

  it('adds trimmed "other" text only when other is selected, capped at 100', () => {
    const body = buildDiagnostics({
      ...FULL,
      platform: 'other',
      platform_other: `  Linux   box ${'x'.repeat(300)}`,
      app_other: 'ignored: app is not other',
    });
    expect(body?.platform_other?.length).toBeLessThanOrEqual(100);
    expect(body?.platform_other?.startsWith('Linux box x')).toBe(true);
    expect(body).not.toHaveProperty('app_other');
    expect(buildDiagnostics({ ...FULL, platform: 'other', platform_other: '   ' })).toEqual({
      ...FULL,
      platform: 'other',
    });
  });
});
