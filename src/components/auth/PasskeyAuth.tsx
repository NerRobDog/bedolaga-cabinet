import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  passkeyApi,
  type PasskeySignupResponse,
  type RecoveryLoginResponse,
} from '../../api/passkey';
import { usePasskeyAvailability } from '../../hooks/usePasskeyAvailability';
import type { LegalConsentGateState } from '../../hooks/useLegalConsentGate';
import type { AuthResponse } from '../../types';
import { consumeCampaignSlug, getPendingCampaignSlug } from '../../utils/campaign';
import { consumeReferralCode, getPendingReferralCode } from '../../utils/referral';
import { authenticateWithPasskey, createSignupCredential } from '../../utils/passkeyCeremony';
import { getPasskeyErrorMessage, type PasskeyErrorContext } from '../../utils/passkeyErrors';
import type { CredentialJSON } from '../../utils/webauthn';
import LegalConsent from '../LegalConsent';
import { KeyIcon } from '@/components/icons';

// Блок passkey на экране входа: «Войти с passkey», «Создать аккаунт с passkey» и «Войти по
// резервному коду». Сам сессию не открывает — отдаёт ответ бэка странице: она решает, что с ним
// делать (открыть сессию, показать резервные коды, увести в настройки).

const MAX_DISPLAY_NAME = 100;
const MAX_CODE_LENGTH = 40;

type View = 'idle' | 'signup' | 'recovery';
type Busy = 'login' | 'signup' | 'recovery' | null;

interface PasskeyAuthProps {
  /** Вход по passkey прошёл. */
  onAuthenticated: (response: AuthResponse) => Promise<void> | void;
  /** Вход по резервному коду прошёл: вход аварийный, странице надо предложить новый passkey. */
  onRecoveryLogin: (response: RecoveryLoginResponse) => Promise<void> | void;
  /**
   * Аккаунт создан. В ответе открытые резервные коды: их показывают один раз, и только после
   * подтверждения «сохранил» страница открывает сессию.
   */
  onSignedUp: (response: PasskeySignupResponse) => void;
  /**
   * Гейт согласия с документами страницы входа. На 428 «нужно согласие» страница рисует экран
   * галочек, а повтор запроса (с тем же ответом аутентификатора) выполняет замыкание отсюда.
   */
  consent: LegalConsentGateState;
  /** Идёт другой вход (например, автоматический через Telegram). */
  disabled?: boolean;
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-dark-500 border-t-accent-400" />
  );
}

export default function PasskeyAuth({
  onAuthenticated,
  onRecoveryLogin,
  onSignedUp,
  consent,
  disabled = false,
}: PasskeyAuthProps) {
  const { t } = useTranslation();
  const { showLogin, showSignup, showRecovery } = usePasskeyAvailability();

  const [view, setView] = useState<View>('idle');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');

  // Не оставлять церемонию висеть, если человек ушёл со страницы.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!showLogin && !showSignup && !showRecovery) return null;

  const locked = busy !== null || disabled;

  const startCeremony = (): AbortSignal => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  const showError = (err: unknown, context: PasskeyErrorContext) => {
    setError(getPasskeyErrorMessage(err, t, context) ?? '');
  };

  const openView = (next: View) => {
    setError('');
    setView(next);
  };

  const handleLogin = async () => {
    if (locked) return;
    setError('');
    setBusy('login');
    try {
      const response = await authenticateWithPasskey(startCeremony());
      await onAuthenticated(response);
    } catch (err) {
      showError(err, 'login');
    } finally {
      setBusy(null);
    }
  };

  const verifySignup = (
    created: { challengeId: string; credential: CredentialJSON },
    accepted: string[],
  ) =>
    passkeyApi
      .signupVerify({
        challengeId: created.challengeId,
        credential: created.credential,
        acceptedLegalDocuments: accepted,
        campaignSlug: getPendingCampaignSlug(),
        referralCode: getPendingReferralCode(),
      })
      .then((response) => {
        // Как у остальных входов: расходуем только после успеха, при повторе метки остаются.
        consumeCampaignSlug();
        consumeReferralCode();
        onSignedUp(response);
      });

  const handleSignup = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (locked) return;
    setError('');
    setBusy('signup');
    let created: { challengeId: string; credential: CredentialJSON } | null = null;
    try {
      created = await createSignupCredential(displayName, startCeremony());
      await verifySignup(created, consent.acceptedKeys);
    } catch (err) {
      if (created) {
        // 428: ключ на устройстве уже создан, повторяем verify с ТЕМ ЖЕ ответом после галочек.
        const ready = created;
        const needsConsent = consent.capture(err, (accepted) => verifySignup(ready, accepted));
        if (needsConsent) return;
      }
      showError(err, 'manage');
    } finally {
      setBusy(null);
    }
  };

  const handleRecovery = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (locked) return;
    const typed = code.trim();
    if (!typed) {
      setError(t('passkey.recovery.empty'));
      return;
    }
    setError('');
    setBusy('recovery');
    try {
      const response = await passkeyApi.recoveryLogin(typed);
      setCode('');
      await onRecoveryLogin(response);
    } catch (err) {
      showError(err, 'recovery');
    } finally {
      setBusy(null);
    }
  };

  const linkClass =
    'text-sm text-accent-400 transition-colors hover:text-accent-300 disabled:opacity-50';

  return (
    <div data-testid="passkey-auth">
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-dark-700" />
        <span className="text-xs text-dark-500">{t('auth.or', 'or')}</span>
        <div className="h-px flex-1 bg-dark-700" />
      </div>

      {view === 'idle' && (
        <div className="space-y-3">
          {showLogin && (
            <button
              type="button"
              onClick={handleLogin}
              disabled={locked}
              className="btn-secondary w-full gap-2 py-2.5"
            >
              {busy === 'login' ? (
                <>
                  <Spinner />
                  {t('passkey.login.busy')}
                </>
              ) : (
                <>
                  <KeyIcon className="h-5 w-5" />
                  {t('passkey.login.button')}
                </>
              )}
            </button>
          )}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {showSignup && (
              <button
                type="button"
                className={linkClass}
                disabled={locked}
                onClick={() => openView('signup')}
              >
                {t('passkey.signup.toggle')}
              </button>
            )}
            {showRecovery && (
              <button
                type="button"
                className={linkClass}
                disabled={locked}
                onClick={() => openView('recovery')}
              >
                {t('passkey.recovery.toggle')}
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'signup' && (
        <form onSubmit={handleSignup} className="space-y-3">
          <p className="text-sm text-dark-400">{t('passkey.signup.description')}</p>
          <div>
            <label htmlFor="passkey-display-name" className="label">
              {t('passkey.signup.displayName')}
            </label>
            <input
              id="passkey-display-name"
              type="text"
              autoComplete="given-name"
              maxLength={MAX_DISPLAY_NAME}
              className="input"
              placeholder={t('passkey.signup.displayNamePlaceholder')}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={locked}
            />
          </div>
          <LegalConsent
            documents={consent.documents}
            accepted={consent.accepted}
            onChange={consent.toggle}
            disabled={locked}
            className="pt-1"
          />
          <button
            type="submit"
            disabled={locked || !consent.allAccepted}
            className="btn-primary w-full gap-2 py-2.5"
          >
            {busy === 'signup' ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t('passkey.signup.busy')}
              </>
            ) : (
              t('passkey.signup.submit')
            )}
          </button>
          <div className="text-center">
            <button type="button" className={linkClass} onClick={() => openView('idle')}>
              {t('common.back', 'Back')}
            </button>
          </div>
        </form>
      )}

      {view === 'recovery' && (
        <form onSubmit={handleRecovery} className="space-y-3">
          <p className="text-sm text-dark-400">{t('passkey.recovery.description')}</p>
          <div>
            <label htmlFor="passkey-recovery-code" className="label">
              {t('passkey.recovery.label')}
            </label>
            <input
              id="passkey-recovery-code"
              type="text"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_CODE_LENGTH}
              className="input font-mono tracking-wider"
              placeholder={t('passkey.recovery.placeholder')}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={locked}
            />
          </div>
          <button type="submit" disabled={locked} className="btn-primary w-full gap-2 py-2.5">
            {busy === 'recovery' ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t('common.loading')}
              </>
            ) : (
              t('passkey.recovery.submit')
            )}
          </button>
          <div className="text-center">
            <button type="button" className={linkClass} onClick={() => openView('idle')}>
              {t('common.back', 'Back')}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-2.5 text-sm text-error-400"
        >
          {error}
        </div>
      )}
    </div>
  );
}
