import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@/components/icons';
import {
  DIAGNOSTICS_ORDER,
  OTHER_MAX_LENGTH,
  OTHER_OPTION,
  hasOther,
  optionsForField,
  otherKey,
  type DiagnosticsAnswers,
  type DiagnosticsField,
  type TicketFormOptions,
} from '@/utils/ticketDiagnostics';

interface DiagnosticsFormProps {
  answers: DiagnosticsAnswers;
  onChange: (answers: DiagnosticsAnswers) => void;
  options: TicketFormOptions;
}

/**
 * Обязательные вопросы перед обращением. Тексты — `support.form.<поле>.*`.
 * «Другое» открывает короткое текстовое поле (до `OTHER_MAX_LENGTH` знаков).
 */
export function DiagnosticsForm({ answers, onChange, options }: DiagnosticsFormProps) {
  const { t, i18n } = useTranslation();

  const select = (field: DiagnosticsField, option: string) => {
    const next: DiagnosticsAnswers = { ...answers, [field]: option };
    if (option !== OTHER_OPTION) delete next[otherKey(field)];
    if (
      field === 'platform' &&
      next.app &&
      !optionsForField('app', next, options).includes(next.app)
    ) {
      delete next.app;
      delete next.app_other;
    }
    onChange(next);
  };

  const label = (field: DiagnosticsField, option: string): string => {
    if (field === 'app' && option !== OTHER_OPTION) return option;
    if (field === 'platform') {
      const name = options.platforms.find((p) => p.id === option)?.name;
      if (name) {
        const lang = i18n?.language?.split('-')[0];
        const localized = (lang && (name[i18n.language] || name[lang])) || name.en;
        const first = Object.values(name)[0];
        if (localized || first) return localized || first;
      }
    }
    return t(`support.form.${field}.${option}`, { defaultValue: option });
  };

  return (
    <div className="space-y-4" data-testid="support-diagnostics-form">
      <p className="text-sm font-medium text-dark-100">{t('support.form.title')}</p>
      {DIAGNOSTICS_ORDER.map((field, index) => (
        <fieldset key={field} className="space-y-2" data-testid={`diagnostics-${field}`}>
          <legend className="label">
            {index + 1}. {t(`support.form.${field}.prompt`)}
          </legend>
          {field === 'app' && !answers.platform && (
            <p className="text-sm text-dark-400" data-testid="diagnostics-app-hint">
              {t('support.form.app.choosePlatformFirst')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {optionsForField(field, answers, options).map((option) => {
              const checked = answers[field] === option;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    checked
                      ? 'border-accent-500 bg-accent-500/20 font-medium text-dark-50 ring-1 ring-accent-500'
                      : 'border-dark-700 bg-dark-800/50 text-dark-300 hover:border-dark-500'
                  }`}
                >
                  <input
                    type="radio"
                    name={`diagnostics-${field}`}
                    value={option}
                    checked={checked}
                    onChange={() => select(field, option)}
                    className="sr-only"
                  />
                  {checked && (
                    <span data-testid="diagnostics-check" aria-hidden="true">
                      <CheckIcon className="h-4 w-4 text-accent-500" />
                    </span>
                  )}
                  {label(field, option)}
                </label>
              );
            })}
          </div>
          {hasOther(field) && answers[field] === OTHER_OPTION && (
            <input
              type="text"
              className="input"
              aria-label={t(`support.form.${field}.otherLabel`)}
              placeholder={t('support.form.otherPlaceholder')}
              maxLength={OTHER_MAX_LENGTH}
              value={answers[otherKey(field)] ?? ''}
              onChange={(e) => onChange({ ...answers, [otherKey(field)]: e.target.value })}
            />
          )}
        </fieldset>
      ))}
    </div>
  );
}
