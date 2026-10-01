import { useQuery } from '@tanstack/react-query';
import { getCompanies } from './api.js';

export function useOrganizationCompany() {
  const query = useQuery({ queryKey: ['organization', 'companies'], queryFn: getCompanies });
  return {
    ...query,
    company: query.data?.find(({ status }) => status === 'active') ?? query.data?.[0],
  };
}
