// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TicketAssistCard } from './TicketAssistCard';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  send: vi.fn(),
  skip: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/api/admin', () => ({
  adminApi: {
    getTicketAssist: api.get,
    sendAssistDraft: api.send,
    skipAssist: api.skip,
  },
}));

const CARD = {
  id: 5,
  created_at: '2026-11-07T12:00:00Z',
  status: 'pending',
  decided: false,
  no_model: false,
  facts: [{ icon: '📱', text: 'iPhone, Happ' }],
  cause: 'Expired subscription',
  owner_action: 'Check the panel',
  ask_client: ['Which city?', 'Which Wi-Fi?'],
  draft: 'Please re-import the link',
};
const assist = (over: Record<string, unknown> = {}, card: Record<string, unknown> | null = {}) => ({
  card: card === null ? null : { ...CARD, ...card },
  can_send: true,
  diagnostics: null,
  ...over,
});

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.send.mockResolvedValue({ status: 'sent' });
  api.skip.mockResolvedValue({ status: 'skipped' });
});
afterEach(cleanup);

const renderCard = () =>
  render(
    <QueryClientProvider client={client}>
      <TicketAssistCard ticketId={9} />
    </QueryClientProvider>,
  );
const btn = (name: string) =>
  screen.queryByRole('button', { name: `admin.tickets.assist.${name}` });

it('renders all sections of the card', async () => {
  api.get.mockResolvedValue(assist());
  renderCard();
  expect(await screen.findByText('admin.tickets.assist.title')).toBeTruthy();
  expect(screen.getByText('📱')).toBeTruthy();
  expect(screen.getByText('iPhone, Happ')).toBeTruthy();
  for (const key of ['cause', 'ownerAction', 'askClient', 'draft']) {
    expect(screen.getByText(`admin.tickets.assist.${key}`)).toBeTruthy();
  }
  expect(screen.getByText('Expired subscription')).toBeTruthy();
  expect(screen.getByText('Which Wi-Fi?')).toBeTruthy();
  expect(screen.getByText('Please re-import the link')).toBeTruthy();
  expect(screen.queryByTestId('assist-no-model')).toBeNull();
});

it('hides empty sections', async () => {
  api.get.mockResolvedValue(
    assist({}, { facts: [], cause: null, owner_action: '', ask_client: [], draft: null }),
  );
  renderCard();
  await screen.findByText('admin.tickets.assist.title');
  for (const key of ['cause', 'ownerAction', 'askClient', 'draft']) {
    expect(screen.queryByText(`admin.tickets.assist.${key}`)).toBeNull();
  }
});

it('renders nothing when there is no card and no diagnostics', async () => {
  api.get.mockResolvedValue(assist({}, null));
  const { container } = renderCard();
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(container.innerHTML).toBe('');
});

it('marks no_model cards', async () => {
  api.get.mockResolvedValue(assist({}, { no_model: true }));
  renderCard();
  expect((await screen.findByTestId('assist-no-model')).textContent).toBe(
    'admin.tickets.assist.noModel',
  );
});

it('sends the draft without text and refreshes', async () => {
  api.get.mockResolvedValue(assist());
  const spy = vi.spyOn(client, 'invalidateQueries');
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: 'admin.tickets.assist.send' }));
  await waitFor(() => expect(api.send).toHaveBeenCalledWith(9, 5, undefined));
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['admin-ticket', 9] }));
  expect(spy).toHaveBeenCalledWith({ queryKey: ['admin-ticket-assist', 9] });
});

it('sends the edited text', async () => {
  api.get.mockResolvedValue(assist());
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: 'admin.tickets.assist.edit' }));
  const area = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(area.value).toBe('Please re-import the link');
  fireEvent.change(area, { target: { value: 'Edited reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'admin.tickets.assist.sendEdited' }));
  await waitFor(() => expect(api.send).toHaveBeenCalledWith(9, 5, 'Edited reply'));
});

it('cancel leaves edit mode without calling the API', async () => {
  api.get.mockResolvedValue(assist());
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: 'admin.tickets.assist.edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'admin.tickets.assist.cancel' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(api.send).not.toHaveBeenCalled();
});

it('skips the card', async () => {
  api.get.mockResolvedValue(assist());
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: 'admin.tickets.assist.skip' }));
  await waitFor(() => expect(api.skip).toHaveBeenCalledWith(9, 5));
});

it('hides send and edit when can_send is false, keeps skip', async () => {
  api.get.mockResolvedValue(assist({ can_send: false }));
  renderCard();
  await screen.findByText('admin.tickets.assist.title');
  expect(btn('send')).toBeNull();
  expect(btn('edit')).toBeNull();
  expect(btn('skip')).not.toBeNull();
});

it('shows a muted decided line and no buttons when decided', async () => {
  api.get.mockResolvedValue(assist({}, { decided: true, status: 'sent' }));
  renderCard();
  expect((await screen.findByTestId('assist-decided')).textContent).toBe(
    'admin.tickets.assist.decided: sent',
  );
  expect(btn('send')).toBeNull();
  expect(btn('edit')).toBeNull();
  expect(btn('skip')).toBeNull();
});

it('shows the backend message on 409', async () => {
  api.get.mockResolvedValue(assist());
  const err = new AxiosError('conflict');
  err.response = { status: 409, data: { detail: 'Already decided' } } as AxiosError['response'];
  api.send.mockRejectedValue(err);
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: 'admin.tickets.assist.send' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Already decided');
});

it('shows the client form block from diagnostics', async () => {
  api.get.mockResolvedValue(
    assist(
      {
        diagnostics: [
          { label: 'Device', value: 'iOS' },
          { label: 'App', value: 'Happ' },
        ],
      },
      null,
    ),
  );
  renderCard();
  const block = await screen.findByTestId('ticket-client-form');
  expect(block.textContent).toContain('admin.tickets.assist.clientForm');
  expect(block.textContent).toContain('Device: iOS');
  expect(block.textContent).toContain('App: Happ');
});
