// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getStatus: vi.fn(), supported: true, inTg: false }));
vi.mock('../api/passkey', () => ({ passkeyApi: { getStatus: h.getStatus } }));
vi.mock('../utils/webauthn', () => ({ isWebAuthnSupported: () => h.supported }));
vi.mock('./useTelegramSDK', () => ({ isInTelegramWebApp: () => h.inTg }));

import { usePasskeyAvailability } from './usePasskeyAvailability';

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePasskeyAvailability(), { wrapper });
}

function setPkc(value: unknown) {
  Object.defineProperty(window, 'PublicKeyCredential', { value, configurable: true });
}

describe('usePasskeyAvailability: authenticator check', () => {
  beforeEach(() => {
    h.supported = true;
    h.inTg = false;
    h.getStatus.mockResolvedValue({ enabled: true, signup_enabled: true });
  });
  afterEach(() => {
    vi.clearAllMocks();
    setPkc(undefined);
  });

  it('usable when a platform authenticator is available', async () => {
    setPkc({ isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true) });
    const { result } = run();
    await waitFor(() => expect(result.current.usable).toBe(true));
    expect(result.current.showLogin).toBe(true);
  });

  it('usable via conditional mediation when no platform authenticator', async () => {
    setPkc({
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(false),
      isConditionalMediationAvailable: () => Promise.resolve(true),
    });
    const { result } = run();
    await waitFor(() => expect(result.current.usable).toBe(true));
  });

  it('not usable when neither is available', async () => {
    setPkc({
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(false),
      isConditionalMediationAvailable: () => Promise.resolve(false),
    });
    const { result } = run();
    await waitFor(() => expect(result.current.status).toBeDefined());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.usable).toBe(false);
    expect(result.current.showLogin).toBe(false);
  });

  it('rejection is treated as not usable', async () => {
    setPkc({ isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.reject(new Error('x')) });
    const { result } = run();
    await waitFor(() => expect(result.current.status).toBeDefined());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.usable).toBe(false);
  });

  it('API missing keeps the old behaviour (usable at once)', () => {
    setPkc(function PublicKeyCredential() {});
    const { result } = run();
    expect(result.current.usable).toBe(true);
  });

  it('Telegram WebView stays unusable regardless', async () => {
    h.inTg = true;
    setPkc({ isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true) });
    const { result } = run();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.usable).toBe(false);
  });
});
