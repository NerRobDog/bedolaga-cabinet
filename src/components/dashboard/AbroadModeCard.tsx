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
      <div className="mb-3 text-sm font-medium text-dark-100">
        {t('dashboard.abroadMode.title')}
      </div>
      <div role="group" className="grid grid-cols-2 gap-2">
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
              className={
                active
                  ? 'rounded-xl bg-accent-500 px-3 py-2.5 text-sm font-medium text-white'
                  : 'rounded-xl bg-dark-800 px-3 py-2.5 text-sm text-dark-200 hover:bg-dark-700 disabled:opacity-60'
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-dark-400">
        {mutation.isPending
          ? t('dashboard.abroadMode.switching')
          : abroad
            ? t('dashboard.abroadMode.currentAbroad')
            : t('dashboard.abroadMode.currentHome')}
      </p>
      <p className="mt-1 text-xs text-dark-400">{t('dashboard.abroadMode.hint')}</p>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-xs text-error-400">
          {t('dashboard.abroadMode.error')}
        </p>
      )}
    </div>
  );
}
