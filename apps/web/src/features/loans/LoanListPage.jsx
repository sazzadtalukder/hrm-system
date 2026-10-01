import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { exportLoans, getLoans } from './api.js';

const statuses = [
  'draft',
  'submitted',
  'manager_approved',
  'manager_rejected',
  'finance_approved',
  'finance_rejected',
  'cancellation_requested',
  'cancelled',
  'withdrawn',
  'disbursed',
];
export function LoanListPage({ view = 'all' }) {
  const company = useOrganizationCompany();
  const { permissions } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const q = useQuery({
    queryKey: ['loans', view, company.company?.id, status, page],
    queryFn: () => getLoans({ companyId: company.company?.id, view, status, page, pageSize }),
    enabled: view === 'own' || Boolean(company.company),
  });
  const download = useMutation({
    mutationFn: () => exportLoans({ companyId: company.company?.id, status }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'loan-facilities.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  if ((view !== 'own' && company.isPending) || q.isPending) return <LoadingState />;
  if (company.error || q.error) return <ErrorState error={company.error ?? q.error} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-subtle bg-surface p-4">
        <label className="text-sm">
          Status
          <select
            className="mt-1 block rounded-md border border-subtle p-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        {view === 'all' && permissions.includes('loan.export') && (
          <Button
            disabled={download.isPending}
            variant="secondary"
            onClick={() => download.mutate()}
          >
            Export CSV
          </Button>
        )}
      </div>
      {download.error && <ErrorState error={download.error} />}
      {!q.data.length ? (
        <EmptyState message="No loan or advance applications match the selected filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Application</th>
                <th className="p-3">Employee</th>
                <th className="p-3">Facility</th>
                <th className="p-3">Principal</th>
                <th className="p-3">Term</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((application) => (
                <tr className="border-t" key={application.id}>
                  <td className="p-3">
                    <Link
                      className="text-accent"
                      to={
                        view === 'own'
                          ? `/loans/my/${application.id}`
                          : view === 'team'
                            ? `/loans/team/${application.id}`
                            : `/loans/${application.id}`
                      }
                    >
                      {application.application_number ?? `Draft #${application.id}`}
                    </Link>
                  </td>
                  <td className="p-3">
                    {application.display_name} ({application.employee_code})
                  </td>
                  <td className="p-3">{application.facility_name}</td>
                  <td className="p-3">
                    {application.requested_principal} {application.currency_code}
                  </td>
                  <td className="p-3">{application.requested_term_months} months</td>
                  <td className="p-3">
                    <StatusBadge status={application.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={page === 1}
          variant="secondary"
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span className="text-sm">Page {page}</span>
        <Button
          disabled={q.data.length < pageSize}
          variant="secondary"
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
