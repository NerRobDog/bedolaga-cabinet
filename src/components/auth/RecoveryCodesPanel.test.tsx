// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Экран «сохраните резервные коды». Коды показываются ОДИН раз: на сервере остаются
 * только хэши. Поэтому «Продолжить» закрыто, пока человек не подтвердил, что сохранил их,
 * а сами коды нигде, кроме состояния компонента, не оседают.
 */

const { copyToClipboard, downloadTextFile } = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  downloadTextFile: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: 'ru' },
  }),
}));

vi.mock('../../utils/clipboard', () => ({ copyToClipboard }));
vi.mock('../../utils/recoveryCodesFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/recoveryCodesFile')>()),
  downloadTextFile,
}));

import RecoveryCodesPanel from './RecoveryCodesPanel';

const CODES = ['ABCD-EFGH-JKMN-PQRS', '2345-6789-ABCD-EFGH', 'WXYZ-0123-4567-89AB'];

function renderPanel(props: Partial<React.ComponentProps<typeof RecoveryCodesPanel>> = {}) {
  const onContinue = vi.fn();
  render(<RecoveryCodesPanel codes={CODES} appName="Cabinet" onContinue={onContinue} {...props} />);
  return { onContinue };
}

const continueButton = () => screen.getByRole('button', { name: 'passkey.codes.continue' });
const ackCheckbox = () => screen.getByRole('checkbox');

beforeEach(() => {
  copyToClipboard.mockReset().mockResolvedValue(undefined);
  downloadTextFile.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('RecoveryCodesPanel', () => {
  it('показывает все коды', () => {
    renderPanel();
    for (const code of CODES) expect(screen.getByText(code)).toBeTruthy();
  });

  it('«Продолжить» закрыто, пока не отмечено «я сохранил(а)»', () => {
    const { onContinue } = renderPanel();

    const button = continueButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('после подтверждения «Продолжить» открывается и срабатывает один раз', () => {
    const { onContinue } = renderPanel();

    fireEvent.click(ackCheckbox());
    const button = continueButton() as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('снятая галочка снова закрывает «Продолжить»', () => {
    renderPanel();
    fireEvent.click(ackCheckbox());
    fireEvent.click(ackCheckbox());
    expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('пока идёт сохранение сессии (busy), «Продолжить» закрыто даже после галочки', () => {
    renderPanel({ busy: true });
    fireEvent.click(ackCheckbox());
    expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('копирует все коды построчно и сообщает об этом', async () => {
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'passkey.codes.copy' }));
    });

    expect(copyToClipboard).toHaveBeenCalledWith(CODES.join('\n'));
    expect(screen.getByRole('status').textContent).toBe('passkey.codes.copied');
  });

  it('если копирование не удалось, говорит об этом, а не делает вид, что скопировано', async () => {
    copyToClipboard.mockRejectedValue(new Error('denied'));
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'passkey.codes.copy' }));
    });

    expect(screen.getByRole('status').textContent).toBe('passkey.codes.copyFailed');
  });

  it('скачивает .txt со всеми кодами', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'passkey.codes.download' }));

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, text] = downloadTextFile.mock.calls[0] as [string, string];
    expect(filename).toBe('recovery-codes.txt');
    for (const code of CODES) expect(text).toContain(code);
    expect(text).toContain('Cabinet');
  });

  it('если скачать нельзя (WebView), показывает сообщение вместо тихого провала', () => {
    downloadTextFile.mockImplementation(() => {
      throw new Error('blocked');
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'passkey.codes.download' }));

    expect(screen.getByRole('status').textContent).toBe('passkey.codes.downloadFailed');
  });

  it('не кладёт коды ни в localStorage, ни в sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'passkey.codes.copy' }));
    });
    fireEvent.click(ackCheckbox());
    fireEvent.click(continueButton());

    const written = setItem.mock.calls.map(([key, value]) => `${key}=${value}`).join('\n');
    for (const code of CODES) {
      expect(written).not.toContain(code);
      expect(JSON.stringify({ ...localStorage })).not.toContain(code);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(code);
    }
    setItem.mockRestore();
  });

  it('до подтверждения закрытие вкладки спрашивает подтверждение, после — нет', () => {
    renderPanel();

    const early = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(true);

    fireEvent.click(ackCheckbox());
    const late = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(false);
  });

  it('при размонтировании снимает обработчик закрытия вкладки', () => {
    renderPanel();
    cleanup();

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('коды рисуются слева направо даже в RTL-локали (fa)', () => {
    renderPanel();
    expect(screen.getByRole('list').getAttribute('dir')).toBe('ltr');
  });
});
