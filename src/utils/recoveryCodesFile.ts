/**
 * Файл с recovery-кодами для человека: открытый текст, который он кладёт в менеджер паролей
 * или печатает. Сами коды после показа на сервере не восстановить, поэтому файл — основной
 * способ их сохранить. Нигде в браузере (localStorage, sessionStorage, кэш запросов) копия не живёт.
 */

export const RECOVERY_CODES_FILENAME = 'recovery-codes.txt';

interface RecoveryCodesTextInput {
  heading: string;
  /** Подпись сервиса: по ней в куче файлов находят нужный. */
  appName: string;
  note: string;
  codes: readonly string[];
  generatedAt?: Date;
}

export function buildRecoveryCodesText({
  heading,
  appName,
  note,
  codes,
  generatedAt = new Date(),
}: RecoveryCodesTextInput): string {
  const lines = [
    heading,
    `${appName} — ${generatedAt.toISOString().slice(0, 10)}`,
    '',
    ...codes.map((code, index) => `${String(index + 1).padStart(2, ' ')}. ${code}`),
    '',
    note,
    '',
  ];
  return lines.join('\n');
}

/** Скачивает текст файлом. Бросает исключение, если среда этого не умеет (часть WebView). */
export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
    }
  } finally {
    // Браузеру нужно время забрать blob после click().
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
