// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Support from './Support';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  config: vi.fn(),
}));
const ticket = {
  id: 1,
  title: 'VPN',
  status: 'open',
  updated_at: '2026-11-07T12:00:00Z',
  messages: [],
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../api/info', () => ({ infoApi: { getSupportConfig: api.config } }));
vi.mock('@/platform', () => ({
  usePlatform: () => ({
    haptic: { impact: vi.fn() },
    openLink: vi.fn(),
    openTelegramLink: vi.fn(),
  }),
}));
vi.mock('../api/tickets', () => ({
  ticketsApi: {
    getTickets: async () => ({ items: [] }),
    getTicket: async () => ticket,
    uploadMedia: vi.fn(),
    createTicket: api.create,
    addMessage: vi.fn(),
  },
}));

// Rate limiter lives in module memory; move the clock past its 60s window per test.
let clock = Date.now();
beforeEach(() => {
  clock += 120_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  vi.clearAllMocks();
  localStorage.clear();
  api.create.mockResolvedValue(ticket);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderSupport = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Support />
    </QueryClientProvider>,
  );

const fill = () => {
  fireEvent.change(screen.getByLabelText('support.subject'), { target: { value: 'VPN' } });
  fireEvent.change(screen.getByLabelText('support.message'), {
    target: { value: 'Does not connect at all' },
  });
};

const pick = (value: string) =>
  fireEvent.click(document.querySelector<HTMLInputElement>(`input[value="${value}"]`)!);

function error422(loc: unknown[]) {
  const err = new AxiosError('Unprocessable', 'ERR_BAD_REQUEST');
  err.response = {
    status: 422,
    data: { detail: [{ loc, msg: 'field required', type: 'missing' }] },
    statusText: '',
    headers: {},
    config: {} as never,
  };
  return err;
}

it('offers no ticket creation while support-config is loading', async () => {
  api.config.mockReturnValue(new Promise(() => {}));
  renderSupport();
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('button', { name: 'support.newTicket' })).toBeNull();
  expect(document.querySelector('button[type=submit]')).toBeNull();
});

it('allows creation without the form when support-config failed', async () => {
  api.config.mockRejectedValue(new Error('boom'));
  renderSupport();
  fireEvent.click(await screen.findByRole('button', { name: 'support.newTicket' }));
  expect(screen.queryByTestId('support-diagnostics-form')).toBeNull();
  fill();
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith('VPN', 'Does not connect at all', undefined, undefined),
  );
});

it('shows the form on a diagnostics 422 and resubmits with diagnostics', async () => {
  api.config.mockRejectedValue(new Error('boom'));
  api.create.mockRejectedValueOnce(error422(['body', 'diagnostics']));
  renderSupport();
  fireEvent.click(await screen.findByRole('button', { name: 'support.newTicket' }));
  fill();
  fireEvent.submit(document.querySelector('form')!);
  await screen.findByTestId('support-diagnostics-form');
  expect(screen.getByText('support.form.requiredByServer')).toBeTruthy();
  const submit = document.querySelector<HTMLButtonElement>('button[type=submit]')!;
  expect(submit.disabled).toBe(true);
  for (const value of ['abroad', 'ios', 'Happ', 'wifi', 'slow', 'today']) pick(value);
  expect(submit.disabled).toBe(false);
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
  expect(api.create.mock.calls[1][3]).toMatchObject({
    location: 'abroad',
    platform: 'ios',
    app: 'Happ',
  });
});

it('does not treat a 422 on another field as a diagnostics request', async () => {
  api.config.mockRejectedValue(new Error('boom'));
  api.create.mockRejectedValueOnce(error422(['body', 'title']));
  renderSupport();
  fireEvent.click(await screen.findByRole('button', { name: 'support.newTicket' }));
  fill();
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByTestId('support-diagnostics-form')).toBeNull();
});
