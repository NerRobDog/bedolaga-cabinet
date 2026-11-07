// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAbroadMode, setAbroadMode } = vi.hoisted(() => ({
  getAbroadMode: vi.fn(),
  setAbroadMode: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/api/subscription', () => ({ subscriptionApi: { getAbroadMode, setAbroadMode } }));

import AbroadModeCard from './AbroadModeCard';

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AbroadModeCard />
    </QueryClientProvider>,
  );
}

describe('AbroadModeCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing when the feature is unavailable', async () => {
    getAbroadMode.mockResolvedValue({ available: false, abroad: false });
    const { container } = renderCard();
    await waitFor(() => expect(getAbroadMode).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('switches mode and shows the refresh hint', async () => {
    getAbroadMode.mockResolvedValue({ available: true, abroad: false });
    setAbroadMode.mockResolvedValue({ available: true, abroad: true, changed: true });
    renderCard();
    fireEvent.click(await screen.findByText('dashboard.abroadMode.abroad'));
    await waitFor(() => expect(setAbroadMode).toHaveBeenCalledWith(true, undefined));
    expect(await screen.findByText('dashboard.abroadMode.currentAbroad')).toBeTruthy();
    expect(screen.getByText('dashboard.abroadMode.hint')).toBeTruthy();
  });

  it('shows an error and keeps the old mode when the server fails', async () => {
    getAbroadMode.mockResolvedValue({ available: true, abroad: false });
    setAbroadMode.mockRejectedValue(new Error('502'));
    renderCard();
    fireEvent.click(await screen.findByText('dashboard.abroadMode.abroad'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('dashboard.abroadMode.currentHome')).toBeTruthy();
  });
});
