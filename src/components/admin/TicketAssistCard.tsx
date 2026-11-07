import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/api/admin';
import { getApiErrorMessage } from '@/utils/api-error';

interface TicketAssistCardProps {
  ticketId: number;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-dark-400">{title}</div>
      {children}
    </div>
  );
}

/** Разбор ассистента поддержки и анкета клиента для открытого тикета (админка). */
export function TicketAssistCard({ ticketId }: TicketAssistCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-ticket-assist', ticketId],
    queryFn: () => adminApi.getTicketAssist(ticketId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-ticket-assist', ticketId] });
    queryClient.invalidateQueries({ queryKey: ['admin-ticket', ticketId] });
    queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
  };

  const sendMutation = useMutation({
    mutationFn: ({ cardId, body }: { cardId: number; body?: string }) =>
      adminApi.sendAssistDraft(ticketId, cardId, body),
    onSuccess: () => {
      setError(null);
      setEditing(false);
      refresh();
    },
    onError: (err) => setError(getApiErrorMessage(err, t('admin.tickets.assist.sendFailed'))),
  });
  const skipMutation = useMutation({
    mutationFn: (cardId: number) => adminApi.skipAssist(ticketId, cardId),
    onSuccess: () => {
      setError(null);
      setEditing(false);
      refresh();
    },
    onError: (err) => setError(getApiErrorMessage(err, t('admin.tickets.assist.skipFailed'))),
  });

  if (!data) return null;
  const { card, can_send: canSend, diagnostics } = data;
  if (!card && !diagnostics?.length) return null;
  const busy = sendMutation.isPending || skipMutation.isPending;

  return (
    <div className="mb-4 space-y-3" data-testid="ticket-assist">
      {card && (
        <div className="space-y-3 rounded-xl border border-accent-500/20 bg-dark-800/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-dark-100">
              {t('admin.tickets.assist.title')}
            </h3>
            {card.no_model && (
              <span className="text-xs text-dark-400" data-testid="assist-no-model">
                {t('admin.tickets.assist.noModel')}
              </span>
            )}
          </div>
          {card.facts.length > 0 && (
            <ul className="space-y-1 text-sm text-dark-200">
              {card.facts.map((fact, i) => (
                <li key={`${i}-${fact.text}`} className="flex gap-2">
                  <span aria-hidden="true">{fact.icon}</span>
                  <span>{fact.text}</span>
                </li>
              ))}
            </ul>
          )}
          {card.cause && (
            <Section title={t('admin.tickets.assist.cause')}>
              <p className="text-sm text-dark-200">{card.cause}</p>
            </Section>
          )}
          {card.owner_action && (
            <Section title={t('admin.tickets.assist.ownerAction')}>
              <p className="text-sm text-dark-200">{card.owner_action}</p>
            </Section>
          )}
          {card.ask_client.length > 0 && (
            <Section title={t('admin.tickets.assist.askClient')}>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-dark-200">
                {card.ask_client.map((q, i) => (
                  <li key={`${i}-${q}`}>{q}</li>
                ))}
              </ul>
            </Section>
          )}
          {card.draft && (
            <Section title={t('admin.tickets.assist.draft')}>
              {editing ? (
                <textarea
                  className="input min-h-[120px] w-full"
                  aria-label={t('admin.tickets.assist.draft')}
                  value={text}
                  maxLength={4000}
                  onChange={(e) => setText(e.target.value)}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-dark-200">{card.draft}</p>
              )}
            </Section>
          )}
          {error && (
            <p role="alert" className="text-sm text-error-400">
              {error}
            </p>
          )}
          {card.decided ? (
            <p className="text-xs text-dark-400" data-testid="assist-decided">
              {t('admin.tickets.assist.decided')}: {card.status}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canSend && !editing && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => sendMutation.mutate({ cardId: card.id })}
                >
                  {t('admin.tickets.assist.send')}
                </button>
              )}
              {canSend && !editing && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setText(card.draft ?? '');
                    setEditing(true);
                  }}
                >
                  {t('admin.tickets.assist.edit')}
                </button>
              )}
              {canSend && editing && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => sendMutation.mutate({ cardId: card.id, body: text })}
                  >
                    {t('admin.tickets.assist.sendEdited')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    {t('admin.tickets.assist.cancel')}
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => skipMutation.mutate(card.id)}
              >
                {t('admin.tickets.assist.skip')}
              </button>
            </div>
          )}
        </div>
      )}
      {diagnostics && diagnostics.length > 0 && (
        <div
          className="space-y-1 rounded-xl border border-dark-700/30 bg-dark-800/50 p-4"
          data-testid="ticket-client-form"
        >
          <h3 className="text-sm font-semibold text-dark-100">
            {t('admin.tickets.assist.clientForm')}
          </h3>
          <ul className="space-y-0.5 text-sm text-dark-200">
            {diagnostics.map((row, i) => (
              <li key={`${i}-${row.label}`}>
                <span className="text-dark-400">{row.label}:</span> {row.value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
