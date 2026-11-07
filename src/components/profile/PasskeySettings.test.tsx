// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

/**
 * Раздел «Passkey» в способах входа: список, переименование, удаление с подтверждением,
 * добавление, резервные коды. Ошибка last_login_method — читаемым текстом.
 */

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  list: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  getRecoveryCodesStatus: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  registerPasskey: vi.fn(),
  showToast: vi.fn(),
  isWebAuthnSupported: vi.fn(),
  isInTelegramWebApp: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: 'ru' },
  }),
}));
vi.mock('@/platform', () => ({ usePlatform: () => ({ haptic: { impact: vi.fn() } }) }));
vi.mock('../Toast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../../api/branding', () => ({ getCachedBranding: () => ({ name: 'Test Cabinet' }) }));
vi.mock('../../api/passkey', () => ({
  passkeyApi: {
    getStatus: mocks.getStatus,
    list: mocks.list,
    rename: mocks.rename,
    remove: mocks.remove,
    getRecoveryCodesStatus: mocks.getRecoveryCodesStatus,
    regenerateRecoveryCodes: mocks.regenerateRecoveryCodes,
  },
}));
vi.mock('../../utils/passkeyCeremony', () => ({ registerPasskey: mocks.registerPasskey }));
vi.mock('../../utils/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/webauthn')>()),
  isWebAuthnSupported: mocks.isWebAuthnSupported,
}));
vi.mock('../../hooks/useTelegramSDK', () => ({ isInTelegramWebApp: mocks.isInTelegramWebApp }));

import { PasskeyCeremonyError } from '../../utils/webauthn';
import PasskeySettings from './PasskeySettings';

const MACBOOK = {
  id: 1,
  name: 'MacBook',
  device_type: 'multi_device',
  backed_up: true,
  transports: ['internal', 'hybrid'],
  created_at: '2026-10-01T10:00:00Z',
  last_used_at: '2026-10-20T10:00:00Z',
};
const KEY = {
  id: 2,
  name: 'YubiKey',
  device_type: 'single_device',
  backed_up: false,
  transports: ['usb'],
  created_at: '2026-10-02T10:00:00Z',
  last_used_at: null,
};
const NEW_CODES = ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'];

function apiError(status: number, detail: unknown): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    config,
    {},
    {
      status,
      statusText: '',
      headers,
      config,
      data: { detail },
    },
  );
}

let client: QueryClient;

function renderSettings(props: { recoveryLogin?: boolean } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PasskeySettings {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.isWebAuthnSupported.mockReturnValue(true);
  mocks.isInTelegramWebApp.mockReturnValue(false);
  mocks.getStatus.mockResolvedValue({ enabled: true, signup_enabled: false });
  mocks.list.mockResolvedValue({ passkeys: [MACBOOK, KEY], limit: 10 });
  mocks.getRecoveryCodesStatus.mockResolvedValue({ remaining: 8, total: 8 });
});

afterEach(() => {
  cleanup();
  client?.clear();
});

const addButton = () =>
  screen.getByRole('button', { name: 'passkey.settings.add' }) as HTMLButtonElement;

describe('список', () => {
  it('показывает ключи с типом устройства и датами', async () => {
    renderSettings();

    expect(await screen.findByText('MacBook')).toBeTruthy();
    expect(screen.getByText('YubiKey')).toBeTruthy();
    expect(screen.getByText(/passkey\.settings\.deviceSynced/)).toBeTruthy();
    expect(screen.getByText(/passkey\.settings\.deviceSingle/)).toBeTruthy();
    expect(screen.getAllByText(/passkey\.settings\.createdAt/)).toHaveLength(2);
    // У YubiKey входов ещё не было.
    expect(screen.getByText(/passkey\.settings\.neverUsed/)).toBeTruthy();
  });

  it('passkey выключен на бэке: раздел не рисуется', async () => {
    mocks.getStatus.mockResolvedValue({ enabled: false, signup_enabled: false });
    const { container } = renderSettings();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(container.querySelector('section')).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('пусто: подсказка', async () => {
    mocks.list.mockResolvedValue({ passkeys: [], limit: 10 });
    renderSettings();
    expect(await screen.findByText('passkey.settings.empty')).toBeTruthy();
  });
});

describe('удаление', () => {
  it('сначала подтверждение, запрос только после него', async () => {
    mocks.remove.mockResolvedValue({ success: true });
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(screen.getByRole('button', { name: 'common.delete: MacBook' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/passkey\.settings\.deleteConfirm/)).toBeTruthy();

    // Подтверждающая «Удалить» — внутри плашки подтверждения.
    const confirmBox = screen.getByText(/passkey\.settings\.deleteConfirm/)
      .parentElement as HTMLElement;
    fireEvent.click(within(confirmBox).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith({
        type: 'success',
        message: 'passkey.settings.deleted',
      }),
    );
  });

  it('«Отмена» закрывает подтверждение без запроса', async () => {
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(screen.getByRole('button', { name: 'common.delete: MacBook' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText(/passkey\.settings\.deleteConfirm/)).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('last_login_method: читаемое сообщение, ключ остаётся в списке', async () => {
    mocks.remove.mockRejectedValue(
      apiError(400, {
        code: 'last_login_method',
        message: 'Cannot delete the last way to sign in',
      }),
    );
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(screen.getByRole('button', { name: 'common.delete: MacBook' }));
    const confirmBox = screen.getByText(/passkey\.settings\.deleteConfirm/)
      .parentElement as HTMLElement;
    fireEvent.click(within(confirmBox).getByRole('button', { name: 'common.delete' }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'passkey.errors.lastLoginMethod',
      }),
    );
    expect(screen.getByText('MacBook')).toBeTruthy();
  });
});

describe('переименование', () => {
  it('сохраняет новое имя', async () => {
    mocks.rename.mockResolvedValue({ ...MACBOOK, name: 'Work laptop' });
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(screen.getByRole('button', { name: 'passkey.settings.rename: MacBook' }));
    fireEvent.change(screen.getByLabelText('passkey.settings.renameLabel'), {
      target: { value: '  Work laptop ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith(1, 'Work laptop'));
  });

  it('пустое имя не отправляется', async () => {
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(screen.getByRole('button', { name: 'passkey.settings.rename: MacBook' }));
    fireEvent.change(screen.getByLabelText('passkey.settings.renameLabel'), {
      target: { value: '   ' },
    });

    expect(
      (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it('ошибка сохранения: форма остаётся открытой, чтобы не потерять ввод', async () => {
    mocks.rename.mockRejectedValue(apiError(404, { code: 'passkey_not_found' }));
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(screen.getByRole('button', { name: 'passkey.settings.rename: MacBook' }));
    fireEvent.change(screen.getByLabelText('passkey.settings.renameLabel'), {
      target: { value: 'New' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'passkey.errors.notFound',
      }),
    );
    expect(screen.getByLabelText('passkey.settings.renameLabel')).toBeTruthy();
  });
});

describe('добавление', () => {
  it('запускает церемонию и сообщает об успехе', async () => {
    mocks.registerPasskey.mockResolvedValue(KEY);
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(addButton());

    await waitFor(() => expect(mocks.registerPasskey).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith({
        type: 'success',
        message: 'passkey.settings.added',
      }),
    );
  });

  it('пользователь закрыл окно passkey: молча', async () => {
    mocks.registerPasskey.mockRejectedValue(new PasskeyCeremonyError('cancelled'));
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(addButton());

    await waitFor(() => expect(mocks.registerPasskey).toHaveBeenCalled());
    await act(async () => {});
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('на устройстве уже есть ключ аккаунта: понятное сообщение', async () => {
    mocks.registerPasskey.mockRejectedValue(new PasskeyCeremonyError('already_registered'));
    renderSettings();
    await screen.findByText('MacBook');

    fireEvent.click(addButton());

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'passkey.errors.deviceAlreadyHasKey',
      }),
    );
  });

  it('предел ключей: кнопка закрыта, сказано почему', async () => {
    mocks.list.mockResolvedValue({ passkeys: [MACBOOK, KEY], limit: 2 });
    renderSettings();
    await screen.findByText('MacBook');

    expect(addButton().disabled).toBe(true);
    expect(screen.getByText(/passkey\.settings\.limit/)).toBeTruthy();
  });

  it('браузер без WebAuthn / Telegram WebView: добавить нельзя, список и коды доступны', async () => {
    mocks.isWebAuthnSupported.mockReturnValue(false);
    renderSettings();

    expect(await screen.findByText('MacBook')).toBeTruthy();
    expect(addButton().disabled).toBe(true);
    expect(screen.getByText('passkey.errors.unsupported')).toBeTruthy();
    expect(await screen.findByText('passkey.recoveryCodes.title')).toBeTruthy();
  });
});

describe('вход по резервному коду', () => {
  it('подсказка «добавьте новый passkey» показана и исчезает после добавления', async () => {
    mocks.registerPasskey.mockResolvedValue(KEY);
    renderSettings({ recoveryLogin: true });
    await screen.findByText('MacBook');

    expect(screen.getByText('passkey.recoveryPrompt.title')).toBeTruthy();

    // Две кнопки «Добавить»: в подсказке и в карточке; любая запускает церемонию.
    fireEvent.click(screen.getAllByRole('button', { name: 'passkey.settings.add' })[0]);
    await waitFor(() => expect(mocks.registerPasskey).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('passkey.recoveryPrompt.title')).toBeNull());
  });

  it('без recoveryLogin подсказки нет', async () => {
    renderSettings();
    await screen.findByText('MacBook');
    expect(screen.queryByText('passkey.recoveryPrompt.title')).toBeNull();
  });
});

describe('резервные коды', () => {
  async function openRegenerate() {
    renderSettings();
    await screen.findByText(/passkey\.recoveryCodes\.remaining/);
    fireEvent.click(screen.getByRole('button', { name: 'passkey.recoveryCodes.generate' }));
  }

  it('показывает остаток', async () => {
    mocks.getRecoveryCodesStatus.mockResolvedValue({ remaining: 3, total: 8 });
    renderSettings();
    expect(await screen.findByText(/"remaining":3,"total":8/)).toBeTruthy();
  });

  it('мало кодов: предупреждение', async () => {
    mocks.getRecoveryCodesStatus.mockResolvedValue({ remaining: 1, total: 8 });
    renderSettings();
    expect(await screen.findByText('passkey.recoveryCodes.low')).toBeTruthy();
  });

  it('перевыпуск только после подтверждения', async () => {
    await openRegenerate();

    expect(screen.getByText('passkey.recoveryCodes.confirm')).toBeTruthy();
    expect(mocks.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });

  it('отмена подтверждения ничего не меняет', async () => {
    await openRegenerate();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('passkey.recoveryCodes.confirm')).toBeNull();
    expect(mocks.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });

  it('после подтверждения показывает новые коды один раз и стирает их после «Готово»', async () => {
    mocks.regenerateRecoveryCodes.mockResolvedValue({
      remaining: 2,
      total: 2,
      recovery_codes: NEW_CODES,
    });
    await openRegenerate();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'passkey.recoveryCodes.confirmAction' }));
    });

    for (const code of NEW_CODES) expect(await screen.findByText(code)).toBeTruthy();
    // В кэше запросов — только счётчики, без самих кодов.
    const cached = JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    );
    for (const code of NEW_CODES) expect(cached).not.toContain(code);

    fireEvent.click(screen.getByLabelText('passkey.codes.ack'));
    fireEvent.click(screen.getByRole('button', { name: 'passkey.recoveryCodes.done' }));

    await waitFor(() => expect(screen.queryByText(NEW_CODES[0])).toBeNull());
    expect(screen.getByText('passkey.recoveryCodes.title')).toBeTruthy();
  });

  it('429: сообщение «слишком часто», коды не показываются', async () => {
    mocks.regenerateRecoveryCodes.mockRejectedValue(apiError(429, 'Too many requests'));
    await openRegenerate();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'passkey.recoveryCodes.confirmAction' }));
    });

    expect(mocks.showToast).toHaveBeenCalledWith({
      type: 'error',
      message: 'passkey.errors.tooMany',
    });
    expect(screen.queryByText(NEW_CODES[0])).toBeNull();
  });

  it('кодов нет вовсе: создаёт сразу, без подтверждения (нечего инвалидировать)', async () => {
    mocks.getRecoveryCodesStatus.mockResolvedValue({ remaining: 0, total: 0 });
    mocks.regenerateRecoveryCodes.mockResolvedValue({
      remaining: 2,
      total: 2,
      recovery_codes: NEW_CODES,
    });
    renderSettings();
    await screen.findByText('passkey.recoveryCodes.empty');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'passkey.recoveryCodes.generate' }));
    });

    expect(mocks.regenerateRecoveryCodes).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(NEW_CODES[0])).toBeTruthy();
  });
});
