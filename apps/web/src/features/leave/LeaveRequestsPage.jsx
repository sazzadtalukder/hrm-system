import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getLeaveRequests } from './api.js';

export function LeaveRequestsPage({ scopeView }) {
  const company = useOrganizationCompany();
  const requests = useQuery({
    queryKey: ['leave', 'requests', company.company?.id, scopeView],
    queryFn: () =>
      getLeaveRequests({ companyId: company.company.id, scopeView, page: 1, pageSize: 50 }),
    enabled: Boolean(company.company),
  });
  if (company.isPending || requests.isPending) return <LoadingState />;
  if (company.error || requests.error)
    return <ErrorState error={company.error ?? requests.error} />;
  if (!requests.data?.items.length) return <EmptyState message="No leave requests found." />;
  const detailBase =
    scopeView === 'own'
      ? '/leave/my'
      : scopeView === 'direct_reports'
        ? '/leave/team'
        : '/leave/requests';
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-subtle bg-app text-secondary">
          <tr>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Dates</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Units</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.data.items.map((item) => (
            <tr className="border-b border-subtle last:border-0" key={item.id}>
              <td className="px-4 py-3">
                <Link className="text-accent hover:underline" to={`${detailBase}/${item.id}`}>
                  {item.display_name ?? item.employee_code}
                </Link>
              </td>
              <td className="px-4 py-3">
                {String(item.date_from).slice(0, 10)} – {String(item.date_to).slice(0, 10)}
              </td>
              <td className="px-4 py-3">{item.leave_type_name}</td>
              <td className="px-4 py-3">{item.requested_units}</td>
              <td className="px-4 py-3">
                <StatusBadge status={item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
