import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getManagerDashboard } from './api.js';
export function ManagerDashboardPage() {
  const company = useOrganizationCompany();
  const { permissions } = useAuth();
  const dashboard = useQuery({
    queryKey: ['manager-dashboard', company.company?.id],
    queryFn: () => getManagerDashboard(company.company.id),
    enabled: Boolean(company.company),
  });
  if (company.isPending || dashboard.isPending) return <LoadingState />;
  if (company.error || dashboard.error)
    return <ErrorState error={company.error ?? dashboard.error} />;
  const pendingLinks = {
    leave: ['Leave approvals', '/leave/team', 'leave_request.view_team'],
    claims: ['Claim approvals', '/claims/team', 'claim.view_team'],
    loans: ['Loan approvals', '/loans/team', 'loan.view_team'],
    training: ['Training approvals', '/training/team', 'training_enrollment.view_team'],
    performance: ['Performance reviews', '/performance/team', 'performance_review.view_team'],
    career: ['Career plans', '/career/team', 'career_plan.view_team'],
  };
  return (
    <div>
      <h1 className="text-2xl font-semibold">Manager workspace</h1>
      <p className="mt-2 text-secondary">
        Direct reports and pending work from existing HRM modules.
      </p>
      <div className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(dashboard.data.pending).map(([name, count]) => {
          const [label, to, permission] = pendingLinks[name] ?? [name, null, null];
          const content = (
            <>
              <div className="text-sm text-secondary">{label}</div>
              <div className="text-2xl font-semibold">{count}</div>
            </>
          );
          return to && permissions.includes(permission) ? (
            <Link
              className="rounded-md border border-subtle bg-surface p-4 hover:border-accent"
              key={name}
              to={to}
            >
              {content}
            </Link>
          ) : (
            <div className="rounded-md border border-subtle bg-surface p-4" key={name}>
              {content}
            </div>
          );
        })}
      </div>
      <h2 className="text-lg font-semibold">Direct reports</h2>
      {dashboard.data.directReports.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Branch</th>
                <th>Department</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.data.directReports.map((row) => (
                <tr key={row.employmentId}>
                  <td>{row.employeeCode}</td>
                  <td>{row.employeeName}</td>
                  <td>{row.branchName ?? `Branch #${row.branchId}`}</td>
                  <td>{row.departmentName ?? `Department #${row.departmentId}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3">No direct reports found.</p>
      )}
    </div>
  );
}
