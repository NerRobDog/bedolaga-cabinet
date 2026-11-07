import type { TFunction } from 'i18next';
import { getApiErrorCode, getApiErrorMessage } from './api-error';

/**
 * Коды отказа в триале из ledger-потока бэка: приходят и в `reason_unavailable`
 * (GET /trial), и в `detail.code` (POST /trial, 429/400). Прежние проверки
 * отдают свободный английский текст — его здесь нет, он обрабатывается как раньше.
 */
const TRIAL_REASON_CODES = [
  'daily_limit_reached',
  'ip_limit_reached',
  'identity_already_used',
  'not_available',
] as const;

export type TrialReasonCode = (typeof TRIAL_REASON_CODES)[number];

export function isTrialReasonCode(value: unknown): value is TrialReasonCode {
  return typeof value === 'string' && (TRIAL_REASON_CODES as readonly string[]).includes(value);
}

/** Понятный текст для кода отказа; null — код неизвестен, показывать нечего. */
export function getTrialReasonText(reason: unknown, t: TFunction): string | null {
  return isTrialReasonCode(reason) ? t(`subscription.trial.reason.${reason}`) : null;
}

/** Ошибка активации: известный `detail.code` → локализованный текст, иначе как обычно. */
export function getTrialActivationError(err: unknown, t: TFunction, fallback: string): string {
  return getTrialReasonText(getApiErrorCode(err), t) ?? getApiErrorMessage(err, fallback);
}

/** Срок триала в часах: у лёгкого duration_days округлён вниз, поэтому берём duration_hours. */
export function getTrialDurationHours(info: {
  duration_hours?: number | null;
  duration_days: number;
}): number {
  return info.duration_hours ?? info.duration_days * 24;
}
