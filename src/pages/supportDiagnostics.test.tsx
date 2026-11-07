// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Support from './Support';

const api = vi.hoisted(() => ({ create: vi.fn(), required: true }));
const ticket = {
  id: 1,
  title: 'VPN',
  status: 'open',
  updated_at: '2026-11-07T12:00:00Z',
  messages: [],
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { list?: string }) => (opts?.list ? `${key}:${opts.list}` : key),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../api/info', () => ({
  infoApi: {
    getSupportConfig: async () => ({
      tickets_enabled: true,
      ticket_form_required: api.required,
    }),
  },
}));
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

beforeEach(() => {
  vi.clearAllMocks();
  api.required = true;
  localStorage.clear();
  api.create.mockResolvedValue(ticket);
});
afterEach(cleanup);

const pick = (value: string) =>
  fireEvent.click(document.querySelector<HTMLInputElement>(`input[value="${value}"]`)!);

async function openForm() {
  const { container } = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Support />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'support.newTicket' }));
  fireEvent.change(screen.getByLabelText('support.subject'), { target: { value: 'VPN' } });
  fireEvent.change(screen.getByLabelText('support.message'), {
    target: { value: 'Does not connect at all' },
  });
  return container;
}

const submit = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('button[type=submit]')!;

it('keeps submit disabled until all five questions are answered', async () => {
  const container = await openForm();
  expect(submit(container).disabled).toBe(true);
  for (const value of ['ios', 'happ', 'wifi', 'slow']) pick(value);
  expect(submit(container).disabled).toBe(true);
  fireEvent.submit(container.querySelector('form')!);
  expect(api.create).not.toHaveBeenCalled();
  pick('today');
  expect(submit(container).disabled).toBe(false);
});

it('sends diagnostics with "other" text in the create request', async () => {
  const container = await openForm();
  pick('other');
  const [otherInput] = screen.getAllByPlaceholderText('support.form.otherPlaceholder');
  fireEvent.change(otherInput, { target: { value: 'Steam Deck' } });
  for (const value of ['happ', 'both', 'no_connect', 'after_update']) pick(value);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith('VPN', 'Does not connect at all', undefined, {
      platform: 'other',
      platform_other: 'Steam Deck',
      app: 'happ',
      network: 'both',
      symptom: 'no_connect',
      since: 'after_update',
    }),
  );
});

it('blocks submit when "other" is chosen without text', async () => {
  const container = await openForm();
  pick('other');
  for (const value of ['happ', 'both', 'no_connect', 'after_update']) pick(value);
  expect(submit(container).disabled).toBe(true);
  fireEvent.submit(container.querySelector('form')!);
  expect(api.create).not.toHaveBeenCalled();
  const [otherInput] = screen.getAllByPlaceholderText('support.form.otherPlaceholder');
  fireEvent.change(otherInput, { target: { value: '   ' } });
  expect(submit(container).disabled).toBe(true);
  fireEvent.change(otherInput, { target: { value: 'Steam Deck' } });
  expect(submit(container).disabled).toBe(false);
});

it('hides the form and sends no diagnostics when the backend flag is off', async () => {
  api.required = false;
  const container = await openForm();
  expect(screen.queryByTestId('support-diagnostics-form')).toBeNull();
  expect(submit(container).disabled).toBe(false);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith('VPN', 'Does not connect at all', undefined, undefined),
  );
});

it('names the unanswered questions next to the disabled submit', async () => {
  await openForm();
  expect(screen.getByTestId('diagnostics-missing').textContent).toBe(
    'support.form.missing:1, 2, 3, 4, 5',
  );
  for (const value of ['ios', 'happ', 'wifi', 'slow']) pick(value);
  expect(screen.getByTestId('diagnostics-missing').textContent).toBe('support.form.missing:5');
  pick('today');
  expect(screen.queryByTestId('diagnostics-missing')).toBeNull();
});

it('marks the chosen option with a check, not only a border', async () => {
  await openForm();
  pick('happ');
  const chosen = document.querySelector('input[value="happ"]')!.closest('label')!;
  const other = document.querySelector('input[value="clash_mi"]')!.closest('label')!;
  expect(chosen.querySelector('[data-testid="diagnostics-check"]')).not.toBeNull();
  expect(other.querySelector('[data-testid="diagnostics-check"]')).toBeNull();
});

it('scrolls the form into view when it opens below the fold', async () => {
  const scroll = vi.fn();
  const proto = Element.prototype as unknown as {
    scrollIntoView: unknown;
    getBoundingClientRect: () => DOMRect;
  };
  const origScroll = proto.scrollIntoView;
  const origRect = proto.getBoundingClientRect;
  proto.scrollIntoView = scroll;
  proto.getBoundingClientRect = () => ({ top: 2000, bottom: 2600 }) as DOMRect;
  try {
    await openForm();
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  } finally {
    proto.scrollIntoView = origScroll;
    proto.getBoundingClientRect = origRect;
  }
});

it('does not scroll when the form is already in view', async () => {
  const scroll = vi.fn();
  const proto = Element.prototype as unknown as { scrollIntoView: unknown };
  const orig = proto.scrollIntoView;
  proto.scrollIntoView = scroll;
  try {
    await openForm();
    await new Promise((r) => setTimeout(r, 50));
    expect(scroll).not.toHaveBeenCalled();
  } finally {
    proto.scrollIntoView = orig;
  }
});
