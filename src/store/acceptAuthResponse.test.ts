// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse, User } from '../types';

/**
 * Вход по passkey и по recovery-коду приносит готовый AuthResponse. Стор принимает его одним
 * действием; для аккаунта, созданного ключом, сессию открывают только ПОСЛЕ экрана с кодами,
 * поэтому до вызова acceptAuthResponse стор остаётся «не залогинен».
 */

const USER = { id: 7, first_name: 'Ann', auth_type: 'passkey' } as unknown as User;

function authResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    token_type: 'bearer',
    expires_in: 900,
    user: USER,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('acceptAuthResponse', () => {
  it('сохраняет токены и открывает сессию', async () => {
    const { useAuthStore } = await import('./auth');
    const { tokenStorage } = await import('../utils/token');

    await useAuthStore.getState().acceptAuthResponse(authResponse());

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(USER);
    expect(state.accessToken).toBe('access-1');
    expect(tokenStorage.getRefreshToken()).toBe('refresh-1');
  });

  it('кладёт бонус кампании, если бэк его вернул', async () => {
    const { useAuthStore } = await import('./auth');
    const bonus = {
      campaign_name: 'spring',
      bonus_type: 'balance',
      balance_kopeks: 100,
      subscription_days: null,
      tariff_name: null,
    } as const;

    await useAuthStore.getState().acceptAuthResponse(authResponse({ campaign_bonus: bonus }));

    expect(useAuthStore.getState().pendingCampaignBonus).toEqual(bonus);
  });

  it('ответ без токенов — исключение, сессия не открывается', async () => {
    const { useAuthStore } = await import('./auth');

    await expect(
      useAuthStore.getState().acceptAuthResponse(authResponse({ access_token: '' })),
    ).rejects.toThrow('missing tokens');

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
