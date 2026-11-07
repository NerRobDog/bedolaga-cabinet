// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Support from './Support';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  required: true,
  lang: 'ru',
  options: undefined as unknown,
}));
const ticket = {
  id: 1,
  title: 'VPN',
  status: 'open',
  updated_at: '2026-11-07T12:00:00Z',
  messages: [],
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { list?: string; defaultValue?: string }) =>
      opts?.list
        ? `${key}:${opts.list}`
        : key.includes('ghost')
          ? (opts?.defaultValue ?? key)
          : key,
    i18n: { language: api.lang },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../api/info', () => ({
  infoApi: {
    getSupportConfig: async () => ({
      tickets_enabled: true,
      ticket_form_required: api.required,
      ticket_form_options: api.options,
    }),
  },
}));
vi.mock('../utils/rateLimit', async (orig) => ({
  ...(await orig<typeof import('../utils/rateLimit')>()),
  checkRateLimit: () => true,
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

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  api.required = true;
  api.lang = 'ru';
  api.options = undefined;
  localStorage.clear();
  api.create.mockResolvedValue(ticket);
});
afterEach(cleanup);

const pick = (value: string) =>
  fireEvent.click(document.querySelector<HTMLInputElement>(`input[value="${value}"]`)!);

async function openForm() {
  const { container } = render(
    <QueryClientProvider client={queryClient}>
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

it('keeps submit disabled until all six questions are answered', async () => {
  const container = await openForm();
  expect(submit(container).disabled).toBe(true);
  for (const value of ['abroad', 'ios', 'Happ', 'wifi', 'slow']) pick(value);
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
  for (const value of ['russia', 'Happ', 'both', 'no_connect', 'after_update']) pick(value);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith('VPN', 'Does not connect at all', undefined, {
      location: 'russia',
      platform: 'other',
      platform_other: 'Steam Deck',
      app: 'Happ',
      network: 'both',
      symptom: 'no_connect',
      since: 'after_update',
    }),
  );
});

it('blocks submit when "other" is chosen without text', async () => {
  const container = await openForm();
  pick('other');
  for (const value of ['russia', 'Happ', 'both', 'no_connect', 'after_update']) pick(value);
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
    'support.form.missing:1, 2, 3, 4, 5, 6',
  );
  for (const value of ['abroad', 'ios', 'Happ', 'wifi', 'slow']) pick(value);
  expect(screen.getByTestId('diagnostics-missing').textContent).toBe('support.form.missing:6');
  pick('today');
  expect(screen.queryByTestId('diagnostics-missing')).toBeNull();
});

it('marks the chosen option with a check, not only a border', async () => {
  await openForm();
  pick('ios');
  pick('Happ');
  const chosen = document.querySelector('input[value="Happ"]')!.closest('label')!;
  const other = document.querySelector('input[value="Clash Mi"]')!.closest('label')!;
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

const SERVER_OPTIONS = {
  platforms: [
    { id: 'ios', name: { ru: 'айОС', en: 'iOS' } },
    { id: 'android', name: { en: 'Android only en' } },
    { id: 'router', name: null },
    { id: 'other', name: null },
  ],
  apps: { ios: ['Clash Mi', 'Happ'], android: ['FlClashX'], router: ['OpenClash'], other: [] },
  locations: ['russia', 'abroad'],
};
const radio = (value: string) => document.querySelector(`input[value="${value}"]`);
const labelOf = (value: string) => radio(value)!.closest('label')!.textContent;

it('renders platform names from the config, localized, with i18n for null names', async () => {
  api.options = SERVER_OPTIONS;
  await openForm();
  expect(labelOf('ios')).toBe('айОС');
  expect(labelOf('android')).toBe('Android only en');
  expect(labelOf('router')).toBe('support.form.platform.router');
  expect(labelOf('other')).toContain('support.form.platform.other');
  expect(radio('windows')).toBeNull();
});

it('uses the english name when the language is en', async () => {
  api.options = SERVER_OPTIONS;
  api.lang = 'en';
  await openForm();
  expect(labelOf('ios')).toBe('iOS');
});

it('falls back to the static default options when the config has none', async () => {
  await openForm();
  for (const id of ['ios', 'android', 'windows', 'macos', 'router', 'other', 'russia', 'abroad']) {
    expect(radio(id)).not.toBeNull();
  }
  pick('windows');
  for (const app of ['Clash Mi', 'Happ', 'RabbitHole', 'FlClashX'])
    expect(radio(app)).not.toBeNull();
});

it('hides apps before a platform is chosen and lists the platform apps plus other after', async () => {
  api.options = SERVER_OPTIONS;
  await openForm();
  expect(screen.getByTestId('diagnostics-app-hint').textContent).toBe(
    'support.form.app.choosePlatformFirst',
  );
  expect(radio('Happ')).toBeNull();
  pick('android');
  expect(screen.queryByTestId('diagnostics-app-hint')).toBeNull();
  expect(radio('FlClashX')).not.toBeNull();
  expect(radio('Happ')).toBeNull();
  const appOptions = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="diagnostics-app"]'),
  ).map((i) => i.value);
  expect(appOptions).toEqual(['FlClashX', 'other']);
});

it('clears a stale app when the platform changes', async () => {
  api.options = SERVER_OPTIONS;
  const container = await openForm();
  pick('ios');
  pick('Happ');
  expect((radio('Happ') as HTMLInputElement).checked).toBe(true);
  pick('android');
  for (const value of ['russia', 'both', 'slow', 'today']) pick(value);
  expect(screen.getByTestId('diagnostics-missing').textContent).toBe('support.form.missing:3');
  expect(submit(container).disabled).toBe(true);
  pick('FlClashX');
  expect(submit(container).disabled).toBe(false);
});

it('keeps an app that exists in the new platform list', async () => {
  api.options = { ...SERVER_OPTIONS, apps: { ...SERVER_OPTIONS.apps, android: ['Happ'] } };
  await openForm();
  pick('ios');
  pick('Happ');
  pick('android');
  expect((radio('Happ') as HTMLInputElement).checked).toBe(true);
});

it('requires location and sends it with the config app name', async () => {
  api.options = SERVER_OPTIONS;
  const container = await openForm();
  for (const value of ['router', 'OpenClash', 'wifi', 'slow', 'today']) pick(value);
  expect(submit(container).disabled).toBe(true);
  expect(screen.getByTestId('diagnostics-missing').textContent).toBe('support.form.missing:1');
  pick('abroad');
  expect(submit(container).disabled).toBe(false);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith('VPN', 'Does not connect at all', undefined, {
      location: 'abroad',
      platform: 'router',
      app: 'OpenClash',
      network: 'wifi',
      symptom: 'slow',
      since: 'today',
    }),
  );
});

it('sends app_other when the app is other', async () => {
  const container = await openForm();
  for (const value of ['russia', 'android']) pick(value);
  fireEvent.click(document.querySelector('input[name="diagnostics-app"][value="other"]')!);
  const [input] = screen.getAllByPlaceholderText('support.form.otherPlaceholder');
  fireEvent.change(input, { target: { value: 'Streisand' } });
  for (const value of ['wifi', 'slow', 'today']) pick(value);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith(
      'VPN',
      'Does not connect at all',
      undefined,
      expect.objectContaining({ app: 'other', app_other: 'Streisand', platform: 'android' }),
    ),
  );
});

it('shows the raw id for a platform with no name and no i18n text', async () => {
  api.options = { ...SERVER_OPTIONS, platforms: [{ id: 'ghost', name: { ru: '' } }] };
  await openForm();
  expect(labelOf('ghost')).toBe('ghost');
});

it('drops answers missing from options that arrive after the user picked', async () => {
  const container = await openForm();
  pick('windows');
  expect((radio('windows') as HTMLInputElement).checked).toBe(true);
  api.options = SERVER_OPTIONS;
  await queryClient.invalidateQueries({ queryKey: ['support-config'] });
  await waitFor(() => expect(radio('windows')).toBeNull());
  expect(submit(container).disabled).toBe(true);
  expect(screen.getByTestId('diagnostics-missing').textContent).toContain('2');
});
