import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getPayrollRuns } from './api.js';

export function PayrollRunsPage() {
  const company = useOrganizationCompany();
  const runs = useQuery({
    queryKey: ['payroll', 'runs', company.company?.id],
    queryFn: () => getPayrollRuns(company.company.id),
    enabled: Boolean(company.company),
  });
  if (company.isPending || runs.isPending) return <LoadingState />;
  if (company.error || runs.error) return <ErrorState error={company.error ?? runs.error} />;
  if (!runs.data?.length) return <EmptyState message="No payroll runs found." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-subtle">
            <th className="p-3">Run</th>
            <th className="p-3">Period</th>
            <th className="p-3">Status</th>
            <th className="p-3">Calculation</th>
          </tr>
        </thead>
        <tbody>
          {runs.data.map((run) => (
            <tr className="border-b border-subtle" key={run.id}>
              <td className="p-3">
                <Link className="font-medium text-accent" to={`/payroll/runs/${run.id}`}>
                  {run.code}
                </Link>
              </td>
              <td className="p-3">
                {run.period_code} · {String(run.period_start).slice(0, 10)} –{' '}
                {String(run.period_end).slice(0, 10)}
              </td>
              <td className="p-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="p-3">{run.calculation_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
