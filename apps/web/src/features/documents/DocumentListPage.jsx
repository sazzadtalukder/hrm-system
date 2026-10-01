import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getDocuments } from './api.js';
export function DocumentListPage({ own = false }) {
  const company = useOrganizationCompany();
  const result = useQuery({
    queryKey: ['documents', own, company.company?.id],
    queryFn: () => getDocuments(company.company.id, own),
    enabled: Boolean(company.company),
  });
  if (company.isPending || result.isPending) return <LoadingState />;
  if (company.error || result.error) return <ErrorState error={company.error ?? result.error} />;
  return (
    <div>
      <h2 className="text-xl font-semibold">{own ? 'My documents' : 'Documents'}</h2>
      {result.data.length ? (
        result.data.map((item) => (
          <Link className="block border-b py-3" key={item.id} to={`${item.id}`}>
            {item.document_code} · {item.title} · {item.status}
          </Link>
        ))
      ) : (
        <p>No documents found.</p>
      )}
    </div>
  );
}
