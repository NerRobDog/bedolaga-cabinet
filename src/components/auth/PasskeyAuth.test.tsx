// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { CONSENT_DOCUMENTS, consentRequiredError } from '../../test/consentRequiredError';

/**
 * Блок passkey на экране входа: что видно при разных ответах бэка и браузера, и что уходит
 * странице. Страница сессию не получает, пока блок не отдал ответ бэка.
 */

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  recoveryLogin: vi.fn(),
  signupVerify: vi.fn(),
  authenticateWithPasskey: vi.fn(),
  createSignupCredential: vi.fn(),
  isWebAuthnSupported: vi.fn(),
  isInTelegramWebApp: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'ru' },
  }),
}));

vi.mock('../../api/passkey', () => ({
  passkeyApi: {
    getStatus: mocks.getStatus,
    recoveryLogin: mocks.recoveryLogin,
    signupVerify: mocks.signupVerify,
  },
}));
vi.mock('../../utils/passkeyCeremony', () => ({
  authenticateWithPasskey: mocks.authenticateWithPasskey,
  createSignupCredential: mocks.createSignupCredential,
}));
vi.mock('../../utils/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/webauthn')>()),
  isWebAuthnSupported: mocks.isWebAuthnSupported,
}));
vi.mock('../../hooks/useTelegramSDK', () => ({ isInTelegramWebApp: mocks.isInTelegramWebApp }));

import { useLegalConsentGate } from '../../hooks/useLegalConsentGate';
import { PasskeyCeremonyError } from '../../utils/webauthn';
import LegalConsentGate from '../LegalConsentGate';
import PasskeyAuth from './PasskeyAuth';

const AUTH = { access_token: 'a', refresh_token: 'r', user: { id: 1 } };
const SIGNUP = { ...AUTH, recovery_codes: ['AAAA-BBBB-CCCC-DDDD'] };
const CREDENTIAL = { id: 'cred', response: {} };
const CREATED = { challengeId: 'chal', credential: CREDENTIAL };

function axiosError(status: number, detail: unknown): AxiosError {
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

const handlers = {
  onAuthenticated: vi.fn(),
  onRecoveryLogin: vi.fn(),
  onSignedUp: vi.fn(),
};

/** Как на странице входа: гейт согласия общий, на 428 страница рисует экран галочек. */
function Harness() {
  const consent = useLegalConsentGate({
    required: true,
    prechecked: false,
    documents: CONSENT_DOCUMENTS,
  });
  if (consent.pending) return <LegalConsentGate gate={consent} />;
  return <PasskeyAuth {...handlers} consent={consent} />;
}

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

function setStatus(enabled: boolean, signup: boolean) {
  mocks.getStatus.mockResolvedValue({ enabled, signup_enabled: signup });
}

beforeEach(() => {
  for (const fn of Object.values({ ...mocks, ...handlers })) fn.mockReset();
  mocks.isWebAuthnSupported.mockReturnValue(true);
  mocks.isInTelegramWebApp.mockReturnValue(false);
  setStatus(true, true);
});

afterEach(() => {
  cleanup();
});

const loginButton = () => screen.queryByRole('button', { name: 'passkey.login.button' });
const signupToggle = () => screen.queryByRole('button', { name: 'passkey.signup.toggle' });
const recoveryToggle = () => screen.queryByRole('button', { name: 'passkey.recovery.toggle' });

describe('видимость', () => {
  it('включено всё: вход, регистрация и recovery', async () => {
    renderBlock();
    expect(await screen.findByRole('button', { name: 'passkey.login.button' })).toBeTruthy();
    expect(signupToggle()).toBeTruthy();
    expect(recoveryToggle()).toBeTruthy();
  });

  it('регистрация закрыта: кнопки «Создать аккаунт» нет', async () => {
    setStatus(true, false);
    renderBlock();
    await screen.findByRole('button', { name: 'passkey.login.button' });
    expect(signupToggle()).toBeNull();
    expect(recoveryToggle()).toBeTruthy();
  });

  it('passkey выключен на бэке: блок не рисуется вовсе', async () => {
    setStatus(false, false);
    const { container } = renderBlock();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(container.querySelector('[data-testid="passkey-auth"]')).toBeNull();
  });

  it('старый бэк без ручки статуса (404): блок не рисуется, страница не падает', async () => {
    mocks.getStatus.mockRejectedValue(axiosError(404, 'Not Found'));
    const { container } = renderBlock();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(container.querySelector('[data-testid="passkey-auth"]')).toBeNull();
  });

  it('WebAuthn не поддерживается: кнопок passkey нет, форма резервного кода осталась', async () => {
    mocks.isWebAuthnSupported.mockReturnValue(false);
    renderBlock();
    expect(await screen.findByRole('button', { name: 'passkey.recovery.toggle' })).toBeTruthy();
    expect(loginButton()).toBeNull();
    expect(signupToggle()).toBeNull();
  });

  it('Telegram WebView: то же, что без WebAuthn', async () => {
    mocks.isInTelegramWebApp.mockReturnValue(true);
    renderBlock();
    expect(await screen.findByRole('button', { name: 'passkey.recovery.toggle' })).toBeTruthy();
    expect(loginButton()).toBeNull();
    expect(signupToggle()).toBeNull();
  });
});

describe('вход по passkey', () => {
  it('отдаёт ответ бэка странице', async () => {
    mocks.authenticateWithPasskey.mockResolvedValue(AUTH);
    renderBlock();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.login.button' }));

    await waitFor(() => expect(handlers.onAuthenticated).toHaveBeenCalledWith(AUTH));
  });

  it('пользователь закрыл окно passkey: никакой ошибки, кнопка снова доступна', async () => {
    mocks.authenticateWithPasskey.mockRejectedValue(new PasskeyCeremonyError('cancelled'));
    renderBlock();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.login.button' }));

    await waitFor(() => expect(mocks.authenticateWithPasskey).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect((loginButton() as HTMLButtonElement).disabled).toBe(false);
    expect(handlers.onAuthenticated).not.toHaveBeenCalled();
  });

  it('ключ не принят бэком (401): понятное сообщение', async () => {
    mocks.authenticateWithPasskey.mockRejectedValue(
      axiosError(401, 'Passkey authentication failed'),
    );
    renderBlock();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.login.button' }));

    expect((await screen.findByRole('alert')).textContent).toBe('passkey.login.failed');
  });

  it('браузер отказал (SecurityError): сообщение «недоступно здесь», не падение', async () => {
    mocks.authenticateWithPasskey.mockRejectedValue(new PasskeyCeremonyError('unsupported'));
    renderBlock();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.login.button' }));

    expect((await screen.findByRole('alert')).textContent).toBe('passkey.errors.unsupported');
  });
});

describe('вход по резервному коду', () => {
  async function openRecovery() {
    fireEvent.click(await screen.findByRole('button', { name: 'passkey.recovery.toggle' }));
    return screen.getByLabelText('passkey.recovery.label') as HTMLInputElement;
  }

  it('отправляет код как введён (обрезав пробелы) и отдаёт ответ странице', async () => {
    const response = { ...AUTH, recovery_login: true };
    mocks.recoveryLogin.mockResolvedValue(response);
    renderBlock();

    const input = await openRecovery();
    fireEvent.change(input, { target: { value: '  abcd-efgh-jkmn-pqrs ' } });
    fireEvent.click(screen.getByRole('button', { name: 'passkey.recovery.submit' }));

    await waitFor(() => expect(handlers.onRecoveryLogin).toHaveBeenCalledWith(response));
    expect(mocks.recoveryLogin).toHaveBeenCalledWith('abcd-efgh-jkmn-pqrs');
  });

  it('пустое поле: подсказка, запроса нет', async () => {
    renderBlock();
    await openRecovery();

    fireEvent.click(screen.getByRole('button', { name: 'passkey.recovery.submit' }));

    expect((await screen.findByRole('alert')).textContent).toBe('passkey.recovery.empty');
    expect(mocks.recoveryLogin).not.toHaveBeenCalled();
  });

  it('401: «код не подошёл», введённый код остаётся для правки', async () => {
    mocks.recoveryLogin.mockRejectedValue(axiosError(401, 'Recovery code is invalid'));
    renderBlock();
    const input = await openRecovery();
    fireEvent.change(input, { target: { value: 'WRONG' } });

    fireEvent.click(screen.getByRole('button', { name: 'passkey.recovery.submit' }));

    expect((await screen.findByRole('alert')).textContent).toBe('passkey.recovery.invalid');
    expect(input.value).toBe('WRONG');
  });

  it('форма доступна и без WebAuthn', async () => {
    mocks.isWebAuthnSupported.mockReturnValue(false);
    renderBlock();
    expect(await openRecovery()).toBeTruthy();
  });
});

describe('создание аккаунта с passkey', () => {
  async function openSignup() {
    fireEvent.click(await screen.findByRole('button', { name: 'passkey.signup.toggle' }));
  }
  const submit = () =>
    screen.getByRole('button', { name: 'passkey.signup.submit' }) as HTMLButtonElement;

  it('«Создать» закрыто, пока не отмечены документы', async () => {
    renderBlock();
    await openSignup();

    expect(submit().disabled).toBe(true);
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    expect(submit().disabled).toBe(false);
  });

  it('создаёт ключ с именем, шлёт verify с документами и отдаёт ответ с кодами странице', async () => {
    mocks.createSignupCredential.mockResolvedValue(CREATED);
    mocks.signupVerify.mockResolvedValue(SIGNUP);
    renderBlock();
    await openSignup();
    fireEvent.change(screen.getByLabelText('passkey.signup.displayName'), {
      target: { value: 'Ann' },
    });
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);

    fireEvent.click(submit());

    await waitFor(() => expect(handlers.onSignedUp).toHaveBeenCalledWith(SIGNUP));
    expect(mocks.createSignupCredential).toHaveBeenCalledWith('Ann', expect.any(AbortSignal));
    expect(mocks.signupVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'chal',
        credential: CREDENTIAL,
        acceptedLegalDocuments: CONSENT_DOCUMENTS,
      }),
    );
  });

  it('отмена окна создания ключа: ошибки нет, verify не вызывается', async () => {
    mocks.createSignupCredential.mockRejectedValue(new PasskeyCeremonyError('cancelled'));
    renderBlock();
    await openSignup();
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);

    fireEvent.click(submit());

    await waitFor(() => expect(mocks.createSignupCredential).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.signupVerify).not.toHaveBeenCalled();
  });

  it('428 на verify: экран согласия и повтор с ТЕМ ЖЕ ключом, без второго создания', async () => {
    mocks.createSignupCredential.mockResolvedValue(CREATED);
    mocks.signupVerify.mockRejectedValueOnce(consentRequiredError()).mockResolvedValueOnce(SIGNUP);
    renderBlock();
    await openSignup();
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(submit());

    // Страница показала экран согласия вместо падения.
    const confirm = await screen.findByRole('button', { name: 'Продолжить' });
    for (const box of screen.getAllByRole('checkbox')) {
      if (!(box as HTMLInputElement).checked) fireEvent.click(box);
    }
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(handlers.onSignedUp).toHaveBeenCalledWith(SIGNUP));
    expect(mocks.createSignupCredential).toHaveBeenCalledTimes(1);
    expect(mocks.signupVerify).toHaveBeenCalledTimes(2);
    expect(mocks.signupVerify.mock.calls[1][0]).toEqual(
      expect.objectContaining({ challengeId: 'chal', credential: CREDENTIAL }),
    );
  });

  it('регистрация только по приглашению (403): читаемое сообщение', async () => {
    mocks.createSignupCredential.mockResolvedValue(CREATED);
    mocks.signupVerify.mockRejectedValue(axiosError(403, { code: 'registration_invite_required' }));
    renderBlock();
    await openSignup();
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);

    fireEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toBe('auth.registrationInviteRequired');
  });
});
