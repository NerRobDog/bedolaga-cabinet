// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  copy: vi.fn(),
  getLinked: vi.fn(),
  getOAuth: vi.fn(),
  listPasskeys: vi.fn(),
  availability: { status: { enabled: true, signup_enabled: false }, usable: true } as {
    status: { enabled: boolean; signup_enabled: boolean } | undefined;
    usable: boolean;
  },
  inTg: true,
  auth: { isAuthenticated: true, user: { id: 7, email: null } as unknown },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  useNavigate: () => h.navigate,
}));
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: h.copy }));
vi.mock('@/api/auth', () => ({
  authApi: { getLinkedProviders: h.getLinked, getOAuthProviders: h.getOAuth },
}));
vi.mock('@/api/passkey', () => ({ passkeyApi: { list: h.listPasskeys } }));
vi.mock('@/hooks/usePasskeyAvailability', () => ({
  usePasskeyAvailability: () => h.availability,
}));
vi.mock('@/hooks/useTelegramSDK', () => ({ isInTelegramWebApp: () => h.inTg }));
vi.mock('@/store/auth', () => ({
  useAuthStore: (sel: (s: typeof h.auth) => unknown) => sel(h.auth),
}));

import SecureAccessNudge, { SECURE_ACCESS_DISMISS_PREFIX } from './SecureAccessNudge';

const KEY = `${SECURE_ACCESS_DISMISS_PREFIX}7`;
const DAY = 24 * 60 * 60 * 1000;

function renderNudge() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SecureAccessNudge />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const telegramOnly = {
  providers: [
    { provider: 'telegram', linked: true, identifier: '1' },
    { provider: 'email', linked: false, identifier: null },
    { provider: 'google', linked: false, identifier: null },
  ],
};

describe('SecureAccessNudge', () => {
  beforeEach(() => {
    localStorage.clear();
    h.auth.isAuthenticated = true;
    h.inTg = false;
    h.auth.user = { id: 7, email: null };
    h.availability = { status: { enabled: true, signup_enabled: false }, usable: true };
    h.getLinked.mockResolvedValue(telegramOnly);
    h.getOAuth.mockResolvedValue({ providers: [{ name: 'google', display_name: 'Google' }] });
    h.listPasskeys.mockResolvedValue({ passkeys: [], limit: 5 });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows for a telegram-only user and navigates to accounts', async () => {
    renderNudge();
    expect(await screen.findByText('dashboard.secureAccess.title')).toBeTruthy();
    fireEvent.click(screen.getByText('dashboard.secureAccess.addPasskey'));
    expect(h.navigate).toHaveBeenCalledWith('/profile/accounts');
    fireEvent.click(screen.getByText('dashboard.secureAccess.linkGoogle'));
    expect(h.navigate).toHaveBeenCalledTimes(2);
  });

  it('hides when the user has a passkey', async () => {
    h.listPasskeys.mockResolvedValue({ passkeys: [{ id: 1 }], limit: 5 });
    renderNudge();
    await waitFor(() => expect(h.listPasskeys).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
  });

  it('hides when a non-telegram provider is linked', async () => {
    h.getLinked.mockResolvedValue({
      providers: [
        { provider: 'telegram', linked: true, identifier: '1' },
        { provider: 'google', linked: true, identifier: 'a' },
      ],
    });
    renderNudge();
    await waitFor(() => expect(h.getLinked).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
  });

  it('hides when the user has an email', async () => {
    h.auth.user = { id: 7, email: 'a@b.c' };
    renderNudge();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
  });

  it('hides when the backend offers nothing', async () => {
    h.availability = { status: { enabled: false, signup_enabled: false }, usable: true };
    h.getOAuth.mockResolvedValue({ providers: [] });
    renderNudge();
    await waitFor(() => expect(h.getOAuth).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
  });

  it('hides when not authenticated', async () => {
    h.auth.isAuthenticated = false;
    renderNudge();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
    expect(h.getLinked).not.toHaveBeenCalled();
  });

  it('hides within 14 days of dismissal and makes no requests', async () => {
    localStorage.setItem(KEY, String(Date.now() - 13 * DAY));
    renderNudge();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
    expect(h.getLinked).not.toHaveBeenCalled();
    expect(h.listPasskeys).not.toHaveBeenCalled();
  });

  it('shows again after 14 days', async () => {
    localStorage.setItem(KEY, String(Date.now() - 15 * DAY));
    renderNudge();
    expect(await screen.findByText('dashboard.secureAccess.title')).toBeTruthy();
  });

  it('dismiss stores a timestamp and hides the banner', async () => {
    renderNudge();
    await screen.findByText('dashboard.secureAccess.title');
    fireEvent.click(screen.getByLabelText('dashboard.secureAccess.dismiss'));
    expect(screen.queryByText('dashboard.secureAccess.title')).toBeNull();
    expect(Number(localStorage.getItem(KEY))).toBeGreaterThan(Date.now() - 5000);
  });

  it('Mini App: shows copy link instead of the passkey button', async () => {
    h.inTg = true;
    h.availability = { status: { enabled: true, signup_enabled: false }, usable: false };
    h.getOAuth.mockResolvedValue({ providers: [] });
    renderNudge();
    expect(await screen.findByText('dashboard.secureAccess.openInBrowser')).toBeTruthy();
    expect(screen.queryByText('dashboard.secureAccess.addPasskey')).toBeNull();
    fireEvent.click(screen.getByText('dashboard.secureAccess.copyLink'));
    expect(h.copy).toHaveBeenCalledWith(window.location.origin);
  });

  it('regular browser without a usable authenticator: only the Google button', async () => {
    h.availability = { status: { enabled: true, signup_enabled: false }, usable: false };
    renderNudge();
    expect(await screen.findByText('dashboard.secureAccess.linkGoogle')).toBeTruthy();
    expect(screen.queryByText('dashboard.secureAccess.addPasskey')).toBeNull();
    expect(screen.queryByText('dashboard.secureAccess.copyLink')).toBeNull();
    expect(screen.queryByText('dashboard.secureAccess.openInBrowser')).toBeNull();
  });
});
