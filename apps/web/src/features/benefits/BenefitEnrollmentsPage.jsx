import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { exportBenefitEnrollments, getBenefitEnrollments, getMyBenefits } from './api.js';

const pageSize = 20;
const field = 'rounded-md border border-subtle bg-surface px-3 py-2 text-sm';

function downloadCsv(csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'benefit-enrollments.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BenefitEnrollmentsPage({ own = false }) {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const filters = { page, pageSize, status: status || undefined, asOfDate: asOfDate || undefined };
  const result = useQuery({
    queryKey: ['benefits', 'enrollments', own, company.company?.id, filters],
    queryFn: () =>
      own ? getMyBenefits(filters) : getBenefitEnrollments(company.company.id, filters),
    enabled: own || Boolean(company.company),
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      exportBenefitEnrollments(company.company.id, {
        status: status || undefined,
        asOfDate: asOfDate || undefined,
      }),
    onSuccess: downloadCsv,
  });
  if ((!own && company.isPending) || result.isPending) return <LoadingState />;
  if ((!own && company.error) || result.error)
    return <ErrorState error={company.error ?? result.error} />;
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-subtle bg-surface p-4">
        {!own && (
          <label className="text-sm">
            Status
            <select
              className={`${field} ml-2`}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              value={status}
            >
              <option value="">All</option>
              {['draft', 'active', 'suspended', 'ended', 'cancelled'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          As of date
          <input
            className={`${field} ml-2`}
            onChange={(event) => {
              setPage(1);
              setAsOfDate(event.target.value);
            }}
            type="date"
            value={asOfDate}
          />
        </label>
        {(status || asOfDate) && (
          <Button
            variant="secondary"
            onClick={() => {
              setPage(1);
              setStatus('');
              setAsOfDate('');
            }}
          >
            Clear filters
          </Button>
        )}
        {!own && permissions.includes('benefit_enrollment.export') && (
          <Button disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
            Export CSV
          </Button>
        )}
      </section>

      {result.data.length === 0 ? (
        <EmptyState message="No benefit enrollments found." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Effective period</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">
                    {row.display_name} ({row.employee_code})
                  </td>
                  <td className="p-3">
                    <Link
                      className="text-accent"
                      to={own ? `/benefits/my/${row.id}` : `/benefits/enrollments/${row.id}`}
                    >
                      {row.plan_name}
                    </Link>
                  </td>
                  <td className="p-3">
                    {String(row.effective_start).slice(0, 10)} –{' '}
                    {row.effective_end ? String(row.effective_end).slice(0, 10) : 'Open'}
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
      <div className="flex items-center justify-between">
        <Button
          disabled={page === 1}
          variant="secondary"
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-secondary">Page {page}</span>
        <Button
          disabled={result.data.length < pageSize}
          variant="secondary"
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
      {exportMutation.error && <ErrorState error={exportMutation.error} />}
    </div>
  );
}
