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
  const usable = useMemo(() => isPasskeyEnvironmentUsable(), []);

  return { status, usable, ...resolvePasskeyVisibility(status, usable) };
}
