/**
 * Анкета перед обращением в поддержку. Контракт с бэком (`POST /cabinet/tickets`,
 * поле `diagnostics`). Варианты устройства, приложения и места приходят с бэка
 * (`ticket_form_options` в `/cabinet/info/support-config`, зеркало страницы подписки);
 * у старого бэка берётся статический набор по умолчанию. Остальные поля статичны.
 * Тексты: `support.form.<поле>.<вариант>`; приложения показываются по имени.
 */

import type { SupportConfig, TicketFormOptions } from '../types';

export type { TicketFormOptions };

export const STATIC_FIELDS = {
  network: ['mobile', 'wifi', 'both'],
  symptom: ['nothing', 'specific_site', 'slow', 'no_connect'],
  since: ['today', 'days', 'always', 'after_update'],
} as const;

/** Порядок полей = порядок вопросов. */
export const DIAGNOSTICS_ORDER = [
  'location',
  'platform',
  'app',
  'network',
  'symptom',
  'since',
] as const;

export type DiagnosticsField = (typeof DIAGNOSTICS_ORDER)[number];

export const OTHER_OPTION = 'other';
/** Лимит бэка на текст «Другое» (`OTHER_MAX_LENGTH`). */
export const OTHER_MAX_LENGTH = 100;

const DEFAULT_APPS = ['Clash Mi', 'Happ', 'RabbitHole', 'FlClashX'];
const DEFAULT_PLATFORM_IDS = ['ios', 'android', 'windows', 'macos', 'router', 'other'];

/** Набор по умолчанию, если бэк не прислал `ticket_form_options`. */
export const DEFAULT_TICKET_FORM_OPTIONS: TicketFormOptions = {
  platforms: DEFAULT_PLATFORM_IDS.map((id) => ({ id, name: null })),
  apps: Object.fromEntries(DEFAULT_PLATFORM_IDS.map((id) => [id, DEFAULT_APPS])),
  locations: ['russia', 'abroad'],
};

/** Опции из конфига; пустое или битое поле = набор по умолчанию. */
export function resolveTicketFormOptions(config?: SupportConfig | null): TicketFormOptions {
  const raw = config?.ticket_form_options;
  if (!raw || !Array.isArray(raw.platforms) || raw.platforms.length === 0) {
    return DEFAULT_TICKET_FORM_OPTIONS;
  }
  return {
    platforms: raw.platforms,
    apps: raw.apps ?? {},
    locations:
      Array.isArray(raw.locations) && raw.locations.length > 0
        ? raw.locations
        : DEFAULT_TICKET_FORM_OPTIONS.locations,
  };
}

/** Состояние формы: выбранные варианты и тексты «Другое» (`<поле>_other`). */
export type DiagnosticsAnswers = Partial<Record<DiagnosticsField, string>> &
  Partial<Record<`${DiagnosticsField}_other`, string>>;

/** Есть ли у поля вариант «Другое» (текстом): устройство и приложение. */
export function hasOther(field: DiagnosticsField): boolean {
  return field === 'platform' || field === 'app';
}

export function otherKey(field: DiagnosticsField): `${DiagnosticsField}_other` {
  return `${field}_other`;
}

/** Допустимые значения поля при текущих ответах. Приложения зависят от устройства. */
export function optionsForField(
  field: DiagnosticsField,
  answers: DiagnosticsAnswers,
  options: TicketFormOptions,
): string[] {
  switch (field) {
    case 'location':
      return options.locations;
    case 'platform':
      return options.platforms.map((p) => p.id);
    case 'app': {
      const platform = answers.platform;
      if (!platform) return [];
      const apps = (options.apps[platform] ?? []).filter((a) => a !== OTHER_OPTION);
      return [...apps, OTHER_OPTION];
    }
    default:
      return [...STATIC_FIELDS[field]];
  }
}

/** Схлопнутые пробелы, не длиннее лимита бэка. */
function normalizeOther(raw: string | undefined): string {
  const text = (raw ?? '').split(/\s+/).filter(Boolean).join(' ');
  return Array.from(text).slice(0, OTHER_MAX_LENGTH).join('').trim();
}

/** Отвечено ли поле вариантом из списка; «Другое» требует непустой текст (как на бэке). */
function isAnswered(
  answers: DiagnosticsAnswers,
  field: DiagnosticsField,
  options: TicketFormOptions,
): boolean {
  const value = answers[field];
  if (typeof value !== 'string' || !optionsForField(field, answers, options).includes(value)) {
    return false;
  }
  return (
    !(hasOther(field) && value === OTHER_OPTION) || normalizeOther(answers[otherKey(field)]) !== ''
  );
}

/** Номера вопросов (с 1), на которые ещё нет ответа — для подсказки у кнопки «Отправить». */
export function missingDiagnosticsQuestions(
  answers: DiagnosticsAnswers,
  options: TicketFormOptions = DEFAULT_TICKET_FORM_OPTIONS,
): number[] {
  return DIAGNOSTICS_ORDER.flatMap((field, index) =>
    isAnswered(answers, field, options) ? [] : [index + 1],
  );
}

/**
 * Все поля отвечены вариантом из списка; «Другое» требует непустой текст
 * (как `validate_diagnostics` на бэке).
 */
export function isDiagnosticsComplete(
  answers: DiagnosticsAnswers,
  options: TicketFormOptions = DEFAULT_TICKET_FORM_OPTIONS,
): boolean {
  return missingDiagnosticsQuestions(answers, options).length === 0;
}

/**
 * Тело `diagnostics` для запроса: id устройства, имя приложения (или `other`), текст
 * «Другое» — когда оно выбрано. Для неполной анкеты — `null`.
 */
export function buildDiagnostics(
  answers: DiagnosticsAnswers,
  options: TicketFormOptions = DEFAULT_TICKET_FORM_OPTIONS,
): Record<string, string> | null {
  if (!isDiagnosticsComplete(answers, options)) return null;
  const out: Record<string, string> = {};
  for (const field of DIAGNOSTICS_ORDER) {
    const value = answers[field] as string;
    out[field] = value;
    if (hasOther(field) && value === OTHER_OPTION) {
      out[otherKey(field)] = normalizeOther(answers[otherKey(field)]);
    }
  }
  return out;
}
