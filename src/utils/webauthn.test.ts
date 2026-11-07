// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PasskeyCeremonyError,
  base64urlToBuffer,
  bufferToBase64url,
  classifyCeremonyError,
  createPasskeyCredential,
  getPasskeyCredential,
  isWebAuthnSupported,
  parseCreationOptions,
  parseRequestOptions,
  serializeAuthenticationCredential,
  serializeRegistrationCredential,
} from './webauthn';

/**
 * Форма options — ровно та, что отдаёт py_webauthn (`options_to_json_dict`):
 * бинарные поля (challenge, user.id, id в excludeCredentials) — base64url без паддинга.
 */
const CREATION_OPTIONS = {
  rp: { name: 'Cabinet', id: 'example.com' },
  user: { id: 'YWJj', name: 'passkey-a1b2c3', displayName: 'Ann' },
  challenge:
    'iqkHgxFFq1IqHx5rFXJ-7pJhTlEhOhMowsiHmn-Iqfdr9MeQVHLA2obn6fTRerNLw3co5iLqWECox2iDn1WNwQ',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 120000,
  excludeCredentials: [{ id: 'Y3JlZDE', type: 'public-key', transports: ['internal'] }],
  authenticatorSelection: {
    residentKey: 'required',
    requireResidentKey: true,
    userVerification: 'required',
  },
  attestation: 'none',
};

const REQUEST_OPTIONS = {
  challenge:
    'vH-4-cqk9CJs6jJWwYIlcqdongRkjWES7t_GATg9aYiZd3vZyMa-UiYu1dDVuhGhqPmf_iO6WKICunzVXNKPGA',
  timeout: 120000,
  rpId: 'example.com',
  allowCredentials: [],
  userVerification: 'required',
};

function bytes(value: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(value));
}

function buffer(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(window, name, { value, configurable: true, writable: true });
}

function removeGlobal(name: string): void {
  Reflect.deleteProperty(window, name);
}

afterEach(() => {
  removeGlobal('PublicKeyCredential');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('base64url', () => {
  it('кодирует без паддинга и с url-безопасным алфавитом', () => {
    expect(bufferToBase64url(buffer(0xfb, 0xff, 0xfe))).toBe('-__-');
    expect(bufferToBase64url(buffer(1, 2))).toBe('AQI');
    expect(bufferToBase64url(new ArrayBuffer(0))).toBe('');
  });

  it('принимает и ArrayBuffer, и view с ненулевым смещением', () => {
    const view = new Uint8Array([9, 1, 2, 9]).subarray(1, 3);
    expect(bufferToBase64url(view)).toBe('AQI');
  });

  it('декодирует то же самое, что закодировал', () => {
    const original = [0, 1, 2, 250, 251, 252, 253, 254, 255];
    expect(bytes(base64urlToBuffer(bufferToBase64url(buffer(...original))))).toEqual(original);
  });

  it('декодирует вход py_webauthn (без паддинга)', () => {
    expect(bytes(base64urlToBuffer('Y3JlZDE'))).toEqual([...'cred1'].map((c) => c.charCodeAt(0)));
  });

  it('принимает и классический base64 с паддингом', () => {
    expect(bytes(base64urlToBuffer('AQI='))).toEqual([1, 2]);
  });

  it('падает на мусоре, а не отдаёт пустой буфер', () => {
    expect(() => base64urlToBuffer('***')).toThrow();
  });
});

describe('isWebAuthnSupported', () => {
  beforeEach(() => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { credentials: { create: vi.fn(), get: vi.fn() } });
  });

  it('false без PublicKeyCredential', () => {
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('true при PublicKeyCredential и credentials.create/get в защищённом контексте', () => {
    setGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    expect(isWebAuthnSupported()).toBe(true);
  });

  it('false вне защищённого контекста', () => {
    setGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('isSecureContext', false);
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('false, если navigator.credentials нет (часть встроенных WebView)', () => {
    setGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', {});
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('false, если обращение к navigator.credentials бросает', () => {
    setGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', {
      get credentials(): never {
        throw new Error('blocked');
      },
    });
    expect(isWebAuthnSupported()).toBe(false);
  });
});

describe('parseCreationOptions', () => {
  it('без нативного парсера декодирует challenge, user.id и excludeCredentials[].id', () => {
    const parsed = parseCreationOptions(CREATION_OPTIONS);

    expect(bytes(parsed.challenge as ArrayBuffer)).toHaveLength(64);
    expect(bytes(parsed.user.id as ArrayBuffer)).toEqual([97, 98, 99]);
    expect(bytes(parsed.excludeCredentials?.[0]?.id as ArrayBuffer)).toEqual(
      [...'cred1'].map((c) => c.charCodeAt(0)),
    );
    expect(parsed.excludeCredentials?.[0]?.transports).toEqual(['internal']);
    expect(parsed.rp).toEqual(CREATION_OPTIONS.rp);
    expect(parsed.authenticatorSelection).toEqual(CREATION_OPTIONS.authenticatorSelection);
    expect(parsed.attestation).toBe('none');
    expect(parsed.timeout).toBe(120000);
  });

  it('не мутирует исходный объект', () => {
    const snapshot = JSON.stringify(CREATION_OPTIONS);
    parseCreationOptions(CREATION_OPTIONS);
    expect(JSON.stringify(CREATION_OPTIONS)).toBe(snapshot);
  });

  it('options без excludeCredentials не ломают разбор', () => {
    const { excludeCredentials: _omit, ...rest } = CREATION_OPTIONS;
    expect(parseCreationOptions(rest).excludeCredentials ?? []).toEqual([]);
  });

  it('использует нативный parseCreationOptionsFromJSON, когда он есть', () => {
    const native = { challenge: new ArrayBuffer(1), marker: 'native' };
    const parse = vi.fn(() => native);
    setGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: parse });

    expect(parseCreationOptions(CREATION_OPTIONS)).toBe(native);
    expect(parse).toHaveBeenCalledWith(CREATION_OPTIONS);
  });
});

describe('parseRequestOptions', () => {
  it('декодирует challenge; пустой allowCredentials остаётся пустым (discoverable)', () => {
    const parsed = parseRequestOptions(REQUEST_OPTIONS);

    expect(bytes(parsed.challenge as ArrayBuffer)).toHaveLength(64);
    expect(parsed.allowCredentials).toEqual([]);
    expect(parsed.rpId).toBe('example.com');
    expect(parsed.userVerification).toBe('required');
  });

  it('декодирует id в allowCredentials', () => {
    const parsed = parseRequestOptions({
      ...REQUEST_OPTIONS,
      allowCredentials: [{ id: 'AQI', type: 'public-key' }],
    });
    expect(bytes(parsed.allowCredentials?.[0]?.id as ArrayBuffer)).toEqual([1, 2]);
  });

  it('использует нативный parseRequestOptionsFromJSON, когда он есть', () => {
    const native = { challenge: new ArrayBuffer(1) };
    const parse = vi.fn(() => native);
    setGlobal('PublicKeyCredential', { parseRequestOptionsFromJSON: parse });

    expect(parseRequestOptions(REQUEST_OPTIONS)).toBe(native);
  });
});

describe('serialize*Credential', () => {
  function registrationCredential(extra: Record<string, unknown> = {}) {
    return {
      id: 'AQI',
      rawId: buffer(1, 2),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buffer(0xfb, 0xff),
        attestationObject: buffer(3, 4),
        getTransports: () => ['internal', 'hybrid'],
      },
      ...extra,
    } as unknown as PublicKeyCredential;
  }

  it('регистрация: ручная сериализация, если toJSON нет', () => {
    expect(serializeRegistrationCredential(registrationCredential())).toEqual({
      id: 'AQI',
      rawId: 'AQI',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: '-_8',
        attestationObject: 'AwQ',
        transports: ['internal', 'hybrid'],
      },
    });
  });

  it('регистрация: transports опускается, если getTransports нет', () => {
    const credential = registrationCredential();
    (credential.response as unknown as Record<string, unknown>).getTransports = undefined;
    const json = serializeRegistrationCredential(credential);
    expect(json.response).not.toHaveProperty('transports');
  });

  it('регистрация: предпочитает нативный toJSON', () => {
    const toJSON = vi.fn(() => ({ id: 'native' }));
    expect(serializeRegistrationCredential(registrationCredential({ toJSON }))).toEqual({
      id: 'native',
    });
  });

  function authenticationCredential(userHandle: ArrayBuffer | null) {
    return {
      id: 'AQI',
      rawId: buffer(1, 2),
      type: 'public-key',
      authenticatorAttachment: null,
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buffer(5),
        authenticatorData: buffer(6, 7),
        signature: buffer(8),
        userHandle,
      },
    } as unknown as PublicKeyCredential;
  }

  it('вход: сериализует подпись и userHandle', () => {
    expect(serializeAuthenticationCredential(authenticationCredential(buffer(97, 98, 99)))).toEqual(
      {
        id: 'AQI',
        rawId: 'AQI',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: 'BQ',
          authenticatorData: 'Bgc',
          signature: 'CA',
          userHandle: 'YWJj',
        },
      },
    );
  });

  it('вход: пустой userHandle не попадает в JSON', () => {
    const json = serializeAuthenticationCredential(authenticationCredential(null));
    expect(json.response).not.toHaveProperty('userHandle');
  });
});

describe('classifyCeremonyError', () => {
  const named = (name: string) => new DOMException('boom', name);

  it('отмена и таймаут — cancelled (показывать ошибку не надо)', () => {
    expect(classifyCeremonyError(named('NotAllowedError'))).toBe('cancelled');
    expect(classifyCeremonyError(named('AbortError'))).toBe('cancelled');
  });

  it('InvalidStateError — ключ для этого аккаунта на устройстве уже есть', () => {
    expect(classifyCeremonyError(named('InvalidStateError'))).toBe('already_registered');
  });

  it('NotSupportedError и SecurityError — passkey здесь недоступен', () => {
    expect(classifyCeremonyError(named('NotSupportedError'))).toBe('unsupported');
    expect(classifyCeremonyError(named('SecurityError'))).toBe('unsupported');
  });

  it('прочее — unknown', () => {
    expect(classifyCeremonyError(named('UnknownError'))).toBe('unknown');
    expect(classifyCeremonyError(new Error('x'))).toBe('unknown');
    expect(classifyCeremonyError('x')).toBe('unknown');
  });
});

describe('createPasskeyCredential / getPasskeyCredential', () => {
  const credentials = { create: vi.fn(), get: vi.fn() };

  beforeEach(() => {
    credentials.create.mockReset();
    credentials.get.mockReset();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { credentials });
    setGlobal('PublicKeyCredential', function PublicKeyCredential() {});
  });

  it('create: отдаёт в браузер разобранные options и возвращает JSON ответа', async () => {
    credentials.create.mockResolvedValue({
      id: 'AQI',
      rawId: buffer(1, 2),
      type: 'public-key',
      toJSON: () => ({ id: 'AQI', marker: 'json' }),
    });

    const result = await createPasskeyCredential(CREATION_OPTIONS);

    expect(result).toEqual({ id: 'AQI', marker: 'json' });
    const call = credentials.create.mock.calls[0][0];
    expect(bytes(call.publicKey.user.id)).toEqual([97, 98, 99]);
  });

  it('get: возвращает JSON утверждения', async () => {
    credentials.get.mockResolvedValue({ toJSON: () => ({ id: 'AQI', marker: 'assertion' }) });
    await expect(getPasskeyCredential(REQUEST_OPTIONS)).resolves.toEqual({
      id: 'AQI',
      marker: 'assertion',
    });
  });

  it('пользователь отказался: cancelled, не unknown', async () => {
    credentials.get.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await expect(getPasskeyCredential(REQUEST_OPTIONS)).rejects.toMatchObject({
      name: 'PasskeyCeremonyError',
      kind: 'cancelled',
    });
  });

  it('браузер вернул null: тоже cancelled', async () => {
    credentials.create.mockResolvedValue(null);
    await expect(createPasskeyCredential(CREATION_OPTIONS)).rejects.toBeInstanceOf(
      PasskeyCeremonyError,
    );
  });

  it('без поддержки WebAuthn падает unsupported ДО обращения к браузеру', async () => {
    removeGlobal('PublicKeyCredential');
    await expect(getPasskeyCredential(REQUEST_OPTIONS)).rejects.toMatchObject({
      kind: 'unsupported',
    });
    expect(credentials.get).not.toHaveBeenCalled();
  });

  it('битые options (не base64url) — unknown, а не необработанное исключение', async () => {
    await expect(
      getPasskeyCredential({ ...REQUEST_OPTIONS, challenge: '***' }),
    ).rejects.toMatchObject({ kind: 'unknown' });
  });
});
