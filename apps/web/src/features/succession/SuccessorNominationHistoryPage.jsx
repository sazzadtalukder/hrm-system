import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getNominationHistory } from './api.js';
export function SuccessorNominationHistoryPage({ team = false }) {
  const { id } = useParams(),
    q = useQuery({
      queryKey: ['nomination-history', id, team],
      queryFn: () => getNominationHistory(id, team),
    });
  if (q.isPending) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Nomination history</h2>
      <section>
        <h3 className="font-semibold">Versions</h3>
        {q.data.versions.map((v) => (
          <p key={v.id}>
            Version {v.version_number} · {v.history_status}
          </p>
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Decisions</h3>
        {q.data.decisions.map((d) => (
          <p key={d.id}>{d.decision}</p>
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Readiness</h3>
        {q.data.readiness.map((r) => (
          <p key={r.id}>
            {r.authority} · {r.readiness}
          </p>
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Manager reassignments</h3>
        {q.data.reassignments.map((r) => (
          <p key={r.id}>
            {r.from_manager_employment_id ?? 'none'} → {r.to_manager_employment_id}
          </p>
        ))}
      </section>
    </div>
  );
}
