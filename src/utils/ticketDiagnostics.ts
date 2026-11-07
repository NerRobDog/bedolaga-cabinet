/**
 * Анкета перед обращением в поддержку. Контракт с бэком (`POST /cabinet/tickets`,
 * поле `diagnostics`): id полей и вариантов совпадают с `FORM_FIELDS` из
 * `app/services/support_assist/ticket_form.py`. Тексты вариантов — в i18n
 * `support.form.<поле>.<вариант>`, в запрос уходят только id.
 */

export const DIAGNOSTICS_FIELDS = {
  platform: ['ios', 'android', 'windows', 'macos', 'router', 'other'],
  app: ['clash_mi', 'happ', 'rabbit_hole', 'flclash_x', 'other'],
  network: ['mobile', 'wifi', 'both'],
  symptom: ['nothing', 'specific_site', 'slow', 'no_connect'],
  since: ['today', 'days', 'always', 'after_update'],
} as const;

export type DiagnosticsField = keyof typeof DIAGNOSTICS_FIELDS;

/** Порядок полей = порядок вопросов. */
export const DIAGNOSTICS_ORDER = Object.keys(DIAGNOSTICS_FIELDS) as DiagnosticsField[];

export const OTHER_OPTION = 'other';
/** Лимит бэка на текст «Другое» (`OTHER_MAX_LENGTH`). */
export const OTHER_MAX_LENGTH = 100;

/** Состояние формы: выбранные варианты и тексты «Другое» (`<поле>_other`). */
export type DiagnosticsAnswers = Partial<Record<DiagnosticsField, string>> &
  Partial<Record<`${DiagnosticsField}_other`, string>>;

/** Есть ли у поля вариант «Другое». */
export function hasOther(field: DiagnosticsField): boolean {
  return (DIAGNOSTICS_FIELDS[field] as readonly string[]).includes(OTHER_OPTION);
}

export function otherKey(field: DiagnosticsField): `${DiagnosticsField}_other` {
  return `${field}_other`;
}

/** Все пять полей отвечены вариантом из списка. */
export function isDiagnosticsComplete(answers: DiagnosticsAnswers): boolean {
  return DIAGNOSTICS_ORDER.every((field) => {
    const value = answers[field];
    return (
      typeof value === 'string' && (DIAGNOSTICS_FIELDS[field] as readonly string[]).includes(value)
    );
  });
}

/**
 * Тело `diagnostics` для запроса: только id вариантов, текст «Другое» — когда
 * «Другое» выбрано и текст не пуст (схлопнутые пробелы, не длиннее лимита бэка).
 * Для неполной анкеты — `null`.
 */
export function buildDiagnostics(answers: DiagnosticsAnswers): Record<string, string> | null {
  if (!isDiagnosticsComplete(answers)) return null;
  const out: Record<string, string> = {};
  for (const field of DIAGNOSTICS_ORDER) {
    const value = answers[field] as string;
    out[field] = value;
    if (value === OTHER_OPTION) {
      const text = (answers[otherKey(field)] ?? '').split(/\s+/).filter(Boolean).join(' ');
      const clipped = Array.from(text).slice(0, OTHER_MAX_LENGTH).join('').trim();
      if (clipped) out[otherKey(field)] = clipped;
    }
  }
  return out;
}
