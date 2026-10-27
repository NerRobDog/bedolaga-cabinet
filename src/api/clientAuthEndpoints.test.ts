// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isAuthEndpoint } from './client';

/**
 * Для «публичных» ручек перехватчик не вешает Authorization и не лезет в refresh на 401.
 * 401 на passkey/login/verify — «ключ не подошёл»; без этого перехватчик счёл бы его
 * протухшим токеном, стёр сессию и увёл на /login (перезагрузкой страницы).
 */
describe('isAuthEndpoint: passkey', () => {
  it.each([
    '/cabinet/auth/passkey/status',
    '/cabinet/auth/passkey/login/options',
    '/cabinet/auth/passkey/login/verify',
    '/cabinet/auth/passkey/signup/options',
    '/cabinet/auth/passkey/signup/verify',
    '/cabinet/auth/recovery/login',
  ])('%s — публичная ручка', (url) => {
    expect(isAuthEndpoint(url)).toBe(true);
  });

  it.each([
    '/cabinet/passkey',
    '/cabinet/passkey/register/options',
    '/cabinet/passkey/register/verify',
    '/cabinet/passkey/12',
    '/cabinet/passkey/recovery-codes',
    '/cabinet/passkey/recovery-codes/regenerate',
  ])('%s — под JWT', (url) => {
    expect(isAuthEndpoint(url)).toBe(false);
  });
});
