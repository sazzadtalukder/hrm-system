import { useQuery } from '@tanstack/react-query';
import { getOwnLeaveEmployment } from './api.js';

export function useOwnLeaveEmployment(companyId, enabled = true) {
  return useQuery({
    queryKey: ['leave', 'own-employment', companyId],
    queryFn: () => getOwnLeaveEmployment(companyId),
    enabled: enabled && Boolean(companyId),
  });
}
