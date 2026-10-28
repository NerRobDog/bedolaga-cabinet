import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import {
  getTrialActivationError,
  getTrialDurationHours,
  getTrialReasonText,
  isTrialReasonCode,
} from './trialReasons';

const t = ((key: string) => key) as unknown as TFunction;

function refusal(status: number, detail: unknown): AxiosError {
  const err = new AxiosError('refused');
  err.response = { status, data: { detail } } as AxiosError['response'];
  return err;
}

describe('getTrialReasonText', () => {
  it.each(['daily_limit_reached', 'ip_limit_reached', 'identity_already_used', 'not_available'])(
    'maps %s to its locale key',
    (code) => {
      expect(isTrialReasonCode(code)).toBe(true);
      expect(getTrialReasonText(code, t)).toBe(`subscription.trial.reason.${code}`);
    },
  );

  it('ignores legacy free-text reasons and empty values', () => {
    expect(getTrialReasonText('Trial already used', t)).toBeNull();
    expect(getTrialReasonText(null, t)).toBeNull();
    expect(getTrialReasonText(undefined, t)).toBeNull();
  });
});

describe('getTrialActivationError', () => {
  it.each([
    [429, 'daily_limit_reached'],
    [429, 'ip_limit_reached'],
    [400, 'identity_already_used'],
    [400, 'not_available'],
  ])('maps %s {code: %s} to the friendly text, not the backend message', (status, code) => {
    const err = refusal(status, { code, message: 'raw backend text' });
    expect(getTrialActivationError(err, t, 'fallback')).toBe(`subscription.trial.reason.${code}`);
  });

  it('keeps string details from legacy checks as they were', () => {
    expect(getTrialActivationError(refusal(400, 'Trial already used'), t, 'fallback')).toBe(
      'Trial already used',
    );
  });

  it('uses the message of an unknown structured code', () => {
    const err = refusal(409, { code: 'something_else', message: 'Conflict text' });
    expect(getTrialActivationError(err, t, 'fallback')).toBe('Conflict text');
  });

  it('falls back for non-HTTP errors', () => {
    expect(getTrialActivationError(new Error('x'), t, 'fallback')).toBe('fallback');
  });
});

describe('getTrialDurationHours', () => {
  it('prefers duration_hours, which stays exact when days round down to 0', () => {
    expect(getTrialDurationHours({ duration_hours: 24, duration_days: 1 })).toBe(24);
    expect(getTrialDurationHours({ duration_hours: 12, duration_days: 0 })).toBe(12);
  });

  it('derives hours from days for backends without the field', () => {
    expect(getTrialDurationHours({ duration_days: 3 })).toBe(72);
  });
});
