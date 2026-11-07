import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '../../utils/clipboard';
import {
  RECOVERY_CODES_FILENAME,
  buildRecoveryCodesText,
  downloadTextFile,
} from '../../utils/recoveryCodesFile';
import { CopyIcon, DownloadIcon, WarningIcon } from '@/components/icons';

// Экран «сохраните резервные коды». Коды приходят от бэка один раз (на сервере остаются
// хэши), поэтому:
//  - они живут только в пропсах/состоянии вызывающего: ни localStorage, ни sessionStorage,
//    ни кэш запросов их не видят;
//  - «Продолжить» закрыто, пока человек не подтвердит, что сохранил коды;
//  - пока не подтвердил, закрытие вкладки спрашивает подтверждение.

type Notice = 'copied' | 'copyFailed' | 'downloadFailed';

const NOTICE_KEYS: Record<Notice, string> = {
  copied: 'passkey.codes.copied',
  copyFailed: 'passkey.codes.copyFailed',
  downloadFailed: 'passkey.codes.downloadFailed',
};

interface RecoveryCodesPanelProps {
  codes: readonly string[];
  onContinue: () => void;
  /** Подпись кнопки «Продолжить»; по умолчанию общая. */
  continueLabel?: string;
  title?: string;
  subtitle?: string;
  /** Сервис в шапке скачанного файла. */
  appName?: string;
  /** Вызывающий что-то делает после «Продолжить» (например, сохраняет сессию). */
  busy?: boolean;
}

export default function RecoveryCodesPanel({
  codes,
  onContinue,
  continueLabel,
  title,
  subtitle,
  appName,
  busy = false,
}: RecoveryCodesPanelProps) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (acknowledged) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Часть браузеров показывает диалог только при непустом returnValue.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [acknowledged]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(codes.join('\n'));
      setNotice('copied');
    } catch {
      setNotice('copyFailed');
    }
  };

  const handleDownload = () => {
    try {
      downloadTextFile(
        RECOVERY_CODES_FILENAME,
        buildRecoveryCodesText({
          heading: t('passkey.codes.fileTitle'),
          appName: appName || window.location.hostname,
          note: t('passkey.codes.fileNote'),
          codes,
        }),
      );
      setNotice(null);
    } catch {
      setNotice('downloadFailed');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-dark-50">{title ?? t('passkey.codes.title')}</h2>
        <p className="mt-1 text-sm text-dark-400">{subtitle ?? t('passkey.codes.subtitle')}</p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-xs leading-relaxed text-warning-400">
        <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('passkey.codes.warning')}</span>
      </div>

      {/* Коды латиницей и цифрами: в RTL-локали (fa) порядок символов менять нельзя. */}
      <ol
        dir="ltr"
        aria-label={t('passkey.codes.listLabel')}
        // Колонок столько, сколько влезает код целиком (19 знаков моноширинным): на узком
        // экране одна, в карточке входа две. Перенос кода посередине читается как два кода.
        className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2"
      >
        {codes.map((code) => (
          <li
            key={code}
            className="select-all whitespace-nowrap rounded-lg border border-dark-700 bg-dark-800/60 px-2 py-2 text-center font-mono text-sm text-dark-100"
          >
            {code}
          </li>
        ))}
      </ol>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={handleCopy} className="btn-secondary flex-1 gap-2 py-2.5">
            <CopyIcon className="h-4 w-4" />
            {t('passkey.codes.copy')}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="btn-secondary flex-1 gap-2 py-2.5"
          >
            <DownloadIcon className="h-4 w-4" />
            {t('passkey.codes.download')}
          </button>
        </div>
        {/* Всегда в DOM: скринридеры надёжно озвучивают только уже существующий live-регион. */}
        <p
          role="status"
          aria-live="polite"
          className={`mt-2 text-xs empty:mt-0 ${notice === 'copied' ? 'text-success-400' : 'text-error-400'}`}
        >
          {notice ? t(NOTICE_KEYS[notice]) : ''}
        </p>
      </div>

      <label
        htmlFor="recovery-codes-ack"
        className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-dark-200"
      >
        <input
          id="recovery-codes-ack"
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500"
        />
        <span>{t('passkey.codes.ack')}</span>
      </label>

      <button
        type="button"
        className="btn-primary w-full py-2.5"
        disabled={!acknowledged || busy}
        onClick={onContinue}
      >
        {continueLabel ?? t('passkey.codes.continue')}
      </button>
    </div>
  );
}
