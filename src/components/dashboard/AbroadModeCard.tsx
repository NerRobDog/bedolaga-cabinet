import { useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subscriptionApi } from '@/api/subscription';

const QUERY_KEY = ['abroad-mode'];

/**
 * Переключатель «Я в РФ / Я за границей». Показывается, только если бэкенд включил функцию
 * (`available`). Режим после успешного ответа берётся из ответа сервера, а не из нажатой кнопки.
 */
export default function AbroadModeCard({ subscriptionId }: { subscriptionId?: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const titleId = useId();

  const { data } = useQuery({
    queryKey: [...QUERY_KEY, subscriptionId ?? null],
    queryFn: () => subscriptionApi.getAbroadMode(subscriptionId),
    retry: false,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => subscriptionApi.setAbroadMode(enabled, subscriptionId),
    onSuccess: (state) => {
      queryClient.setQueryData([...QUERY_KEY, subscriptionId ?? null], state);
    },
  });

  if (!data?.available) return null;

  const abroad = data.abroad;
  const options = [
    { value: false, label: t('dashboard.abroadMode.home') },
    { value: true, label: t('dashboard.abroadMode.abroad') },
  ];

  return (
    <div className="bento-card">
      <div id={titleId} className="mb-3 text-base font-medium text-dark-100">
        {t('dashboard.abroadMode.title')}
      </div>
      {/* Сегментированный переключатель: рамка (≥3:1) очерчивает контрол, неактивный вариант не пропадает на фоне карточки. */}
      <div
        role="group"
        aria-labelledby={titleId}
        className="grid grid-cols-2 gap-1 rounded-2xl border border-dark-500 p-1"
      >
        {options.map((option) => {
          const active = option.value === abroad;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              disabled={mutation.isPending}
              onClick={() => {
                if (!active) mutation.mutate(option.value);
              }}
              className={`min-h-11 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-70 ${
                active
                  ? 'bg-accent-500 text-on-accent'
                  : 'bg-transparent text-dark-100 hover:bg-dark-700/40'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-dark-200">
        {mutation.isPending
          ? t('dashboard.abroadMode.switching')
          : abroad
            ? t('dashboard.abroadMode.currentAbroad')
            : t('dashboard.abroadMode.currentHome')}
      </p>
      <p className="mt-2 text-sm text-dark-300">{t('dashboard.abroadMode.hint')}</p>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-sm text-error-400">
          {t('dashboard.abroadMode.error')}
        </p>
      )}
    </div>
  );
}
