import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { authApi } from "@/api/auth";
import { passkeyApi } from "@/api/passkey";
import { usePasskeyAvailability } from "@/hooks/usePasskeyAvailability";
import { isInTelegramWebApp } from "@/hooks/useTelegramSDK";
import { useAuthStore } from "@/store/auth";
import { usePlatform } from "@/platform/hooks/usePlatform";
import { copyToClipboard } from "@/utils/clipboard";

const STALE_MS = 60_000;

/**
 * Подсказка человеку, который входит только через Telegram: добавить второй способ входа
 * (passkey или OAuth-провайдер). Закрыть нельзя: пропадает, только когда второй способ входа появился.
 */
export default function SecureAccessNudge() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { status, usable } = usePasskeyAvailability();
  const platform = usePlatform();
  const [copied, setCopied] = useState(false);

  const userId = user?.id;
  const active = isAuthenticated && userId != null;
  const passkeyEnabled = Boolean(status?.enabled);

  const { data: linked } = useQuery({
    queryKey: ["linked-providers"],
    queryFn: () => authApi.getLinkedProviders(),
    staleTime: STALE_MS,
    enabled: active,
  });
  const { data: oauth } = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: authApi.getOAuthProviders,
    staleTime: STALE_MS,
    enabled: active,
  });
  const { data: passkeys } = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => passkeyApi.list(),
    staleTime: STALE_MS,
    enabled: active && passkeyEnabled,
  });

  if (!active || !user || !linked) return null;
  if (user.email) return null;
  const providers = Array.isArray(linked.providers) ? linked.providers : [];
  if (providers.some((p) => p.linked && p.provider !== "telegram")) return null;
  if (passkeyEnabled && !passkeys) return null; // ещё грузится: не мигаем баннером
  if ((passkeys?.passkeys.length ?? 0) > 0) return null;

  const oauthList = Array.isArray(oauth?.providers) ? oauth.providers : [];
  const hasGoogle = oauthList.some((p) => p.name === "google");
  const hasOAuth = oauthList.length > 0;
  const canPasskey = passkeyEnabled && usable;
  // Совет «откройте в браузере» — только внутри Mini App; на устройстве без ключей он бесполезен.
  const needBrowser = passkeyEnabled && !usable && isInTelegramWebApp();
  if (!passkeyEnabled && !hasOAuth) return null;

  const bonusDays =
    linked.link_bonus?.available === true && Number(linked.link_bonus.days) > 0
      ? Math.floor(Number(linked.link_bonus.days))
      : 0;
  const goAccounts = () => navigate("/profile/accounts");
  // Без токена в ссылке: в браузере сессии нет, кабинет сам отправит на вход (Telegram/OIDC)
  // и вернёт на экран привязки.
  const openInBrowser = () =>
    platform.openLink(`${window.location.origin}/profile/accounts?add=passkey`);
  const copyLink = async () => {
    try {
      await copyToClipboard(window.location.origin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const btn =
    "rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  return (
    <section
      aria-labelledby="secure-access-title"
      className="relative overflow-hidden rounded-2xl border border-accent-500/30 bg-accent-500/5 p-4"
    >
      <h2
        id="secure-access-title"
        className="text-sm font-semibold text-dark-50"
      >
        {t("dashboard.secureAccess.title")}
      </h2>
      {bonusDays > 0 && (
        <p
          data-testid="secure-access-bonus"
          className="mt-2 rounded-xl border border-accent-500/40 bg-accent-500/15 px-3 py-2 text-sm font-bold text-accent-400"
        >
          <span aria-hidden="true" className="mr-1.5">🎁</span>{" "}
          {t("dashboard.secureAccess.linkBonus", { count: bonusDays })}
        </p>
      )}
      <p className="mt-2 text-xs text-dark-300">
        {t("dashboard.secureAccess.text")}
      </p>
      {needBrowser && (
        <p className="mt-2 text-xs text-dark-200">
          {t("dashboard.secureAccess.openInBrowser")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {needBrowser && (
          <button
            type="button"
            onClick={openInBrowser}
            className={`${btn} bg-accent-500 text-on-accent hover:bg-accent-400`}
          >
            {t("dashboard.secureAccess.openBrowser")}
          </button>
        )}
        {canPasskey && (
          <button
            type="button"
            onClick={goAccounts}
            className={`${btn} bg-accent-500 text-on-accent hover:bg-accent-400`}
          >
            {t("dashboard.secureAccess.addPasskey")}
          </button>
        )}
        {hasOAuth && (
          <button
            type="button"
            onClick={goAccounts}
            className={
              canPasskey || needBrowser
                ? `${btn} border border-dark-600 text-dark-100 hover:bg-dark-800`
                : `${btn} bg-accent-500 text-on-accent hover:bg-accent-400`
            }
          >
            {hasGoogle
              ? t("dashboard.secureAccess.linkGoogle")
              : t("dashboard.secureAccess.linkAccount")}
          </button>
        )}
        {needBrowser && (
          <button
            type="button"
            onClick={() => void copyLink()}
            className={`${btn} border border-dark-600 text-dark-100 hover:bg-dark-800`}
          >
            {copied
              ? t("dashboard.secureAccess.copied")
              : t("dashboard.secureAccess.copyLink")}
          </button>
        )}
      </div>
    </section>
  );
}
