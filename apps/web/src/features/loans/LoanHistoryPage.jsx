import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { getLoanHistory } from './api.js';

const when = (value) => (value ? new Date(value).toLocaleString() : '—');

export function LoanHistoryPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['loan-history', id], queryFn: () => getLoanHistory(id) });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const history = query.data;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="text-xl font-semibold">Loan workflow history</h2>
        <p className="mt-1 text-secondary">Append-only application states and decisions.</p>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">State transitions</h3>
          {!history.states.length ? (
            <EmptyState />
          ) : (
            <ol className="mt-3 space-y-3">
              {history.states.map((event) => (
                <li className="rounded border border-subtle p-3" key={event.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{event.from_state?.replaceAll('_', ' ') ?? 'Created'}</span>
                    <span aria-hidden="true">→</span>
                    <StatusBadge status={event.to_state} />
                  </div>
                  <p className="mt-1 text-sm text-secondary">
                    {when(event.created_at)} · Actor user #{event.acting_user_id}
                  </p>
                  {event.reason && <p className="mt-1 text-sm">Reason: {event.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">Approval decisions</h3>
          {!history.decisions.length ? (
            <EmptyState />
          ) : (
            <ol className="mt-3 space-y-3">
              {history.decisions.map((decision) => (
                <li className="rounded border border-subtle p-3" key={decision.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge status={decision.decision} />
                    <span className="text-sm">Workflow version {decision.workflow_version}</span>
                  </div>
                  <p className="mt-1 text-sm text-secondary">
                    {when(decision.created_at)} · Actor user #{decision.acting_user_id}
                  </p>
                  {decision.reason && <p className="mt-1 text-sm">Reason: {decision.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h3 className="font-semibold">Application versions</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Version</th>
                <th className="p-2">Principal</th>
                <th className="p-2">Term</th>
                <th className="p-2">Manager snapshot</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {history.versions.map((version) => (
                <tr className="border-t border-subtle" key={version.id}>
                  <td className="p-2">{version.version_number}</td>
                  <td className="p-2">
                    {version.requested_principal} {version.currency_code}
                  </td>
                  <td className="p-2">{version.requested_term_months} months</td>
                  <td className="p-2">User #{version.manager_user_id_snapshot ?? '—'}</td>
                  <td className="p-2">{when(version.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
