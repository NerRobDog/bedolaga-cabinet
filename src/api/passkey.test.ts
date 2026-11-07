import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Что уходит на бэк. Страницы мокают `@/api/passkey` целиком и путей не видят, а путь —
 * половина контракта: публичные ручки под /cabinet/auth/*, свои ключи под /cabinet/passkey.
 */

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('./client', () => ({ default: { get, post, patch, delete: del } }));

const CREDENTIAL = { id: 'AQI', rawId: 'AQI', type: 'public-key', response: {} };

beforeEach(() => {
  for (const fn of [get, post, patch, del]) fn.mockReset().mockResolvedValue({ data: { ok: 1 } });
});

describe('passkeyApi: публичные ручки', () => {
  it('status', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.getStatus();
    expect(get).toHaveBeenCalledWith('/cabinet/auth/passkey/status');
  });

  it('login: options без тела, verify с challenge_id и credential', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.loginOptions();
    await passkeyApi.loginVerify('chal-1', CREDENTIAL);

    expect(post).toHaveBeenNthCalledWith(1, '/cabinet/auth/passkey/login/options');
    expect(post).toHaveBeenNthCalledWith(2, '/cabinet/auth/passkey/login/verify', {
      challenge_id: 'chal-1',
      credential: CREDENTIAL,
    });
  });

  it('signup/options: имя обрезается, пустое имя не отправляется (бэк ответил бы 422)', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.signupOptions('  Ann  ');
    await passkeyApi.signupOptions('   ');
    await passkeyApi.signupOptions();

    expect(post).toHaveBeenNthCalledWith(1, '/cabinet/auth/passkey/signup/options', {
      display_name: 'Ann',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/cabinet/auth/passkey/signup/options', {});
    expect(post).toHaveBeenNthCalledWith(3, '/cabinet/auth/passkey/signup/options', {});
  });

  it('signup/verify: документы согласия, кампания и реферал; пустое не отправляется', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.signupVerify({
      challengeId: 'chal-2',
      credential: CREDENTIAL,
      acceptedLegalDocuments: ['public_offer', 'privacy_policy'],
      campaignSlug: 'spring',
      referralCode: 'REF1',
    });
    await passkeyApi.signupVerify({
      challengeId: 'chal-3',
      credential: CREDENTIAL,
      acceptedLegalDocuments: [],
      campaignSlug: null,
      referralCode: '',
    });

    expect(post).toHaveBeenNthCalledWith(1, '/cabinet/auth/passkey/signup/verify', {
      challenge_id: 'chal-2',
      credential: CREDENTIAL,
      accepted_legal_documents: ['public_offer', 'privacy_policy'],
      campaign_slug: 'spring',
      referral_code: 'REF1',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/cabinet/auth/passkey/signup/verify', {
      challenge_id: 'chal-3',
      credential: CREDENTIAL,
      accepted_legal_documents: undefined,
      campaign_slug: undefined,
      referral_code: undefined,
    });
  });

  it('recovery/login', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.recoveryLogin('ABCD-EFGH');
    expect(post).toHaveBeenCalledWith('/cabinet/auth/recovery/login', { code: 'ABCD-EFGH' });
  });
});

describe('passkeyApi: свои ключи и recovery-коды', () => {
  it('list / register', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.list();
    await passkeyApi.registerOptions();
    await passkeyApi.registerVerify('chal-4', CREDENTIAL, '  MacBook ');
    await passkeyApi.registerVerify('chal-5', CREDENTIAL);

    expect(get).toHaveBeenCalledWith('/cabinet/passkey');
    expect(post).toHaveBeenNthCalledWith(1, '/cabinet/passkey/register/options');
    expect(post).toHaveBeenNthCalledWith(2, '/cabinet/passkey/register/verify', {
      challenge_id: 'chal-4',
      credential: CREDENTIAL,
      name: 'MacBook',
    });
    expect(post).toHaveBeenNthCalledWith(3, '/cabinet/passkey/register/verify', {
      challenge_id: 'chal-5',
      credential: CREDENTIAL,
      name: undefined,
    });
  });

  it('rename / remove', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.rename(7, '  Work laptop ');
    await passkeyApi.remove(7);

    expect(patch).toHaveBeenCalledWith('/cabinet/passkey/7', { name: 'Work laptop' });
    expect(del).toHaveBeenCalledWith('/cabinet/passkey/7');
  });

  it('recovery-коды: статус и перевыпуск', async () => {
    const { passkeyApi } = await import('./passkey');
    await passkeyApi.getRecoveryCodesStatus();
    await passkeyApi.regenerateRecoveryCodes();

    expect(get).toHaveBeenCalledWith('/cabinet/passkey/recovery-codes');
    expect(post).toHaveBeenCalledWith('/cabinet/passkey/recovery-codes/regenerate');
  });
});
