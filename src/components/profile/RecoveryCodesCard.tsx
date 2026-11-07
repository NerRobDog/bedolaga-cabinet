import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { passkeyApi } from '../../api/passkey';
import { getCachedBranding } from '../../api/branding';
import { getPasskeyErrorMessage } from '../../utils/passkeyErrors';
import { useToast } from '../Toast';
import RecoveryCodesPanel from '../auth/RecoveryCodesPanel';
import { Card } from '@/components/data-display/Card';
import { Button } from '@/components/primitives/Button';

// Остаток резервных кодов и перевыпуск. Открытые коды после перевыпуска живут только в состоянии
// этого компонента: НЕ через useMutation и не в кэше запросов, чтобы они не пережили закрытие
// экрана с кодами (кэш мутаций держит данные gcTime после размонтирования).

export const RECOVERY_CODES_QUERY_KEY = ['passkey-recovery-codes'] as const;

// Столько и меньше кодов — повод предупредить.
const LOW_CODES_THRESHOLD = 2;

export default function RecoveryCodesCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: RECOVERY_CODES_QUERY_KEY,
    queryFn: passkeyApi.getRecoveryCodesStatus,
  });

  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const regenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await passkeyApi.regenerateRecoveryCodes();
      setNewCodes(result.recovery_codes);
      setConfirming(false);
      // В кэш — только счётчики, без самих кодов.
      queryClient.setQueryData(RECOVERY_CODES_QUERY_KEY, {
        remaining: result.remaining,
        total: result.total,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: getPasskeyErrorMessage(err, t) ?? t('passkey.errors.generic'),
      });
    } finally {
      setGenerating(false);
    }
  };

  if (newCodes) {
    return (
      <Card>
        <RecoveryCodesPanel
          codes={newCodes}
          title={t('passkey.recoveryCodes.newTitle')}
          subtitle={t('passkey.recoveryCodes.newSubtitle')}
          continueLabel={t('passkey.recoveryCodes.done')}
          appName={getCachedBranding()?.name}
          onContinue={() => setNewCodes(null)}
        />
      </Card>
    );
  }

  const total = data?.total ?? 0;
  const remaining = data?.remaining ?? 0;
  const needsAttention = Boolean(data) && total > 0 && remaining <= LOW_CODES_THRESHOLD;

  let status: string | null = null;
  if (data) {
    if (total === 0) status = t('passkey.recoveryCodes.empty');
    else if (remaining === 0) status = t('passkey.recoveryCodes.none');
    else if (needsAttention) status = t('passkey.recoveryCodes.low');
  }

  return (
    <Card>
      <h3 className="font-medium text-dark-100">{t('passkey.recoveryCodes.title')}</h3>
      <p className="mt-1 text-sm text-dark-400">{t('passkey.recoveryCodes.description')}</p>

      {isLoading && <p className="mt-3 text-sm text-dark-500">{t('common.loading')}</p>}
      {isError && <p className="mt-3 text-sm text-error-400">{t('common.error')}</p>}

      {data && total > 0 && (
        <p className="mt-3 text-sm text-dark-200">
          {t('passkey.recoveryCodes.remaining', { remaining, total })}
        </p>
      )}
      {status && (
        <p className={`mt-1 text-sm ${needsAttention ? 'text-warning-400' : 'text-dark-400'}`}>
          {status}
        </p>
      )}

      {data &&
        (confirming ? (
          <div className="mt-4 space-y-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3">
            <p className="text-sm text-warning-400">{t('passkey.recoveryCodes.confirm')}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="destructive"
                size="sm"
                loading={generating}
                onClick={() => void regenerate()}
              >
                {t('passkey.recoveryCodes.confirmAction')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={generating}
                onClick={() => setConfirming(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              loading={generating}
              // Нечего инвалидировать, когда кодов нет вовсе: подтверждение лишнее.
              onClick={() => (total === 0 ? void regenerate() : setConfirming(true))}
            >
              {t('passkey.recoveryCodes.generate')}
            </Button>
          </div>
        ))}
    </Card>
  );
}
