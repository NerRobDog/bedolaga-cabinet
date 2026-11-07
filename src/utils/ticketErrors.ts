import axios from 'axios';

/**
 * true, если бэк отказал в создании тикета из-за уже открытого обращения.
 *
 * `POST /cabinet/tickets` отвечает 409 ровно в одном случае — у пользователя
 * есть незакрытый тикет (`detail: 'You already have an open ticket'`, паритет
 * с бот-путём). Сверяемся со статусом, а не с текстом: detail приходит с бэка
 * только по-английски, а кабинет и бот версионируются раздельно — текст может
 * поменяться в любой сборке бота, статус останется.
 */
export function isOpenTicketConflict(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

/**
 * true, если бэк отклонил создание тикета валидацией 422 именно по полю
 * `diagnostics` (FastAPI: `detail[].loc == ['body', 'diagnostics']`). Нужно,
 * когда support-config не загрузился и кабинет не знал, что анкета обязательна.
 */
export function isDiagnosticsRequired(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 422) return false;
  const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
  if (!Array.isArray(detail)) return false;
  return detail.some((item) => {
    const loc = (item as { loc?: unknown } | null)?.loc;
    return Array.isArray(loc) && loc[0] === 'body' && loc[1] === 'diagnostics';
  });
}
