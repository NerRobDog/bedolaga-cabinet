// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) =>
      options && typeof options === 'object' ? `${key}${JSON.stringify(options)}` : key,
    i18n: { language: 'ru' },
  }),
}));
vi.mock('@/platform', () => ({
  usePlatform: () => ({
    openInvoice: vi.fn(),
    openTelegramLink: vi.fn(),
    openLink: vi.fn(),
    platform: 'web',
  }),
  useHaptic: () => ({ notification: vi.fn(), impact: vi.fn(), selection: vi.fn() }),
}));
vi.mock('../hooks/useCurrency', () => ({
  useCurrency: () => ({
    formatAmount: (v: number) => String(v),
    currencySymbol: '₽',
    convertAmount: (v: number) => v,
    convertToRub: (v: number) => v,
    targetCurrency: 'RUB',
  }),
}));

const method = {
  id: 'sample',
  name: 'Sample',
  description: null,
  min_amount_kopeks: 10000,
  max_amount_kopeks: 10000000,
  is_available: true,
  options: null,
  open_url_direct: false,
};
const getPaymentMethods = vi.fn();
vi.mock('../api/balance', () => ({
  balanceApi: { getPaymentMethods: (...args: unknown[]) => getPaymentMethods(...args) },
}));

import TopUpAmount from './TopUpAmount';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/balance/top-up/sample']}>
        <Routes>
          <Route path="/balance/top-up/:methodId" element={<TopUpAmount />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const hint = (period_days: number, discount_percent = 0, extra = {}) => ({
  period_days,
  discount_percent,
  balance_deducted: true,
  clamped: false,
  ...extra,
});

it('подписывает кнопки периодом и скидкой и объясняет вычет баланса', async () => {
  getPaymentMethods.mockResolvedValue([
    {
      ...method,
      quick_amounts: [25000, 85000],
      quick_amount_hints: [hint(30), hint(90, 10)],
    },
  ]);
  renderPage();

  expect(await screen.findByText(/balance\.quickHint\.days\{"count":30\}$/)).toBeTruthy();
  expect(screen.getByText(/balance\.quickHint\.days\{"count":90\} · −10%/)).toBeTruthy();
  expect(screen.getByText('balance.quickHint.noteMinusBalance{"periods":"30/90"}')).toBeTruthy();
});

it('без вычета баланса пояснение не упоминает баланс', async () => {
  getPaymentMethods.mockResolvedValue([
    {
      ...method,
      quick_amounts: [40000],
      quick_amount_hints: [hint(30, 0, { balance_deducted: false })],
    },
  ]);
  renderPage();

  expect(await screen.findByText('balance.quickHint.note{"periods":"30"}')).toBeTruthy();
});

it('статические суммы и подогнанные под лимит кнопки остаются без подписи', async () => {
  getPaymentMethods.mockResolvedValue([
    {
      ...method,
      quick_amounts: [10000, 30000],
      quick_amount_hints: [hint(30, 0, { clamped: true }), null].slice(0, 1),
    },
  ]);
  renderPage();

  expect(await screen.findByText('100')).toBeTruthy();
  expect(screen.queryByText(/balance\.quickHint/)).toBeNull();
});
