import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getBenefitHistory } from './api.js';

export function BenefitHistoryPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['benefits', 'history', id],
    queryFn: () => getBenefitHistory(id),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Enrollment versions</h2>
        {query.data.versions.length === 0 ? (
          <EmptyState message="No enrollment versions found." />
        ) : (
          <ul>
            {query.data.versions.map((version) => (
              <li className="border-t py-3" key={version.id}>
                <p>
                  Version {version.version_number}: {String(version.effective_start).slice(0, 10)} –{' '}
                  {version.effective_end ? String(version.effective_end).slice(0, 10) : 'Open'}
                </p>
                <p className="text-sm text-secondary">
                  {version.history_status} · recorded{' '}
                  {new Date(version.created_at).toLocaleString()} by user {version.created_by}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">State history</h2>
        {query.data.states.length === 0 ? (
          <EmptyState message="No state history found." />
        ) : (
          <ul>
            {query.data.states.map((state) => (
              <li className="border-t py-3" key={state.id}>
                <p>
                  {state.from_state ?? 'Created'} → {state.to_state}
                </p>
                <p className="text-sm">{state.reason}</p>
                <p className="text-sm text-secondary">
                  {new Date(state.occurred_at).toLocaleString()} · user {state.acting_user_id} ·
                  workflow version {state.workflow_version}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
