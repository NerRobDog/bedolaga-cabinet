import { passkeyApi, type PasskeyInfo } from '../api/passkey';
import type { AuthResponse } from '../types';
import { createPasskeyCredential, getPasskeyCredential, type CredentialJSON } from './webauthn';

// Церемонии целиком: options с бэка -> браузер -> verify. Порядок важен: challenge одноразовый и
// сгорает при любой попытке verify, поэтому отказ пользователя в браузере до verify не доходит.

/** Вход по passkey без логина (discoverable credential). */
export async function authenticateWithPasskey(signal?: AbortSignal): Promise<AuthResponse> {
  const { challenge_id, options } = await passkeyApi.loginOptions();
  const credential = await getPasskeyCredential(options, signal);
  return passkeyApi.loginVerify(challenge_id, credential);
}

/**
 * Создаёт ключ для нового аккаунта. Verify отдельно: бэк может ответить 428 «нужно согласие
 * с документами», и тогда запрос повторяют с ТЕМ ЖЕ ответом аутентификатора, не создавая
 * ключ на устройстве второй раз.
 */
export async function createSignupCredential(
  displayName?: string,
  signal?: AbortSignal,
): Promise<{ challengeId: string; credential: CredentialJSON }> {
  const { challenge_id, options } = await passkeyApi.signupOptions(displayName);
  const credential = await createPasskeyCredential(options, signal);
  return { challengeId: challenge_id, credential };
}

/** Добавить passkey в уже существующий аккаунт (нужен JWT). */
export async function registerPasskey(name?: string, signal?: AbortSignal): Promise<PasskeyInfo> {
  const { challenge_id, options } = await passkeyApi.registerOptions();
  const credential = await createPasskeyCredential(options, signal);
  return passkeyApi.registerVerify(challenge_id, credential, name);
}
