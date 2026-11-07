import { useTranslation } from 'react-i18next';
import {
  DIAGNOSTICS_FIELDS,
  DIAGNOSTICS_ORDER,
  OTHER_MAX_LENGTH,
  OTHER_OPTION,
  hasOther,
  otherKey,
  type DiagnosticsAnswers,
  type DiagnosticsField,
} from '@/utils/ticketDiagnostics';

interface DiagnosticsFormProps {
  answers: DiagnosticsAnswers;
  onChange: (answers: DiagnosticsAnswers) => void;
}

/**
 * Пять обязательных вопросов перед обращением. Тексты — `support.form.<поле>.*`.
 * «Другое» открывает короткое текстовое поле (до `OTHER_MAX_LENGTH` знаков).
 */
export function DiagnosticsForm({ answers, onChange }: DiagnosticsFormProps) {
  const { t } = useTranslation();

  const select = (field: DiagnosticsField, option: string) => {
    const next: DiagnosticsAnswers = { ...answers, [field]: option };
    if (option !== OTHER_OPTION) delete next[otherKey(field)];
    onChange(next);
  };

  return (
    <div className="space-y-4" data-testid="support-diagnostics-form">
      <p className="text-sm font-medium text-dark-100">{t('support.form.title')}</p>
      {DIAGNOSTICS_ORDER.map((field, index) => (
        <fieldset key={field} className="space-y-2" data-testid={`diagnostics-${field}`}>
          <legend className="label">
            {index + 1}. {t(`support.form.${field}.prompt`)}
          </legend>
          <div className="flex flex-wrap gap-2">
            {DIAGNOSTICS_FIELDS[field].map((option) => {
              const checked = answers[field] === option;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    checked
                      ? 'border-accent-500 bg-accent-500/10 text-dark-50'
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
                  {t(`support.form.${field}.${option}`)}
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
