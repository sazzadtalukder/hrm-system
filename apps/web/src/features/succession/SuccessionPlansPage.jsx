import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getSuccessionPlans } from './api.js';
export function SuccessionPlansPage() {
  const c = useOrganizationCompany(),
    { permissions } = useAuth(),
    q = useQuery({
      queryKey: ['succession-plans', c.company?.id],
      queryFn: () => getSuccessionPlans(c.company.id),
      enabled: Boolean(c.company),
    });
  if (c.isPending || q.isPending) return <LoadingState />;
  if (c.error || q.error) return <ErrorState error={c.error ?? q.error} />;
  return (
    <div>
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold">Succession plans</h2>
        {permissions.includes('succession_plan.create') && <Link to="new">New plan</Link>}
      </div>
      {!q.data.length ? (
        <p>No succession plans found.</p>
      ) : (
        q.data.map((i) => (
          <Link className="block border-b py-3" key={i.id} to={`${i.id}`}>
            {i.critical_position_name_snapshot} · {i.status}
          </Link>
        ))
      )}
    </div>
  );
}
