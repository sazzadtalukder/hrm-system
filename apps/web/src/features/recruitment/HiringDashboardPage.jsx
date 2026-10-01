import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { recruitmentDashboard } from './api.js';

const cards = [
  ['openRequisitions', 'Open requisitions', '/recruitment/requisitions'],
  ['pendingApprovalRequisitions', 'Pending approval requisitions', '/recruitment/requisitions'],
  ['activeJobPostings', 'Active job postings', '/recruitment/postings'],
  ['candidates', 'Candidates', '/recruitment/candidates'],
  ['applications', 'Applications', '/recruitment/applications'],
  ['interviews', 'Interviews', '/recruitment/interviews'],
  ['offers', 'Offers', '/recruitment/offers'],
  [
    'acceptedOffersAwaitingConversion',
    'Accepted offers awaiting conversion',
    '/recruitment/offers',
  ],
];

const label = (value) =>
  value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');

export function HiringDashboardPage() {
  const company = useOrganizationCompany();
  const dashboard = useQuery({
    queryKey: ['recruitment-dashboard', company.company?.id],
    queryFn: () => recruitmentDashboard(company.company.id),
    enabled: Boolean(company.company),
  });
  if (company.isPending || dashboard.isPending) return <LoadingState />;
  if (company.error || dashboard.error)
    return <ErrorState error={company.error ?? dashboard.error} />;
  const metrics = dashboard.data.metrics ?? {};
  const visibleCards = cards.filter(([key]) => metrics[key] !== null && metrics[key] !== undefined);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Hiring Dashboard</h1>
        <p className="mt-1 text-sm text-secondary">
          A company-scoped snapshot of recruitment activity you are authorized to view.
        </p>
      </header>
      {visibleCards.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map(([key, title, to]) => (
            <Link
              className="rounded-lg border border-subtle bg-surface p-4 transition-colors hover:bg-app"
              key={key}
              to={to}
            >
              <p className="text-sm text-secondary">{title}</p>
              <p className="mt-2 text-3xl font-semibold">{metrics[key]}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState message="No recruitment metrics are available for your current access scope." />
      )}
      {dashboard.data.pipeline ? (
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <div>
            <h2 className="text-lg font-semibold">Application pipeline</h2>
            <p className="mt-1 text-sm text-secondary">
              Current application counts by workflow stage.
            </p>
          </div>
          {dashboard.data.pipeline.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {dashboard.data.pipeline.map((item) => (
                <div className="rounded border border-subtle p-3" key={item.status}>
                  <p className="text-sm text-secondary">{label(item.status)}</p>
                  <p className="mt-1 text-2xl font-semibold">{item.count}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No applications are currently in the pipeline." />
          )}
        </section>
      ) : null}
    </section>
  );
}
