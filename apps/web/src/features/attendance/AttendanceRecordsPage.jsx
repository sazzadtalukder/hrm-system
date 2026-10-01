import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getAttendanceRecords } from './api.js';

export function AttendanceRecordsPage({ mode = 'all' }) {
  const company = useOrganizationCompany();
  const records = useQuery({
    queryKey: ['attendance', 'records', company.company?.id, mode],
    queryFn: () =>
      getAttendanceRecords({
        companyId: company.company.id,
        page: 1,
        pageSize: 50,
        scopeView: mode === 'all' ? undefined : mode,
      }),
    enabled: Boolean(company.company),
  });
  if (company.isPending || records.isPending) return <LoadingState />;
  if (company.error || records.error) return <ErrorState error={company.error ?? records.error} />;
  if (!records.data?.items.length) return <EmptyState message="No attendance records found." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-subtle bg-app text-secondary">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Exception</th>
          </tr>
        </thead>
        <tbody>
          {records.data.items.map((record) => (
            <tr className="border-b border-subtle last:border-0" key={record.id}>
              <td className="px-4 py-3">
                <Link
                  className="text-accent hover:underline"
                  to={`/attendance/records/${record.id}`}
                >
                  {String(record.attendance_date).slice(0, 10)}
                </Link>
              </td>
              <td className="px-4 py-3">
                {record.display_name} ({record.employee_code})
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={record.status} />
              </td>
              <td className="px-4 py-3">{record.exception_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
