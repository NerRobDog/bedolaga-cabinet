// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Экран входа целиком: passkey-блок + экран резервных кодов + открытие сессии.
 * Главное: после создания аккаунта passkey сессия НЕ открывается, пока человек не подтвердил,
 * что сохранил коды; вход по резервному коду ведёт в настройки с подсказкой добавить passkey.
 */

const mocks = vi.hoisted(() => ({
  acceptAuthResponse: vi.fn(),
  navigate: vi.fn(),
  getStatus: vi.fn(),
  recoveryLogin: vi.fn(),
  signupVerify: vi.fn(),
  authenticateWithPasskey: vi.fn(),
  createSignupCredential: vi.fn(),
}));

vi.mock('../store/auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      isAuthenticated: false,
      isLoading: false,
      loginWithTelegram: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      acceptAuthResponse: mocks.acceptAuthResponse,
    }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'ru' },
  }),
}));
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../hooks/useTelegramSDK', () => ({
  isInTelegramWebApp: () => false,
  getTelegramInitData: () => '',
  useTelegramSDK: () => ({
    safeAreaInset: { top: 0, bottom: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0 },
  }),
}));
vi.mock('../components/LanguageSwitcher', () => ({ default: () => null }));
vi.mock('../components/TelegramLoginButton', () => ({
  // Как настоящая: блок passkey отдаётся ей в afterBot и рисуется под кнопкой «через бота».
  default: ({ afterBot }: { afterBot?: unknown }) => <>{afterBot}</>,
}));
vi.mock('../components/LegalFooter', () => ({ default: () => null }));
vi.mock('../api/branding', () => ({
  getCachedBranding: () => null,
  setCachedBranding: vi.fn(),
  preloadLogo: async () => {},
  isLogoPreloaded: () => false,
  brandingApi: {
    getLogoUrl: () => null,
    getBranding: async () => ({
      name: 'Test Cabinet',
      has_custom_logo: false,
      logo_letter: 'T',
      logo_url: null,
    }),
    getEmailAuthEnabled: async () => ({ enabled: true }),
    getFooterEnabled: async () => false,
  },
}));
vi.mock('../api/auth', () => ({ authApi: { getOAuthProviders: async () => ({ providers: [] }) } }));
vi.mock('../api/info', () => ({
  infoApi: {
    getLegalConsentConfig: async () => ({
      required: true,
      prechecked: false,
      documents: ['public_offer'],
    }),
  },
}));
vi.mock('../api/passkey', () => ({
  passkeyApi: {
    getStatus: mocks.getStatus,
    recoveryLogin: mocks.recoveryLogin,
    signupVerify: mocks.signupVerify,
  },
}));
vi.mock('../utils/passkeyCeremony', () => ({
  authenticateWithPasskey: mocks.authenticateWithPasskey,
  createSignupCredential: mocks.createSignupCredential,
}));
vi.mock('../utils/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/webauthn')>()),
  isWebAuthnSupported: () => true,
}));

import Login from './Login';

const CODES = ['ABCD-EFGH-JKMN-PQRS', '2345-6789-ABCD-EFGH'];
const AUTH = { access_token: 'a', refresh_token: 'r', user: { id: 1 } };

let client: QueryClient;

function renderLogin() {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.acceptAuthResponse.mockResolvedValue(undefined);
  mocks.getStatus.mockResolvedValue({ enabled: true, signup_enabled: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe('Login: аккаунт, созданный passkey', () => {
  async function signUp() {
    mocks.createSignupCredential.mockResolvedValue({ challengeId: 'c', credential: { id: 'x' } });
    mocks.signupVerify.mockResolvedValue({ ...AUTH, recovery_codes: CODES });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.signup.toggle' }));
    const consent = await screen.findAllByRole('checkbox');
    // Конфиг согласия приходит отдельным запросом; ждём галочку документа.
    await waitFor(() => expect(consent.length).toBeGreaterThan(0));
    fireEvent.click([...screen.getAllByRole('checkbox')].pop() as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'passkey.signup.submit' }));
  }

  it('показывает коды и не открывает сессию, пока нет подтверждения', async () => {
    await signUp();

    for (const code of CODES) expect(await screen.findByText(code)).toBeTruthy();
    expect(mocks.acceptAuthResponse).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'passkey.codes.continue' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('после подтверждения открывает сессию и уходит с экрана входа', async () => {
    await signUp();
    await screen.findByText(CODES[0]);

    fireEvent.click(screen.getByLabelText('passkey.codes.ack'));
    fireEvent.click(screen.getByRole('button', { name: 'passkey.codes.continue' }));

    await waitFor(() => expect(mocks.acceptAuthResponse).toHaveBeenCalledTimes(1));
    expect(mocks.acceptAuthResponse.mock.calls[0][0]).toMatchObject({ access_token: 'a' });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('коды не попадают в хранилища браузера', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await signUp();
    await screen.findByText(CODES[0]);

    const written = setItem.mock.calls.map(([key, value]) => `${key}=${value}`).join('\n');
    for (const code of CODES) expect(written).not.toContain(code);
    setItem.mockRestore();
  });
});

describe('Login: вход по резервному коду', () => {
  it('открывает сессию и ведёт в настройки passkey с флагом recoveryLogin', async () => {
    mocks.recoveryLogin.mockResolvedValue({ ...AUTH, recovery_login: true });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.recovery.toggle' }));
    fireEvent.change(screen.getByLabelText('passkey.recovery.label'), {
      target: { value: 'ABCD-EFGH-JKMN-PQRS' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'passkey.recovery.submit' }));

    await waitFor(() => expect(mocks.acceptAuthResponse).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/profile/accounts', {
        replace: true,
        state: { recoveryLogin: true },
      }),
    );
  });
});

describe('Login: вход по passkey', () => {
  it('открывает сессию и возвращает на исходную страницу', async () => {
    mocks.authenticateWithPasskey.mockResolvedValue(AUTH);
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: 'passkey.login.button' }));

    await waitFor(() => expect(mocks.acceptAuthResponse).toHaveBeenCalledWith(AUTH));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true }));
  });
});
