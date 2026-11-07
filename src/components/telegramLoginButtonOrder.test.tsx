// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Порядок на экране входа: «через бота», затем passkey (afterBot), затем «через Telegram». */

const translation = vi.hoisted(() => ({
  t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
  i18n: { language: 'ru', changeLanguage: () => Promise.resolve() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => translation,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../store/auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      loginWithTelegramOIDC: vi.fn(),
      loginWithTelegramWidget: vi.fn(),
      loginWithDeepLink: vi.fn(),
    }),
}));
vi.mock('../api/branding', () => ({
  brandingApi: {
    getTelegramWidgetConfig: () =>
      Promise.resolve({
        bot_username: 'bot',
        oidc_enabled: true,
        oidc_client_id: '42',
        request_access: false,
        size: 'large',
        radius: 20,
        userpic: true,
      }),
  },
}));
vi.mock('../api/auth', () => ({ authApi: {} }));

afterEach(cleanup);

describe('TelegramLoginButton: порядок способов входа', () => {
  it('бот, затем блок afterBot, затем Telegram; заготовки «или» между ними', async () => {
    const { default: TelegramLoginButton } = await import('./TelegramLoginButton');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TelegramLoginButton afterBot={<button type="button">passkey-login</button>} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const bot = await screen.findByText('auth.loginWithBot');
    const passkey = screen.getByText('passkey-login');
    const telegram = await screen.findByText('auth.loginWithTelegram');
    const follows = (a: Node, b: Node) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(bot, passkey)).toBeTruthy();
    expect(follows(passkey, telegram)).toBeTruthy();
    expect(screen.queryByText('auth.orSendCommand')).toBeNull();
  });
});
