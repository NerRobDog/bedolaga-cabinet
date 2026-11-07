import axios from 'axios';
import type { TFunction } from 'i18next';
import { getApiErrorCode, isRateLimitedError } from './api-error';
import { PasskeyCeremonyError } from './webauthn';

export type PasskeyErrorContext = 'login' | 'recovery' | 'manage';

// Коды из detail.code бэка (routes/passkey.py, passkey_signup.py). Английский message
// бэка в интерфейс не выводим: он не переведён.
const CODE_MESSAGES: Record<string, string> = {
  last_login_method: 'passkey.errors.lastLoginMethod',
  passkey_limit_reached: 'passkey.errors.limitReached',
  passkey_already_registered: 'passkey.errors.alreadyRegistered',
  passkey_not_found: 'passkey.errors.notFound',
  invalid_challenge: 'passkey.errors.expired',
  verification_failed: 'passkey.errors.verification',
  passkey_unavailable: 'passkey.errors.unavailable',
  passkey_disabled: 'passkey.errors.disabled',
  passkey_signup_disabled: 'passkey.errors.signupDisabled',
  registration_invite_required: 'auth.registrationInviteRequired',
};

/**
 * Текст ошибки для пользователя или `null`, если показывать нечего.
 *
 * `null` — только отказ самого пользователя (закрыл окно passkey, нажал «Отмена»): это не сбой,
 * и красная плашка после своего же отказа выглядит как упрёк.
 */
export function getPasskeyErrorMessage(
  err: unknown,
  t: TFunction,
  context: PasskeyErrorContext = 'manage',
): string | null {
  if (err instanceof PasskeyCeremonyError) {
    switch (err.kind) {
      case 'cancelled':
        return null;
      case 'unsupported':
        return t('passkey.errors.unsupported');
      case 'already_registered':
        return t('passkey.errors.deviceAlreadyHasKey');
      default:
        return t('passkey.errors.generic');
    }
  }

  const code = getApiErrorCode(err);
  if (code && CODE_MESSAGES[code]) return t(CODE_MESSAGES[code]);

  if (isRateLimitedError(err)) return t('passkey.errors.tooMany');

  if (axios.isAxiosError(err) && err.response?.status === 401) {
    if (context === 'login') return t('passkey.login.failed');
    if (context === 'recovery') return t('passkey.recovery.invalid');
  }

  return t('passkey.errors.generic');
}
