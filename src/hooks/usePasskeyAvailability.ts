import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { passkeyApi, type PasskeyStatus } from '../api/passkey';
import { isWebAuthnSupported } from '../utils/webauthn';
import { resolvePasskeyVisibility, type PasskeyVisibility } from '../utils/passkeyVisibility';
import { isInTelegramWebApp } from './useTelegramSDK';

const DISABLED: PasskeyStatus = { enabled: false, signup_enabled: false };

/**
 * Можно ли в ЭТОМ окружении запустить церемонию passkey.
 *
 * В Telegram Mini App вход идёт через сам Telegram, а WebView часто не отдаёт WebAuthn (или отдаёт
 * его без работающих платформенных ключей): кнопка, которая молча ничего не делает, хуже, чем её
 * отсутствие. Проверено только по возможностям API, на живом Telegram WebView — нет.
 */
export function isPasskeyEnvironmentUsable(): boolean {
  return isWebAuthnSupported() && !isInTelegramWebApp();
}

type AuthenticatorProbe = {
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  isConditionalMediationAvailable?: () => Promise<boolean>;
};

function getProbe(): AuthenticatorProbe | null {
  try {
    const pkc = (typeof window !== 'undefined' ? window.PublicKeyCredential : undefined) as
      | AuthenticatorProbe
      | undefined;
    if (!pkc) return null;
    if (
      typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable !== 'function' &&
      typeof pkc.isConditionalMediationAvailable !== 'function'
    ) {
      return null;
    }
    return pkc;
  } catch {
    return null;
  }
}

async function safe(fn: (() => Promise<boolean>) | undefined, self: unknown): Promise<boolean> {
  if (typeof fn !== 'function') return false;
  try {
    return (await fn.call(self)) === true;
  } catch {
    return false;
  }
}

/**
 * Есть ли на устройстве рабочий аутентификатор: платформенный (Touch ID, Windows Hello) или
 * условное посредничество (менеджер паролей / ключи на телефоне). Отказ API = false. Если
 * браузер этих проверок не знает, возвращает null: решение за прежней логикой.
 */
export async function probeAuthenticator(): Promise<boolean | null> {
  const probe = getProbe();
  if (!probe) return null;
  if (await safe(probe.isUserVerifyingPlatformAuthenticatorAvailable, probe)) return true;
  return safe(probe.isConditionalMediationAvailable, probe);
}

export interface PasskeyAvailability extends PasskeyVisibility {
  status: PasskeyStatus | undefined;
  /** Браузер умеет WebAuthn и это не Telegram WebView. */
  usable: boolean;
}

/** Статус passkey на бэке плюс возможности браузера: что показывать на странице. */
export function usePasskeyAvailability(): PasskeyAvailability {
  const { data: status } = useQuery<PasskeyStatus>({
    queryKey: ['passkey-status'],
    // Старый бэк без ручки (404) или сбой сети = passkey выключен, а не ошибка на странице входа.
    queryFn: () => passkeyApi.getStatus().catch(() => DISABLED),
    staleTime: 60_000,
    retry: false,
  });
  const envUsable = useMemo(() => isPasskeyEnvironmentUsable(), []);
  const hasProbe = useMemo(() => getProbe() !== null, []);
  const { data: authenticator } = useQuery<boolean | null>({
    queryKey: ['passkey-authenticator'],
    queryFn: probeAuthenticator,
    enabled: envUsable && hasProbe,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  // Пока проверка летит, кнопку не показываем; без API проверки — прежнее поведение.
  const usable = envUsable && (hasProbe ? authenticator !== false && authenticator != null : true);

  return { status, usable, ...resolvePasskeyVisibility(status, usable) };
}
