import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { exportSuccessionNominations, getNominations } from './api.js';

function downloadCsv(contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'succession-nominations.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function SuccessorNominationsPage({ team = false }) {
  const company = useOrganizationCompany();
  const { permissions } = useAuth();
  const query = useQuery({
    queryKey: ['successor-nominations', company.company?.id, team],
    queryFn: () => getNominations({ companyId: company.company.id, team }),
    enabled: Boolean(company.company),
  });
  const exportMutation = useMutation({
    mutationFn: () => exportSuccessionNominations(company.company.id),
    onSuccess: downloadCsv,
  });
  if (company.isPending || query.isPending) return <LoadingState />;
  if (company.error || query.error) return <ErrorState error={company.error ?? query.error} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        <h2 className="text-xl font-semibold">Successor nominations</h2>
        {permissions.includes('succession.export') && (
          <Button onClick={() => exportMutation.mutate()}>Export CSV</Button>
        )}
      </div>
      {exportMutation.error && <ErrorState error={exportMutation.error} />}
      {!query.data.length ? (
        <p>No nominations found.</p>
      ) : (
        query.data.map((nomination) => (
          <Link className="block border-b py-3" key={nomination.id} to={`${nomination.id}`}>
            {nomination.employee_name_snapshot} &middot; {nomination.status}
          </Link>
        ))
      )}
    </div>
  );
}
