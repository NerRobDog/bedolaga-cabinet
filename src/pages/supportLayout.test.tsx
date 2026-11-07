// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Support from './Support';

const ticket = {
  id: 7,
  title: 'Old ticket',
  status: 'answered',
  priority: 'normal',
  updated_at: '2026-11-07T12:00:00Z',
  created_at: '2026-11-07T11:00:00Z',
  messages: [],
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../api/info', () => ({
  infoApi: {
    getSupportConfig: async () => ({
      tickets_enabled: true,
      ticket_form_required: true,
      support_type: 'both',
      support_username: '@support',
      support_url: 'https://t.me/support',
      contact_is_telegram: true,
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
    getTickets: async () => ({ items: [ticket] }),
    getTicket: async () => ticket,
    uploadMedia: vi.fn(),
    createTicket: vi.fn(),
    addMessage: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Support />
    </QueryClientProvider>,
  );
}

const before = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

it('keeps the create form closed until New ticket is pressed', async () => {
  renderPage();
  const button = await screen.findByRole('button', { name: 'support.newTicket' });
  await screen.findByText('Old ticket');
  expect(screen.queryByTestId('support-diagnostics-form')).toBeNull();
  fireEvent.click(button);
  expect(await screen.findByTestId('support-diagnostics-form')).toBeTruthy();
});

it('orders the page: create form, then the ticket list, then the direct contact', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'support.newTicket' }));
  const form = await screen.findByTestId('support-diagnostics-form');
  const list = screen.getByText('support.yourTickets');
  const contact = await screen.findByText('support.contactUs');
  expect(before(form, list)).toBe(true);
  expect(before(list, contact)).toBe(true);
});

it('scrolls the opened ticket into view when it sits above the list (phone layout)', async () => {
  const scroll = vi.fn();
  const proto = Element.prototype as unknown as { scrollIntoView: unknown };
  const orig = proto.scrollIntoView;
  proto.scrollIntoView = scroll;
  try {
    renderPage();
    const item = await screen.findByText('Old ticket');
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({ top: -400, bottom: 200 }) as DOMRect;
    try {
      fireEvent.click(item);
      await waitFor(() => expect(scroll).toHaveBeenCalled());
    } finally {
      Element.prototype.getBoundingClientRect = rect;
    }
  } finally {
    proto.scrollIntoView = orig;
  }
});
