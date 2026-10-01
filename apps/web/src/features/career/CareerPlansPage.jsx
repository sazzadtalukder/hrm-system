import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { exportCareerPlans, getCareerPlans } from './api.js';

function downloadCsv(contents, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CareerPlansPage({ view = 'all' }) {
  const company = useOrganizationCompany();
  const { permissions } = useAuth();
  const query = useQuery({
    queryKey: ['career-plans', company.company?.id, view],
    queryFn: () => getCareerPlans({ companyId: company.company.id, view }),
    enabled: Boolean(company.company),
  });
  const exportMutation = useMutation({
    mutationFn: () => exportCareerPlans(company.company.id),
    onSuccess: (csv) => downloadCsv(csv, 'career-plans.csv'),
  });
  if (company.isPending || query.isPending) return <LoadingState />;
  if (company.error || query.error) return <ErrorState error={company.error ?? query.error} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        <h2 className="text-xl font-semibold">Career plans</h2>
        <div className="flex gap-2">
          {permissions.includes('career_plan.export') && (
            <Button onClick={() => exportMutation.mutate()}>Export CSV</Button>
          )}
          {view === 'own' && permissions.includes('career_plan.create') && (
            <Link className="text-accent" to="new">
              New plan
            </Link>
          )}
        </div>
      </div>
      {exportMutation.error && <ErrorState error={exportMutation.error} />}
      {!query.data.length ? (
        <p>No career plans found.</p>
      ) : (
        query.data.map((plan) => (
          <Link
            className="block rounded-lg border border-subtle bg-surface p-4"
            key={plan.id}
            to={`${plan.id}`}
          >
            {plan.employee_name_snapshot} &middot; {plan.status}
          </Link>
        ))
      )}
    </div>
  );
}
