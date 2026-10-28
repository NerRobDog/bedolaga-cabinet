// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { TrialInfo } from '../../types';
import TrialOfferCard from './TrialOfferCard';
import TrialUnavailableNotice from './TrialUnavailableNotice';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: true }) }));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ formatAmount: String, currencySymbol: '₽' }),
}));

afterEach(cleanup);

const base: TrialInfo = {
  is_available: true,
  duration_days: 3,
  traffic_limit_gb: 10,
  device_limit: 2,
  requires_payment: false,
  price_kopeks: 0,
  price_rubles: 0,
  reason_unavailable: null,
};

function renderCard(info: TrialInfo) {
  render(
    <MemoryRouter>
      <TrialOfferCard
        trialInfo={info}
        balanceKopeks={0}
        balanceRubles={0}
        activateTrialMutation={{ isPending: false, mutate: vi.fn() } as never}
        trialError={null}
      />
    </MemoryRouter>,
  );
}

it('shows a lite trial in hours with limits and the Telegram note', () => {
  renderCard({ ...base, kind: 'lite', duration_days: 1, duration_hours: 24 });
  expect(screen.getByText('24')).toBeTruthy();
  expect(screen.getByText('subscription.trial.hours')).toBeTruthy();
  expect(screen.queryByText('subscription.trial.days')).toBeNull();
  expect(screen.getByText('10')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('subscription.trial.liteNote')).toBeTruthy();
});

it('keeps a full trial in days without the lite note', () => {
  renderCard({ ...base, kind: 'full' });
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('subscription.trial.days')).toBeTruthy();
  expect(screen.queryByText('subscription.trial.liteNote')).toBeNull();
});

it('treats a backend without kind as a full trial', () => {
  renderCard(base);
  expect(screen.getByText('subscription.trial.days')).toBeTruthy();
  expect(screen.queryByText('subscription.trial.liteNote')).toBeNull();
});

it.each(['daily_limit_reached', 'ip_limit_reached', 'identity_already_used', 'not_available'])(
  'notice explains %s',
  (code) => {
    render(<TrialUnavailableNotice reason={code} />);
    expect(screen.getByText(`subscription.trial.reason.${code}`)).toBeTruthy();
  },
);

it('notice stays silent for legacy free-text reasons', () => {
  const { container } = render(<TrialUnavailableNotice reason="Trial already used" />);
  expect(container.textContent).toBe('');
});
