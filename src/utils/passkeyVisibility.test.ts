import { describe, expect, it } from 'vitest';
import { resolvePasskeyVisibility } from './passkeyVisibility';

/**
 * Что показывать на экране входа. Кнопки passkey видны, только когда бэк их включил И
 * браузер умеет WebAuthn; форма recovery-кода от WebAuthn не зависит — это путь для
 * человека, который потерял устройство с ключом (и мог открыть кабинет в другом браузере).
 */
describe('resolvePasskeyVisibility', () => {
  const on = { enabled: true, signup_enabled: true };

  it('всё включено и WebAuthn есть: вход, регистрация и recovery', () => {
    expect(resolvePasskeyVisibility(on, true)).toEqual({
      showLogin: true,
      showSignup: true,
      showRecovery: true,
    });
  });

  it('регистрация закрыта: только вход и recovery', () => {
    expect(resolvePasskeyVisibility({ enabled: true, signup_enabled: false }, true)).toEqual({
      showLogin: true,
      showSignup: false,
      showRecovery: true,
    });
  });

  it('passkey выключен на бэке: ничего не показываем, даже если signup_enabled пришёл true', () => {
    expect(resolvePasskeyVisibility({ enabled: false, signup_enabled: true }, true)).toEqual({
      showLogin: false,
      showSignup: false,
      showRecovery: false,
    });
  });

  it('WebAuthn нет (старый браузер, Telegram WebView): без кнопок passkey, recovery остаётся', () => {
    expect(resolvePasskeyVisibility(on, false)).toEqual({
      showLogin: false,
      showSignup: false,
      showRecovery: true,
    });
  });

  it('статус ещё не получен или не получен вовсе (старый бэк без ручки): всё скрыто', () => {
    const hidden = { showLogin: false, showSignup: false, showRecovery: false };
    expect(resolvePasskeyVisibility(undefined, true)).toEqual(hidden);
    expect(resolvePasskeyVisibility(null, true)).toEqual(hidden);
  });
});
