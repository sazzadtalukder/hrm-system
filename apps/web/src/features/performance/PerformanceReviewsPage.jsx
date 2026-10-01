import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { exportPerformanceReviews, getPerformanceReviews } from './api.js';

const statuses = [
  'goals_draft',
  'goals_submitted',
  'goals_returned',
  'goals_approved',
  'self_review_submitted',
  'manager_review_submitted',
  'employee_acknowledged',
  'finalized',
  'finalized_without_acknowledgment',
  'cancelled',
];

export function PerformanceReviewsPage({ view = 'all' }) {
  const company = useOrganizationCompany();
  const { permissions } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const query = useQuery({
    queryKey: ['performance-reviews', company.company?.id, view, status, page],
    queryFn: () =>
      getPerformanceReviews({ companyId: company.company?.id, view, status, page, pageSize }),
    enabled: view === 'own' || Boolean(company.company),
  });
  const download = useMutation({
    mutationFn: () => exportPerformanceReviews({ companyId: company.company.id, status }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'performance-reviews.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  if ((view !== 'own' && company.isPending) || query.isPending) return <LoadingState />;
  if (company.error || query.error) return <ErrorState error={company.error ?? query.error} />;
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-subtle bg-surface p-4">
        <label className="text-sm">
          Status
          <select
            className="mt-1 block rounded-md border border-subtle bg-surface p-2"
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
        {view === 'all' && permissions.includes('performance_review.export') && (
          <Button
            disabled={download.isPending}
            variant="secondary"
            onClick={() => download.mutate()}
          >
            Export CSV
          </Button>
        )}
      </section>
      {download.error && <ErrorState error={download.error} />}
      {!query.data.length ? (
        <EmptyState message="No performance reviews match the selected filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-3">Cycle</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((review) => (
                <tr className="border-t border-subtle" key={review.id}>
                  <td className="p-3">
                    <Link
                      className="font-medium text-accent"
                      to={
                        view === 'own'
                          ? `/performance/my/${review.id}`
                          : view === 'team'
                            ? `/performance/team/${review.id}`
                            : `/performance/${review.id}`
                      }
                    >
                      {review.employee_name_snapshot} ({review.employee_code_snapshot})
                    </Link>
                  </td>
                  <td className="p-3">{review.cycle_name}</td>
                  <td className="p-3">
                    {String(review.review_period_start).slice(0, 10)}–
                    {String(review.review_period_end).slice(0, 10)}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={review.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          disabled={page === 1}
          variant="secondary"
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span className="self-center text-sm">Page {page}</span>
        <Button
          disabled={query.data.length < pageSize}
          variant="secondary"
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
