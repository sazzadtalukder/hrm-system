import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getAssets } from './api.js';
export function AssetListPage({ own = false }) {
  const company = useOrganizationCompany();
  const result = useQuery({
    queryKey: ['assets', own, company.company?.id],
    queryFn: () => getAssets(company.company.id, own),
    enabled: Boolean(company.company),
  });
  if (company.isPending || result.isPending) return <LoadingState />;
  if (company.error || result.error) return <ErrorState error={company.error ?? result.error} />;
  return (
    <div>
      <h2 className="text-xl font-semibold">{own ? 'My assets' : 'Assets'}</h2>
      {result.data.length ? (
        result.data.map((asset) => (
          <Link className="block border-b py-3" key={asset.id} to={`${asset.id}`}>
            {asset.asset_code} · {asset.name} · {asset.status}
          </Link>
        ))
      ) : (
        <p>No assets found.</p>
      )}
    </div>
  );
}
