import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getPasskeyErrorMessage } from './passkeyErrors';
import { PasskeyCeremonyError } from './webauthn';

// Переводчик-заглушка возвращает ключ: тест проверяет выбор сообщения, а не текст.
const t = ((key: string) => key) as unknown as Parameters<typeof getPasskeyErrorMessage>[1];

function apiError(status: number, detail: unknown): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    config,
    {},
    {
      status,
      statusText: '',
      headers,
      config,
      data: { detail },
    },
  );
}

describe('getPasskeyErrorMessage: церемония браузера', () => {
  it('отмена пользователем — null (молча)', () => {
    expect(getPasskeyErrorMessage(new PasskeyCeremonyError('cancelled'), t)).toBeNull();
  });

  it.each([
    ['unsupported', 'passkey.errors.unsupported'],
    ['already_registered', 'passkey.errors.deviceAlreadyHasKey'],
    ['unknown', 'passkey.errors.generic'],
  ] as const)('%s -> %s', (kind, key) => {
    expect(getPasskeyErrorMessage(new PasskeyCeremonyError(kind), t)).toBe(key);
  });
});

describe('getPasskeyErrorMessage: ответы бэка', () => {
  it('last_login_method — читаемое объяснение, а не сырой английский текст', () => {
    const err = apiError(400, {
      code: 'last_login_method',
      message: 'Cannot delete the last way to sign in to this account',
    });
    expect(getPasskeyErrorMessage(err, t)).toBe('passkey.errors.lastLoginMethod');
  });

  it.each([
    ['passkey_limit_reached', 400, 'passkey.errors.limitReached'],
    ['passkey_already_registered', 409, 'passkey.errors.alreadyRegistered'],
    ['passkey_not_found', 404, 'passkey.errors.notFound'],
    ['invalid_challenge', 400, 'passkey.errors.expired'],
    ['verification_failed', 400, 'passkey.errors.verification'],
    ['passkey_unavailable', 503, 'passkey.errors.unavailable'],
    ['passkey_disabled', 404, 'passkey.errors.disabled'],
    ['passkey_signup_disabled', 404, 'passkey.errors.signupDisabled'],
    ['registration_invite_required', 403, 'auth.registrationInviteRequired'],
  ])('код %s', (code, status, key) => {
    expect(getPasskeyErrorMessage(apiError(status, { code, message: 'x' }), t)).toBe(key);
  });

  it('429 — «слишком часто»', () => {
    expect(getPasskeyErrorMessage(apiError(429, 'Too many requests'), t)).toBe(
      'passkey.errors.tooMany',
    );
  });

  it('401 зависит от контекста: вход по ключу и вход по коду объясняются по-разному', () => {
    const err = apiError(401, 'Passkey authentication failed');
    expect(getPasskeyErrorMessage(err, t, 'login')).toBe('passkey.login.failed');
    expect(getPasskeyErrorMessage(apiError(401, 'Recovery code is invalid'), t, 'recovery')).toBe(
      'passkey.recovery.invalid',
    );
  });

  it('неизвестная ошибка и не-axios — общее сообщение, объект detail в текст не попадает', () => {
    expect(getPasskeyErrorMessage(apiError(500, { code: 'weird', message: 'boom' }), t)).toBe(
      'passkey.errors.generic',
    );
    expect(getPasskeyErrorMessage(new Error('x'), t)).toBe('passkey.errors.generic');
  });
});
