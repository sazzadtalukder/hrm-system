import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getTrainingHistory } from './api.js';

export function TrainingHistoryPage({ view = 'all' }) {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['training-history', id, view],
    queryFn: () => getTrainingHistory(id, view),
  });

  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;

  const history = query.data;
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Training history</h2>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h3 className="font-semibold">Workflow</h3>
        {history.states.length ? (
          history.states.map((item) => (
            <p className="border-b py-2" key={item.id}>
              {item.from_state ?? 'created'} → {item.to_state} · version {item.workflow_version}
              {item.reason ? ` · ${item.reason}` : ''}
            </p>
          ))
        ) : (
          <p className="mt-2 text-secondary">No workflow events recorded.</p>
        )}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h3 className="font-semibold">Participation and completion versions</h3>
        {history.participation.map((item) => (
          <p className="border-b py-2" key={item.id}>
            Participation version {item.version_number}: {item.participation_status}
            {item.reason ? ` · ${item.reason}` : ''}
          </p>
        ))}
        {history.completion.map((item) => (
          <p className="border-b py-2" key={item.id}>
            Completion version ID {item.id} · version {item.version_number}: {item.outcome}
            {item.completion_date ? ` · ${item.completion_date}` : ''}
          </p>
        ))}
        {!history.participation.length && !history.completion.length ? (
          <p className="mt-2 text-secondary">No participation or completion recorded.</p>
        ) : null}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h3 className="font-semibold">Completion evidence</h3>
        {history.evidence.length ? (
          history.evidence.map((item) => (
            <p className="border-b py-2" key={item.id}>
              {item.reference_type}: {item.reference_value}
            </p>
          ))
        ) : (
          <p className="mt-2 text-secondary">No evidence references recorded.</p>
        )}
      </section>
    </div>
  );
}
