import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { exportClaims, getClaims } from './api.js';

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
  'paid',
];
export function ClaimListPage({ view = 'all' }) {
  const company = useOrganizationCompany();
  const { permissions } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const q = useQuery({
    queryKey: ['claims', view, company.company?.id, status, page],
    queryFn: () => getClaims({ companyId: company.company?.id, view, status, page, pageSize }),
    enabled: view === 'own' || Boolean(company.company),
  });
  const download = useMutation({
    mutationFn: () => exportClaims({ companyId: company.company?.id, status }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'expense-claims.csv';
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
        {view === 'all' && permissions.includes('claim.export') && (
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
        <EmptyState message="No claims match the selected filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Claim</th>
                <th className="p-3">Employee</th>
                <th className="p-3">Purpose</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">
                    <Link
                      className="text-accent"
                      to={
                        view === 'own'
                          ? `/claims/my/${row.id}`
                          : view === 'team'
                            ? `/claims/team/${row.id}`
                            : `/claims/${row.id}`
                      }
                    >
                      {row.claim_number ?? `Draft #${row.id}`}
                    </Link>
                  </td>
                  <td className="p-3">
                    {row.display_name} ({row.employee_code})
                  </td>
                  <td className="p-3">{row.title}</td>
                  <td className="p-3">
                    {row.total_amount} {row.currency_code}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={row.status} />
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
