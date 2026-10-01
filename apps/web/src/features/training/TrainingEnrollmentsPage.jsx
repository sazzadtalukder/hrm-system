import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getTrainingEnrollments } from './api.js';
export function TrainingEnrollmentsPage({ view = 'all' }) {
  const company = useOrganizationCompany(),
    q = useQuery({
      queryKey: ['training-enrollments', company.company?.id, view],
      queryFn: () => getTrainingEnrollments({ companyId: company.company.id, view }),
      enabled: Boolean(company.company),
    });
  if (company.isPending || q.isPending) return <LoadingState />;
  if (company.error || q.error) return <ErrorState error={company.error ?? q.error} />;
  if (!q.data.length)
    return (
      <p className="rounded-lg border border-subtle bg-surface p-6 text-secondary">
        No training enrollments found.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="p-3">Employee</th>
            <th>Session</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((x) => (
            <tr className="border-t border-subtle" key={x.id}>
              <td className="p-3">
                <Link
                  className="text-accent"
                  to={
                    view === 'own'
                      ? `../my/${x.id}`
                      : view === 'team'
                        ? `../team/${x.id}`
                        : `../enrollments/${x.id}`
                  }
                >
                  {x.employee_name_snapshot ?? x.employee_code_snapshot}
                </Link>
              </td>
              <td>{x.title_snapshot}</td>
              <td>{x.source}</td>
              <td>
                <StatusBadge status={x.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
