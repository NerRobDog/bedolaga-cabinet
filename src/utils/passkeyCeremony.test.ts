import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Порядок церемоний: options с бэка -> браузер -> verify с тем же challenge_id.
 * Ошибка браузера (отказ) не должна доходить до verify: challenge тратится при любой попытке
 * verify, а отменённая церемония проверять нечего.
 */

const { passkeyApi, createPasskeyCredential, getPasskeyCredential } = vi.hoisted(() => ({
  passkeyApi: {
    loginOptions: vi.fn(),
    loginVerify: vi.fn(),
    signupOptions: vi.fn(),
    registerOptions: vi.fn(),
    registerVerify: vi.fn(),
  },
  createPasskeyCredential: vi.fn(),
  getPasskeyCredential: vi.fn(),
}));

vi.mock('../api/passkey', () => ({ passkeyApi }));
vi.mock('./webauthn', () => ({ createPasskeyCredential, getPasskeyCredential }));

import {
  authenticateWithPasskey,
  createSignupCredential,
  registerPasskey,
} from './passkeyCeremony';

const OPTIONS = { challenge: 'abc' };
const CREDENTIAL = { id: 'cred', response: {} };

beforeEach(() => {
  for (const fn of [...Object.values(passkeyApi), createPasskeyCredential, getPasskeyCredential]) {
    fn.mockReset();
  }
});

describe('authenticateWithPasskey', () => {
  it('options -> get -> verify с тем же challenge_id', async () => {
    const auth = { access_token: 'a', refresh_token: 'r' };
    passkeyApi.loginOptions.mockResolvedValue({ challenge_id: 'chal', options: OPTIONS });
    getPasskeyCredential.mockResolvedValue(CREDENTIAL);
    passkeyApi.loginVerify.mockResolvedValue(auth);

    await expect(authenticateWithPasskey()).resolves.toBe(auth);

    expect(getPasskeyCredential).toHaveBeenCalledWith(OPTIONS, undefined);
    expect(passkeyApi.loginVerify).toHaveBeenCalledWith('chal', CREDENTIAL);
  });

  it('отказ пользователя в браузере: verify не вызывается', async () => {
    passkeyApi.loginOptions.mockResolvedValue({ challenge_id: 'chal', options: OPTIONS });
    getPasskeyCredential.mockRejectedValue(new Error('cancelled'));

    await expect(authenticateWithPasskey()).rejects.toThrow('cancelled');
    expect(passkeyApi.loginVerify).not.toHaveBeenCalled();
  });
});

describe('createSignupCredential', () => {
  it('создаёт ключ, но verify не зовёт: на 428 его повторяют с тем же ответом аутентификатора', async () => {
    passkeyApi.signupOptions.mockResolvedValue({ challenge_id: 'chal-s', options: OPTIONS });
    createPasskeyCredential.mockResolvedValue(CREDENTIAL);

    await expect(createSignupCredential('Ann')).resolves.toEqual({
      challengeId: 'chal-s',
      credential: CREDENTIAL,
    });
    expect(passkeyApi.signupOptions).toHaveBeenCalledWith('Ann');
  });
});

describe('registerPasskey', () => {
  it('options -> create -> verify с названием', async () => {
    const created = { id: 5, name: 'MacBook' };
    passkeyApi.registerOptions.mockResolvedValue({ challenge_id: 'chal-r', options: OPTIONS });
    createPasskeyCredential.mockResolvedValue(CREDENTIAL);
    passkeyApi.registerVerify.mockResolvedValue(created);

    await expect(registerPasskey('MacBook')).resolves.toBe(created);
    expect(passkeyApi.registerVerify).toHaveBeenCalledWith('chal-r', CREDENTIAL, 'MacBook');
  });

  it('ошибка церемонии не доходит до verify', async () => {
    passkeyApi.registerOptions.mockResolvedValue({ challenge_id: 'chal-r', options: OPTIONS });
    createPasskeyCredential.mockRejectedValue(new Error('boom'));

    await expect(registerPasskey()).rejects.toThrow('boom');
    expect(passkeyApi.registerVerify).not.toHaveBeenCalled();
  });
});
