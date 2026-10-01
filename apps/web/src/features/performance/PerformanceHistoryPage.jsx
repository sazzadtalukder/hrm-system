import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { getPerformanceHistory } from './api.js';

const when = (value) => (value ? new Date(value).toLocaleString() : '—');

export function PerformanceHistoryPage({ view = 'all' }) {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['performance-history', id, view],
    queryFn: () => getPerformanceHistory(id, view),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const history = query.data;
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Performance review history</h2>
      <section className="rounded-lg border border-subtle bg-surface p-5">
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
                  {when(event.occurred_at)} ·{' '}
                  {event.actor_display_name ?? event.actor_email ?? 'Unknown actor'} (User #
                  {event.acting_user_id}) · Workflow {event.workflow_version}
                </p>
                {event.reason && <p className="mt-1 text-sm">Reason: {event.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h3 className="font-semibold">Snapshot versions</h3>
        {!history.versions.length ? (
          <EmptyState />
        ) : (
          <div className="mt-3 space-y-2">
            {history.versions.map((version) => (
              <div className="rounded border border-subtle p-3" key={version.id}>
                <p>
                  Version {version.version_number} · Manager{' '}
                  {version.manager_display_name ?? 'HR fallback'}
                  {version.manager_employee_code ? ` (${version.manager_employee_code})` : ''}
                  {version.manager_employment_id_snapshot
                    ? ` · Employment #${version.manager_employment_id_snapshot}`
                    : ''}
                </p>
                <p className="text-sm text-secondary">
                  Anchor {String(version.anchor_date).slice(0, 10)} · {when(version.created_at)}
                </p>
                {version.reason && <p className="text-sm">Reason: {version.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <h3 className="font-semibold">Assessments</h3>
          {!history.assessments.length ? (
            <EmptyState />
          ) : (
            history.assessments.map((assessment) => (
              <p className="border-b border-subtle py-2" key={assessment.id}>
                {assessment.assessment_type.replaceAll('_', ' ')} · {assessment.status} · Assessor
                {assessment.assessor_display_name ?? assessment.assessor_email ?? 'Unknown'} (User #
                {assessment.assessor_user_id})
              </p>
            ))
          )}
        </section>
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <h3 className="font-semibold">Acknowledgments</h3>
          {!history.acknowledgments.length ? (
            <EmptyState />
          ) : (
            history.acknowledgments.map((acknowledgment) => (
              <div className="border-b border-subtle py-2" key={acknowledgment.id}>
                <p>{acknowledgment.acknowledgment.replaceAll('_', ' ')}</p>
                {acknowledgment.comment && <p className="text-sm">{acknowledgment.comment}</p>}
                <p className="text-sm text-secondary">
                  {when(acknowledgment.acknowledged_at)} ·{' '}
                  {acknowledgment.employee_display_name ??
                    acknowledgment.employee_email ??
                    'Employee'}{' '}
                  (User #{acknowledgment.employee_user_id})
                </p>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
