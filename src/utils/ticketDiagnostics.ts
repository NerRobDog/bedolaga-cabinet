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

/** Схлопнутые пробелы, не длиннее лимита бэка. */
function normalizeOther(raw: string | undefined): string {
  const text = (raw ?? '').split(/\s+/).filter(Boolean).join(' ');
  return Array.from(text).slice(0, OTHER_MAX_LENGTH).join('').trim();
}

/** Отвечено ли поле вариантом из списка; «Другое» требует непустой текст (как на бэке). */
function isAnswered(answers: DiagnosticsAnswers, field: DiagnosticsField): boolean {
  const value = answers[field];
  if (typeof value !== 'string' || !(DIAGNOSTICS_FIELDS[field] as readonly string[]).includes(value)) {
    return false;
  }
  return value !== OTHER_OPTION || normalizeOther(answers[otherKey(field)]) !== '';
}

/** Номера вопросов (с 1), на которые ещё нет ответа — для подсказки у кнопки «Отправить». */
export function missingDiagnosticsQuestions(answers: DiagnosticsAnswers): number[] {
  return DIAGNOSTICS_ORDER.flatMap((field, index) => (isAnswered(answers, field) ? [] : [index + 1]));
}

/**
 * Все пять полей отвечены вариантом из списка; «Другое» требует непустой текст
 * (как `validate_diagnostics` на бэке).
 */
export function isDiagnosticsComplete(answers: DiagnosticsAnswers): boolean {
  return missingDiagnosticsQuestions(answers).length === 0;
}

/**
 * Тело `diagnostics` для запроса: только id вариантов, текст «Другое» — когда
 * «Другое» выбрано (текст обязателен, см. `isDiagnosticsComplete`).
 * Для неполной анкеты — `null`.
 */
export function buildDiagnostics(answers: DiagnosticsAnswers): Record<string, string> | null {
  if (!isDiagnosticsComplete(answers)) return null;
  const out: Record<string, string> = {};
  for (const field of DIAGNOSTICS_ORDER) {
    const value = answers[field] as string;
    out[field] = value;
    if (value === OTHER_OPTION) {
      out[otherKey(field)] = normalizeOther(answers[otherKey(field)]);
    }
  }
  return out;
}
