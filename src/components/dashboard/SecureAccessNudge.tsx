import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { authApi } from '@/api/auth';
import { passkeyApi } from '@/api/passkey';
import { usePasskeyAvailability } from '@/hooks/usePasskeyAvailability';
import { isInTelegramWebApp } from '@/hooks/useTelegramSDK';
import { useAuthStore } from '@/store/auth';
import { copyToClipboard } from '@/utils/clipboard';
import { XIcon } from '@/components/icons';

export const SECURE_ACCESS_DISMISS_PREFIX = 'secure_access_nudge_dismissed:';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_MS = 60_000;

function isDismissed(userId: number): boolean {
  try {
    const raw = localStorage.getItem(`${SECURE_ACCESS_DISMISS_PREFIX}${userId}`);
    const ts = raw ? Number(raw) : NaN;
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Подсказка человеку, который входит только через Telegram: добавить второй способ входа
 * (passkey или OAuth-провайдер). Запросов не делает, пока скрыта или закрыта пользователем.
 */
export default function SecureAccessNudge() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { status, usable } = usePasskeyAvailability();
  const [dismissedNow, setDismissedNow] = useState(false);
  const [copied, setCopied] = useState(false);

  const userId = user?.id;
  const active = isAuthenticated && userId != null && !dismissedNow && !isDismissed(userId);
  const passkeyEnabled = Boolean(status?.enabled);

  const { data: linked } = useQuery({
    queryKey: ['linked-providers'],
    queryFn: () => authApi.getLinkedProviders(),
    staleTime: STALE_MS,
    enabled: active,
  });
  const { data: oauth } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: authApi.getOAuthProviders,
    staleTime: STALE_MS,
    enabled: active,
  });
  const { data: passkeys } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => passkeyApi.list(),
    staleTime: STALE_MS,
    enabled: active && passkeyEnabled,
  });

  if (!active || !user || !linked) return null;
  if (user.email) return null;
  const providers = Array.isArray(linked.providers) ? linked.providers : [];
  if (providers.some((p) => p.linked && p.provider !== 'telegram')) return null;
  if (passkeyEnabled && !passkeys) return null; // ещё грузится: не мигаем баннером
  if ((passkeys?.passkeys.length ?? 0) > 0) return null;

  const oauthList = Array.isArray(oauth?.providers) ? oauth.providers : [];
  const hasGoogle = oauthList.some((p) => p.name === 'google');
  const hasOAuth = oauthList.length > 0;
  const canPasskey = passkeyEnabled && usable;
  // Совет «откройте в браузере» — только внутри Mini App; на устройстве без ключей он бесполезен.
  const needBrowser = passkeyEnabled && !usable && isInTelegramWebApp();
  if (!passkeyEnabled && !hasOAuth) return null;

  const dismiss = () => {
    setDismissedNow(true);
    try {
      localStorage.setItem(`${SECURE_ACCESS_DISMISS_PREFIX}${user.id}`, String(Date.now()));
    } catch {
      // приватный режим: закрыто до перезагрузки
    }
  };
  const goAccounts = () => navigate('/profile/accounts');
  const copyLink = async () => {
    try {
      await copyToClipboard(window.location.origin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const btn =
    'rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';

  return (
    <section
      aria-labelledby="secure-access-title"
      className="relative overflow-hidden rounded-2xl border border-accent-500/30 bg-accent-500/5 p-4"
    >
      <button
        type="button"
        aria-label={t('dashboard.secureAccess.dismiss')}
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-lg p-1 text-dark-400 hover:text-dark-100"
      >
        <XIcon />
      </button>
      <h2 id="secure-access-title" className="pr-8 text-sm font-semibold text-dark-50">
        {t('dashboard.secureAccess.title')}
      </h2>
      <p className="mt-1 text-xs text-dark-300">{t('dashboard.secureAccess.text')}</p>
      {needBrowser && (
        <p className="mt-2 text-xs text-dark-200">{t('dashboard.secureAccess.openInBrowser')}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canPasskey && (
          <button
            type="button"
            onClick={goAccounts}
            className={`${btn} bg-accent-500 text-on-accent hover:bg-accent-400`}
          >
            {t('dashboard.secureAccess.addPasskey')}
          </button>
        )}
        {hasOAuth && (
          <button
            type="button"
            onClick={goAccounts}
            className={
              canPasskey
                ? `${btn} border border-dark-600 text-dark-100 hover:bg-dark-800`
                : `${btn} bg-accent-500 text-on-accent hover:bg-accent-400`
            }
          >
            {hasGoogle
              ? t('dashboard.secureAccess.linkGoogle')
              : t('dashboard.secureAccess.linkAccount')}
          </button>
        )}
        {needBrowser && (
          <button
            type="button"
            onClick={() => void copyLink()}
            className={`${btn} border border-dark-600 text-dark-100 hover:bg-dark-800`}
          >
            {copied ? t('dashboard.secureAccess.copied') : t('dashboard.secureAccess.copyLink')}
          </button>
        )}
      </div>
    </section>
  );
}
