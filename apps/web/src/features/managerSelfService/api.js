import { apiRequest } from '../../lib/api/client.js';
export const getManagerDashboard = async (companyId) =>
  (await apiRequest(`/manager-self-service/dashboard?companyId=${companyId}`)).data;
