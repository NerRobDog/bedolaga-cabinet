import { describe, expect, it } from 'vitest';
import {
  buildDiagnostics,
  isDiagnosticsComplete,
  missingDiagnosticsQuestions,
} from './ticketDiagnostics';

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
  });

  it('requires non-blank text when other is selected', () => {
    const other = { ...FULL, platform: 'other' };
    expect(isDiagnosticsComplete(other)).toBe(false);
    expect(isDiagnosticsComplete({ ...other, platform_other: '   ' })).toBe(false);
    expect(buildDiagnostics({ ...other, platform_other: '  ' })).toBeNull();
    expect(isDiagnosticsComplete({ ...other, platform_other: 'Steam Deck' })).toBe(true);
    expect(isDiagnosticsComplete({ ...FULL, app: 'other', app_other: ' x ' })).toBe(true);
  });

  it('lists unanswered question numbers, counting "other" without text as unanswered', () => {
    expect(missingDiagnosticsQuestions({})).toEqual([1, 2, 3, 4, 5]);
    expect(missingDiagnosticsQuestions({ ...FULL, network: undefined })).toEqual([3]);
    expect(missingDiagnosticsQuestions({ ...FULL, app: 'other', app_other: '  ' })).toEqual([2]);
    expect(missingDiagnosticsQuestions({ ...FULL, app: 'other', app_other: 'Streisand' })).toEqual([]);
    expect(missingDiagnosticsQuestions(FULL)).toEqual([]);
  });
});
