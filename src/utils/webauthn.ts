/**
 * Тонкая обёртка над нативным WebAuthn (`navigator.credentials`) для passkey.
 *
 * Бэк отдаёт options в WebAuthn-JSON (py_webauthn `options_to_json_dict`): бинарные
 * поля — base64url без паддинга. Браузер ждёт ArrayBuffer, а в ответ мы шлём JSON,
 * поэтому здесь две конвертации. Современные браузеры умеют их сами
 * (`PublicKeyCredential.parseCreationOptionsFromJSON` / `credential.toJSON()`),
 * старые и часть встроенных WebView — нет: для них есть ручной путь с тем же результатом.
 *
 * Модуль не знает ни про React, ни про HTTP.
 */

/** Options в том виде, в каком их отдаёт бэк. */
export type PasskeyOptionsJSON = Record<string, unknown>;

/** Ответ аутентификатора в WebAuthn-JSON: его бэк разбирает py_webauthn. */
export interface CredentialJSON {
  id: string;
  rawId?: string;
  type?: string;
  response?: Record<string, unknown>;
  [key: string]: unknown;
}

export type PasskeyCeremonyErrorKind =
  | 'cancelled'
  | 'unsupported'
  | 'already_registered'
  | 'unknown';

/**
 * Любая неудача церемонии (браузер отказал, passkey недоступен, options битые) приходит
 * сюда с понятным `kind`: экран решает, что показать, и не разбирает DOMException сам.
 */
export class PasskeyCeremonyError extends Error {
  readonly kind: PasskeyCeremonyErrorKind;
  readonly cause?: unknown;

  constructor(kind: PasskeyCeremonyErrorKind, cause?: unknown) {
    super(`Passkey ceremony failed: ${kind}`);
    this.name = 'PasskeyCeremonyError';
    this.kind = kind;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// base64url <-> ArrayBuffer
// ---------------------------------------------------------------------------

const BASE64_BODY = /^[A-Za-z0-9+/]*$/;

export function bufferToBase64url(value: ArrayBuffer | ArrayBufferView): string {
  const view =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Принимает base64url (с паддингом или без) и классический base64. Мусор — исключение. */
export function base64urlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!BASE64_BODY.test(normalized) || normalized.length % 4 === 1) {
    throw new TypeError('Value is not base64url');
  }
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

// ---------------------------------------------------------------------------
// Возможности браузера
// ---------------------------------------------------------------------------

interface PublicKeyCredentialStatics {
  parseCreationOptionsFromJSON?: (
    options: PasskeyOptionsJSON,
  ) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (options: PasskeyOptionsJSON) => PublicKeyCredentialRequestOptions;
}

function publicKeyCredentialStatics(): PublicKeyCredentialStatics | undefined {
  return (window as unknown as { PublicKeyCredential?: PublicKeyCredentialStatics })
    .PublicKeyCredential;
}

/**
 * Есть ли у браузера WebAuthn. Только проверка возможностей: ни одного вызова
 * `credentials.create/get`, поэтому безопасна на каждом рендере. Любое исключение
 * (заблокированный `navigator.credentials` во встроенных WebView) — «нет поддержки».
 */
export function isWebAuthnSupported(): boolean {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (!window.isSecureContext) return false;
    if (typeof window.PublicKeyCredential === 'undefined') return false;
    const credentials = navigator.credentials;
    return typeof credentials?.create === 'function' && typeof credentials?.get === 'function';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JSON options -> options для браузера
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function decodeDescriptors(list: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((item: JsonRecord) => ({
    ...item,
    id: base64urlToBuffer(String(item.id)),
  })) as PublicKeyCredentialDescriptor[];
}

export function parseCreationOptions(
  options: PasskeyOptionsJSON,
): PublicKeyCredentialCreationOptions {
  const statics = publicKeyCredentialStatics();
  if (typeof statics?.parseCreationOptionsFromJSON === 'function') {
    return statics.parseCreationOptionsFromJSON(options);
  }

  const user = options.user as JsonRecord;
  const excludeCredentials = decodeDescriptors(options.excludeCredentials);
  return {
    ...options,
    challenge: base64urlToBuffer(String(options.challenge)),
    user: { ...user, id: base64urlToBuffer(String(user.id)) },
    ...(excludeCredentials ? { excludeCredentials } : {}),
  } as unknown as PublicKeyCredentialCreationOptions;
}

export function parseRequestOptions(
  options: PasskeyOptionsJSON,
): PublicKeyCredentialRequestOptions {
  const statics = publicKeyCredentialStatics();
  if (typeof statics?.parseRequestOptionsFromJSON === 'function') {
    return statics.parseRequestOptionsFromJSON(options);
  }

  const allowCredentials = decodeDescriptors(options.allowCredentials);
  return {
    ...options,
    challenge: base64urlToBuffer(String(options.challenge)),
    ...(allowCredentials ? { allowCredentials } : {}),
  } as unknown as PublicKeyCredentialRequestOptions;
}

// ---------------------------------------------------------------------------
// Ответ браузера -> JSON для бэка
// ---------------------------------------------------------------------------

function nativeToJSON(credential: PublicKeyCredential): CredentialJSON | null {
  const toJSON = (credential as unknown as { toJSON?: () => CredentialJSON }).toJSON;
  return typeof toJSON === 'function' ? toJSON.call(credential) : null;
}

function attachment(credential: PublicKeyCredential): { authenticatorAttachment?: string } {
  return credential.authenticatorAttachment
    ? { authenticatorAttachment: credential.authenticatorAttachment }
    : {};
}

export function serializeRegistrationCredential(credential: PublicKeyCredential): CredentialJSON {
  const native = nativeToJSON(credential);
  if (native) return native;

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === 'function' ? response.getTransports() : undefined;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    ...attachment(credential),
    // options не просят расширений, поэтому и в ответе от них ничего полезного нет.
    clientExtensionResults: {},
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      ...(transports ? { transports } : {}),
    },
  };
}

export function serializeAuthenticationCredential(credential: PublicKeyCredential): CredentialJSON {
  const native = nativeToJSON(credential);
  if (native) return native;

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    ...attachment(credential),
    clientExtensionResults: {},
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      ...(response.userHandle?.byteLength
        ? { userHandle: bufferToBase64url(response.userHandle) }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Церемонии
// ---------------------------------------------------------------------------

/**
 * Что значит исключение браузера для пользователя.
 * NotAllowedError — отказался, закрыл окно или истёк таймаут: ошибкой это не считаем.
 */
export function classifyCeremonyError(err: unknown): PasskeyCeremonyErrorKind {
  const name = (err as { name?: unknown } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'cancelled';
    case 'InvalidStateError':
      return 'already_registered';
    case 'NotSupportedError':
    case 'SecurityError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

async function runCeremony(
  operation: () => Promise<Credential | null>,
): Promise<PublicKeyCredential> {
  if (!isWebAuthnSupported()) throw new PasskeyCeremonyError('unsupported');
  try {
    const credential = await operation();
    // Браузеры вправе вернуть null вместо NotAllowedError.
    if (!credential) throw new PasskeyCeremonyError('cancelled');
    return credential as PublicKeyCredential;
  } catch (err) {
    if (err instanceof PasskeyCeremonyError) throw err;
    throw new PasskeyCeremonyError(classifyCeremonyError(err), err);
  }
}

/** `navigator.credentials.create()` по options бэка (регистрация passkey). */
export async function createPasskeyCredential(
  options: PasskeyOptionsJSON,
  signal?: AbortSignal,
): Promise<CredentialJSON> {
  const credential = await runCeremony(() =>
    navigator.credentials.create({ publicKey: parseCreationOptions(options), signal }),
  );
  return serializeRegistrationCredential(credential);
}

/** `navigator.credentials.get()` по options бэка (вход без логина — discoverable credential). */
export async function getPasskeyCredential(
  options: PasskeyOptionsJSON,
  signal?: AbortSignal,
): Promise<CredentialJSON> {
  const credential = await runCeremony(() =>
    navigator.credentials.get({ publicKey: parseRequestOptions(options), signal }),
  );
  return serializeAuthenticationCredential(credential);
}
