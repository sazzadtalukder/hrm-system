import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployeeHistory } from './api.js';

export function EmployeeHistoryPage() {
  const { id } = useParams();
  const history = useQuery({
    queryKey: ['employee', id, 'history'],
    queryFn: () => getEmployeeHistory(id),
  });
  if (history.isPending) return <LoadingState />;
  if (history.error) return <ErrorState error={history.error} />;
  if (!history.data.employments.length) return <EmptyState message="No employment history." />;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 font-semibold">Employment episodes</h3>
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Ended</th>
              </tr>
            </thead>
            <tbody>
              {history.data.employments.map((row) => (
                <tr className="border-t border-subtle" key={row.id}>
                  <td className="px-4 py-3">{row.employee_code}</td>
                  <td className="px-4 py-3">{row.employment_type}</td>
                  <td className="px-4 py-3">{String(row.joining_date).slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    {row.employment_end_date ? String(row.employment_end_date).slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3 className="mb-3 font-semibold">Status history</h3>
        <ul className="space-y-2">
          {history.data.statuses.map((row) => (
            <li className="rounded-lg border border-subtle bg-surface p-4 text-sm" key={row.id}>
              <strong>{row.status}</strong> · {String(row.effective_start).slice(0, 10)} –{' '}
              {row.effective_end ? String(row.effective_end).slice(0, 10) : 'Open'}{' '}
              {row.history_status === 'superseded' && (
                <span className="text-secondary">(superseded)</span>
              )}
              <p className="mt-1 text-secondary">{row.reason}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-3 font-semibold">Assignment history</h3>
        <ul className="space-y-2">
          {history.data.assignments.map((row) => (
            <li className="rounded-lg border border-subtle bg-surface p-4 text-sm" key={row.id}>
              Branch {row.branch_id} · Department {row.department_id} · Designation{' '}
              {row.designation_id}
              <p className="mt-1 text-secondary">
                {String(row.effective_start).slice(0, 10)} –{' '}
                {row.effective_end ? String(row.effective_end).slice(0, 10) : 'Open'} · {row.reason}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
