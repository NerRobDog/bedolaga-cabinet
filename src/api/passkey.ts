import apiClient from './client';
import type { AuthResponse } from '../types';
import type { CredentialJSON, PasskeyOptionsJSON } from '../utils/webauthn';

// Контракт бэка: app/cabinet/routes/passkey.py и passkey_signup.py, схемы — schemas/passkey.py.
// Публичные ручки живут под /cabinet/auth/*, остальные требуют JWT.

export interface PasskeyStatus {
  enabled: boolean;
  /** Открыта ли регистрация аккаунта одним passkey. */
  signup_enabled: boolean;
}

export interface PasskeyOptionsResponse {
  challenge_id: string;
  options: PasskeyOptionsJSON;
}

export interface PasskeyInfo {
  id: number;
  name: string;
  /** py_webauthn: 'single_device' | 'multi_device'. */
  device_type: string;
  backed_up: boolean;
  transports: string[];
  created_at: string | null;
  last_used_at: string | null;
}

export interface PasskeyListResponse {
  passkeys: PasskeyInfo[];
  limit: number;
}

export interface RecoveryCodesStatus {
  remaining: number;
  total: number;
}

/** Открытые коды приходят ОДИН раз: на сервере остаются только хэши. */
export interface RecoveryCodesRegenerated extends RecoveryCodesStatus {
  recovery_codes: string[];
}

export interface PasskeySignupResponse extends AuthResponse {
  recovery_codes: string[];
}

export interface RecoveryLoginResponse extends AuthResponse {
  /** Вход по коду — аварийный путь: фронт обязан сразу предложить добавить новый passkey. */
  recovery_login: boolean;
}

export interface PasskeySignupVerifyPayload {
  challengeId: string;
  credential: CredentialJSON;
  acceptedLegalDocuments?: string[];
  campaignSlug?: string | null;
  referralCode?: string | null;
}

export const passkeyApi = {
  getStatus: async (): Promise<PasskeyStatus> => {
    const response = await apiClient.get<PasskeyStatus>('/cabinet/auth/passkey/status');
    return response.data;
  },

  // --- вход ---------------------------------------------------------------

  loginOptions: async (): Promise<PasskeyOptionsResponse> => {
    const response = await apiClient.post<PasskeyOptionsResponse>(
      '/cabinet/auth/passkey/login/options',
    );
    return response.data;
  },

  loginVerify: async (challengeId: string, credential: CredentialJSON): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/cabinet/auth/passkey/login/verify', {
      challenge_id: challengeId,
      credential,
    });
    return response.data;
  },

  // --- аккаунт, созданный самим passkey ----------------------------------

  signupOptions: async (displayName?: string): Promise<PasskeyOptionsResponse> => {
    // Пустая строка бэку не годится (валидатор имени отвечает 422), поэтому имя только непустое.
    const name = displayName?.trim();
    const response = await apiClient.post<PasskeyOptionsResponse>(
      '/cabinet/auth/passkey/signup/options',
      name ? { display_name: name } : {},
    );
    return response.data;
  },

  signupVerify: async (payload: PasskeySignupVerifyPayload): Promise<PasskeySignupResponse> => {
    const response = await apiClient.post<PasskeySignupResponse>(
      '/cabinet/auth/passkey/signup/verify',
      {
        challenge_id: payload.challengeId,
        credential: payload.credential,
        accepted_legal_documents: payload.acceptedLegalDocuments?.length
          ? payload.acceptedLegalDocuments
          : undefined,
        campaign_slug: payload.campaignSlug || undefined,
        referral_code: payload.referralCode || undefined,
      },
    );
    return response.data;
  },

  recoveryLogin: async (code: string): Promise<RecoveryLoginResponse> => {
    const response = await apiClient.post<RecoveryLoginResponse>('/cabinet/auth/recovery/login', {
      code,
    });
    return response.data;
  },

  // --- свои ключи (JWT) --------------------------------------------------

  list: async (): Promise<PasskeyListResponse> => {
    const response = await apiClient.get<PasskeyListResponse>('/cabinet/passkey');
    return response.data;
  },

  registerOptions: async (): Promise<PasskeyOptionsResponse> => {
    const response = await apiClient.post<PasskeyOptionsResponse>(
      '/cabinet/passkey/register/options',
    );
    return response.data;
  },

  registerVerify: async (
    challengeId: string,
    credential: CredentialJSON,
    name?: string,
  ): Promise<PasskeyInfo> => {
    const response = await apiClient.post<PasskeyInfo>('/cabinet/passkey/register/verify', {
      challenge_id: challengeId,
      credential,
      name: name?.trim() || undefined,
    });
    return response.data;
  },

  rename: async (id: number, name: string): Promise<PasskeyInfo> => {
    const response = await apiClient.patch<PasskeyInfo>(
      `/cabinet/passkey/${encodeURIComponent(String(id))}`,
      { name: name.trim() },
    );
    return response.data;
  },

  remove: async (id: number): Promise<{ success: boolean }> => {
    const response = await apiClient.delete<{ success: boolean }>(
      `/cabinet/passkey/${encodeURIComponent(String(id))}`,
    );
    return response.data;
  },

  // --- recovery-коды (JWT) -----------------------------------------------

  getRecoveryCodesStatus: async (): Promise<RecoveryCodesStatus> => {
    const response = await apiClient.get<RecoveryCodesStatus>('/cabinet/passkey/recovery-codes');
    return response.data;
  },

  regenerateRecoveryCodes: async (): Promise<RecoveryCodesRegenerated> => {
    const response = await apiClient.post<RecoveryCodesRegenerated>(
      '/cabinet/passkey/recovery-codes/regenerate',
    );
    return response.data;
  },
};
