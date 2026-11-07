import type { PasskeyStatus } from '../api/passkey';

export interface PasskeyVisibility {
  /** «Войти с passkey». */
  showLogin: boolean;
  /** «Создать аккаунт с passkey». */
  showSignup: boolean;
  /** «Войти по резервному коду» — WebAuthn не требует. */
  showRecovery: boolean;
}

/**
 * Что из passkey показывать на экране входа.
 *
 * `status` — ответ `/cabinet/auth/passkey/status`; его нет, пока запрос летит или если бэк
 * старый и ручки не знает: тогда скрыто всё. `webauthnUsable` — браузер умеет WebAuthn и это
 * не Telegram WebView. Кнопки passkey без этого не нужны, а форма recovery-кода нужна всегда:
 * она для человека, у которого ключа под рукой нет.
 */
export function resolvePasskeyVisibility(
  status: PasskeyStatus | null | undefined,
  webauthnUsable: boolean,
): PasskeyVisibility {
  const enabled = Boolean(status?.enabled);
  return {
    showLogin: enabled && webauthnUsable,
    showSignup: enabled && Boolean(status?.signup_enabled) && webauthnUsable,
    showRecovery: enabled,
  };
}
