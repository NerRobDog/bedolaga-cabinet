import { useTranslation } from 'react-i18next';
import { getTrialReasonText } from '../../utils/trialReasons';

interface TrialUnavailableNoticeProps {
  reason: string | null | undefined;
}

/** Объяснение, почему триал не предложен. Для неизвестных причин (свободный текст) молчит. */
export default function TrialUnavailableNotice({ reason }: TrialUnavailableNoticeProps) {
  const { t } = useTranslation();
  const text = getTrialReasonText(reason, t);
  if (!text) return null;

  return (
    <p className="rounded-2xl border border-dark-700 p-3 text-center text-sm text-dark-400">
      {text}
    </p>
  );
}
