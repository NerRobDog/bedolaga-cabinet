import { describe, expect, it } from 'vitest';
import {
  buildDiagnostics,
  DEFAULT_TICKET_FORM_OPTIONS,
  isDiagnosticsComplete,
  missingDiagnosticsQuestions,
  optionsForField,
  resolveTicketFormOptions,
  type TicketFormOptions,
} from './ticketDiagnostics';

const FULL = {
  location: 'abroad',
  platform: 'ios',
  app: 'Happ',
  network: 'wifi',
  symptom: 'slow',
  since: 'today',
} as const;

const SERVER: TicketFormOptions = {
  platforms: [
    { id: 'ios', name: { ru: 'iOS', en: 'iOS' } },
    { id: 'other', name: null },
  ],
  apps: { ios: ['Clash Mi', 'Happ'], other: ['Streisand'] },
  locations: ['russia', 'abroad'],
};

describe('ticket diagnostics', () => {
  it('is complete only when all six fields hold a known option', () => {
    expect(isDiagnosticsComplete(FULL)).toBe(true);
    expect(isDiagnosticsComplete({ ...FULL, since: undefined })).toBe(false);
    expect(isDiagnosticsComplete({ ...FULL, network: 'satellite' })).toBe(false);
    expect(isDiagnosticsComplete({ ...FULL, location: undefined })).toBe(false);
    expect(isDiagnosticsComplete({ ...FULL, location: 'moon' })).toBe(false);
    expect(isDiagnosticsComplete({})).toBe(false);
  });

  it('builds the request body with ids and app name only', () => {
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

  it('lists unanswered question numbers in the new order (location is question 1)', () => {
    expect(missingDiagnosticsQuestions({})).toEqual([1, 2, 3, 4, 5, 6]);
    expect(missingDiagnosticsQuestions({ ...FULL, location: undefined })).toEqual([1]);
    expect(missingDiagnosticsQuestions({ ...FULL, network: undefined })).toEqual([4]);
    expect(missingDiagnosticsQuestions({ ...FULL, app: 'other', app_other: '  ' })).toEqual([3]);
    expect(missingDiagnosticsQuestions(FULL)).toEqual([]);
  });

  it('app options depend on the platform and end with other; none before a platform', () => {
    expect(optionsForField('app', {}, SERVER)).toEqual([]);
    expect(optionsForField('app', { platform: 'ios' }, SERVER)).toEqual([
      'Clash Mi',
      'Happ',
      'other',
    ]);
    expect(optionsForField('app', { platform: 'other' }, SERVER)).toEqual(['Streisand', 'other']);
    expect(optionsForField('app', { platform: 'ghost' }, SERVER)).toEqual(['other']);
  });

  it('validates the app against the chosen platform list', () => {
    expect(isDiagnosticsComplete({ ...FULL, app: 'Streisand' }, SERVER)).toBe(false);
    expect(isDiagnosticsComplete({ ...FULL, app: 'Clash Mi' }, SERVER)).toBe(true);
    expect(
      buildDiagnostics(
        { ...FULL, platform: 'other', platform_other: 'x', app: 'Streisand' },
        SERVER,
      ),
    ).toMatchObject({
      platform: 'other',
      platform_other: 'x',
      app: 'Streisand',
    });
  });

  it('falls back to static defaults when the backend sent no options', () => {
    expect(resolveTicketFormOptions(undefined)).toBe(DEFAULT_TICKET_FORM_OPTIONS);
    expect(resolveTicketFormOptions({ tickets_enabled: true, support_type: 'tickets' })).toBe(
      DEFAULT_TICKET_FORM_OPTIONS,
    );
    expect(DEFAULT_TICKET_FORM_OPTIONS.platforms.map((p) => p.id)).toEqual([
      'ios',
      'android',
      'windows',
      'macos',
      'router',
      'other',
    ]);
    expect(optionsForField('app', { platform: 'router' }, DEFAULT_TICKET_FORM_OPTIONS)).toEqual([
      'Clash Mi',
      'Happ',
      'RabbitHole',
      'FlClashX',
      'other',
    ]);
    expect(DEFAULT_TICKET_FORM_OPTIONS.locations).toEqual(['russia', 'abroad']);
  });
});
