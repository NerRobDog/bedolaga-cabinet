import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { passkeyApi, type PasskeyInfo } from '../../api/passkey';
import { usePasskeyAvailability } from '../../hooks/usePasskeyAvailability';
import { formatDateOrRaw } from '../../utils/format';
import { registerPasskey } from '../../utils/passkeyCeremony';
import { getPasskeyErrorMessage } from '../../utils/passkeyErrors';
import { uiLocale } from '../../utils/uiLocale';
import { useToast } from '../Toast';
import RecoveryCodesCard from './RecoveryCodesCard';
import { Card } from '@/components/data-display/Card';
import { Button } from '@/components/primitives/Button';
import { KeyIcon, WarningIcon } from '@/components/icons';

// Раздел «Passkey» в способах входа: список ключей (название, тип, даты), переименование,
// удаление с подтверждением, добавление нового и резервные коды.

export const PASSKEYS_QUERY_KEY = ['passkeys'] as const;
const MAX_NAME_LENGTH = 100;
const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

function formatDate(value: string | null): string | null {
  return formatDateOrRaw(value, uiLocale(), DATE_FORMAT);
}

interface PasskeyRowProps {
  passkey: PasskeyInfo;
  /** true — имя сохранено; false — не вышло, форму оставляем открытой. */
  onRename: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}

function PasskeyRow({ passkey, onRename, onDelete }: PasskeyRowProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(passkey.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const created = formatDate(passkey.created_at);
  const lastUsed = formatDate(passkey.last_used_at);
  const device = passkey.device_type.includes('multi')
    ? t('passkey.settings.deviceSynced')
    : t('passkey.settings.deviceSingle');

  // Две строки: тип устройства отдельно, даты отдельно, чтобы перенос не рвал фразу посередине.
  const dates = [
    created ? t('passkey.settings.createdAt', { date: created }) : null,
    lastUsed ? t('passkey.settings.lastUsed', { date: lastUsed }) : t('passkey.settings.neverUsed'),
  ]
    .filter(Boolean)
    .join(' · ');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const submitRename = (event: React.SyntheticEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (next === passkey.name) {
      setRenaming(false);
      return;
    }
    void run(async () => {
      if (await onRename(passkey.id, next)) setRenaming(false);
    });
  };

  if (renaming) {
    return (
      <form onSubmit={submitRename} className="space-y-3">
        <div>
          <label htmlFor={`passkey-name-${passkey.id}`} className="label">
            {t('passkey.settings.renameLabel')}
          </label>
          <input
            id={`passkey-name-${passkey.id}`}
            type="text"
            className="input"
            maxLength={MAX_NAME_LENGTH}
            placeholder={t('passkey.settings.renamePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setName(passkey.name);
              setRenaming(false);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <KeyIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" />
          <div className="min-w-0">
            <p className="break-words font-medium text-dark-100">{passkey.name}</p>
            <p className="mt-0.5 text-sm text-dark-400">{device}</p>
            <p className="text-sm text-dark-400">{dates}</p>
          </div>
        </div>
        {!confirmingDelete && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={`${t('passkey.settings.rename')}: ${passkey.name}`}
              onClick={() => setRenaming(true)}
            >
              {t('passkey.settings.rename')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`${t('common.delete')}: ${passkey.name}`}
              onClick={() => setConfirmingDelete(true)}
            >
              {t('common.delete')}
            </Button>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <div className="space-y-3 rounded-xl border border-error-500/30 bg-error-500/10 p-3">
          <p className="text-sm text-error-400">
            {t('passkey.settings.deleteConfirm', { name: passkey.name })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              loading={busy}
              onClick={() =>
                void run(async () => {
                  try {
                    await onDelete(passkey.id);
                  } finally {
                    // Ключ остаётся (ошибка) или исчезает (успех): подтверждение в любом случае закрыто.
                    setConfirmingDelete(false);
                  }
                })
              }
            >
              {t('common.delete')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PasskeySettingsProps {
  /** Человек только что вошёл по резервному коду: предложить добавить новый passkey сразу. */
  recoveryLogin?: boolean;
}

export default function PasskeySettings({ recoveryLogin = false }: PasskeySettingsProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { status, usable } = usePasskeyAvailability();
  const [addedThisVisit, setAddedThisVisit] = useState(false);

  const enabled = Boolean(status?.enabled);
  const { data, isLoading, isError } = useQuery({
    queryKey: PASSKEYS_QUERY_KEY,
    queryFn: passkeyApi.list,
    enabled,
  });

  const fail = (err: unknown) => {
    const message = getPasskeyErrorMessage(err, t);
    // null — человек сам закрыл окно passkey: это не сбой.
    if (message) showToast({ type: 'error', message });
  };

  const addMutation = useMutation({
    mutationFn: () => registerPasskey(),
    onSuccess: () => {
      setAddedThisVisit(true);
      void queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
      showToast({ type: 'success', message: t('passkey.settings.added') });
    },
    onError: fail,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => passkeyApi.rename(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
      showToast({ type: 'success', message: t('passkey.settings.renamed') });
    },
    onError: fail,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => passkeyApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
      showToast({ type: 'success', message: t('passkey.settings.deleted') });
    },
    // last_login_method и прочее — читаемым текстом, а не сырым английским detail.
    onError: fail,
  });

  if (!enabled) return null;

  const passkeys = data?.passkeys ?? [];
  const limit = data?.limit;
  const limitReached = limit !== undefined && passkeys.length >= limit;
  const canAdd = usable && !limitReached && !addMutation.isPending;

  const addButton = (
    <Button
      size="sm"
      disabled={!canAdd}
      loading={addMutation.isPending}
      onClick={() => addMutation.mutate()}
    >
      {t('passkey.settings.add')}
    </Button>
  );

  return (
    <section className="space-y-3" aria-labelledby="passkey-settings-title">
      <div>
        <h2 id="passkey-settings-title" className="text-xl font-semibold text-dark-50">
          {t('passkey.settings.title')}
        </h2>
        <p className="mt-1 text-sm text-dark-400">{t('passkey.settings.subtitle')}</p>
      </div>

      {recoveryLogin && !addedThisVisit && (
        <Card className="border-warning-500/30 bg-warning-500/10">
          <div className="flex items-start gap-3">
            <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning-400" />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="font-medium text-dark-100">{t('passkey.recoveryPrompt.title')}</p>
                <p className="mt-1 text-sm text-dark-300">{t('passkey.recoveryPrompt.text')}</p>
              </div>
              {addButton}
            </div>
          </div>
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-dark-500">{t('common.loading')}</p>}
        {isError && <p className="text-sm text-error-400">{t('passkey.settings.loadError')}</p>}

        {data && passkeys.length === 0 && (
          <p className="text-sm text-dark-400">{t('passkey.settings.empty')}</p>
        )}

        {passkeys.length > 0 && (
          <ul className="divide-y divide-dark-700/40">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="py-3 first:pt-0 last:pb-0">
                <PasskeyRow
                  passkey={passkey}
                  onRename={(id, name) =>
                    renameMutation.mutateAsync({ id, name }).then(
                      () => true,
                      () => false,
                    )
                  }
                  onDelete={async (id) => {
                    await deleteMutation.mutateAsync(id).catch(() => undefined);
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {!usable && <p className="mt-3 text-sm text-dark-400">{t('passkey.errors.unsupported')}</p>}
        {limitReached && (
          <p className="mt-3 text-sm text-dark-400">{t('passkey.settings.limit', { limit })}</p>
        )}

        <div className="mt-4">{addButton}</div>
      </Card>

      <RecoveryCodesCard />
    </section>
  );
}
