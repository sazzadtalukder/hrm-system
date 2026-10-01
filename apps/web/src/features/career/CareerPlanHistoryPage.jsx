import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getCareerHistory } from './api.js';
export function CareerPlanHistoryPage({ view = 'all' }) {
  const { id } = useParams(),
    q = useQuery({
      queryKey: ['career-history', id, view],
      queryFn: () => getCareerHistory(id, view),
    });
  if (q.isPending) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const groups = [
    ['Plan versions', q.data.versions, (x) => `Version ${x.version_number} · ${x.history_status}`],
    ['Workflow', q.data.states, (x) => `${x.from_state ?? 'created'} → ${x.to_state}`],
    ['Decisions', q.data.decisions, (x) => x.decision],
    [
      'Manager reassignments',
      q.data.reassignments,
      (x) => `${x.from_manager_employment_id ?? 'none'} → ${x.to_manager_employment_id}`,
    ],
    ['Goal history', q.data.goals, (x) => `${x.title} · ${x.status} · v${x.version_number}`],
    [
      'Development actions',
      q.data.actions,
      (x) => `${x.action_type} · ${x.status} · v${x.version_number}`,
    ],
    [
      'Immutable evidence references',
      q.data.evidenceReferences ?? [],
      (x) =>
        `${x.reference_type} — action version ${x.career_development_action_version_id}${x.training_completion_version_id ? `, Training completion version ${x.training_completion_version_id}` : ''}`,
    ],
  ];
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Career history</h2>
      {groups.map(([title, rows, label]) => (
        <section key={title}>
          <h3 className="font-semibold">{title}</h3>
          {!rows.length ? (
            <p>None.</p>
          ) : (
            rows.map((x) => (
              <p className="border-b py-2" key={`${title}-${x.id}`}>
                {label(x)}
              </p>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
