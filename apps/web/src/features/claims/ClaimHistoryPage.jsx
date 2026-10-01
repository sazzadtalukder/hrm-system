import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getClaimHistory } from './api.js';

const when = (value) => (value ? new Date(value).toLocaleString() : '—');
export function ClaimHistoryPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['claim-history', id], queryFn: () => getClaimHistory(id) });
  if (q.isPending) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">State history</h2>
        {!q.data.states.length ? (
          <EmptyState message="No state history found." />
        ) : (
          <ol className="mt-3 divide-y">
            {q.data.states.map((event) => (
              <li className="py-3" key={event.id}>
                <p className="font-medium">
                  {event.from_state?.replaceAll('_', ' ') ?? 'Created'} →{' '}
                  {event.to_state.replaceAll('_', ' ')}
                </p>
                <p className="text-sm text-secondary">
                  Workflow {event.workflow_version} · Actor user #{event.acting_user_id} ·{' '}
                  {when(event.occurred_at)}
                </p>
                <p className="text-sm">Reason: {event.reason}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h2 className="font-semibold">Approval decisions</h2>
          <ul className="mt-3 divide-y">
            {q.data.decisions.map((decision) => (
              <li className="py-3" key={decision.id}>
                <p className="font-medium">{decision.decision}</p>
                <p className="text-sm text-secondary">
                  Actor user #{decision.acting_user_id} · workflow {decision.workflow_version} ·{' '}
                  {when(decision.decided_at)}
                </p>
                <p className="text-sm">Reason: {decision.reason}</p>
              </li>
            ))}
            {!q.data.decisions.length && <li className="py-3 text-secondary">No decisions yet.</li>}
          </ul>
        </section>
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h2 className="font-semibold">Payment</h2>
          {q.data.payment ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-secondary">Reference</dt>
              <dd>{q.data.payment.payment_reference}</dd>
              <dt className="text-secondary">Date</dt>
              <dd>{String(q.data.payment.payment_date).slice(0, 10)}</dd>
              <dt className="text-secondary">Amount</dt>
              <dd>
                {q.data.payment.paid_amount} {q.data.payment.currency_code}
              </dd>
              <dt className="text-secondary">Recorded by</dt>
              <dd>User #{q.data.payment.recorded_by}</dd>
              <dt className="text-secondary">Reason</dt>
              <dd>{q.data.payment.reason}</dd>
            </dl>
          ) : (
            <p className="mt-3 text-secondary">No payment recorded.</p>
          )}
        </section>
      </div>
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Immutable claim versions</h2>
        <ul className="mt-3 divide-y">
          {q.data.versions.map((version) => (
            <li className="py-3" key={version.id}>
              <p className="font-medium">
                Version {version.version_number}: {version.title}
              </p>
              <p className="text-sm text-secondary">
                {version.total_amount} {version.currency_code} · created {when(version.created_at)}
              </p>
              <p className="text-sm">Change reason: {version.change_reason}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
