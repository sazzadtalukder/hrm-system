import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getTrainingCourses, getTrainingSessions } from './api.js';
export function TrainingCatalogPage({ sessionsOnly = false }) {
  const company = useOrganizationCompany();
  const courses = useQuery({
    queryKey: ['training-courses', company.company?.id],
    queryFn: () => getTrainingCourses(company.company.id),
    enabled: Boolean(company.company),
  });
  const sessions = useQuery({
    queryKey: ['training-sessions', company.company?.id],
    queryFn: () => getTrainingSessions(company.company.id),
    enabled: Boolean(company.company),
  });
  if (company.isPending || courses.isPending || sessions.isPending) return <LoadingState />;
  if (company.error || courses.error || sessions.error)
    return <ErrorState error={company.error ?? courses.error ?? sessions.error} />;
  return (
    <div className="space-y-5">
      {!sessionsOnly && (
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <h2 className="font-semibold">Course catalog</h2>
          {courses.data.length ? (
            courses.data.map((x) => (
              <p className="border-b py-2" key={x.id}>
                {x.code} · {x.name} · {x.delivery_mode}
              </p>
            ))
          ) : (
            <p className="text-secondary">No courses available.</p>
          )}
        </section>
      )}
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Training sessions</h2>
        {sessions.data.length ? (
          sessions.data.map((x) => (
            <div className="flex justify-between border-b py-2" key={x.id}>
              <span>
                {x.code} · {x.title_snapshot} · {new Date(x.starts_at_utc).toLocaleString()}
              </span>
              <StatusBadge status={x.status} />
            </div>
          ))
        ) : (
          <p className="text-secondary">No sessions available.</p>
        )}
      </section>
    </div>
  );
}
