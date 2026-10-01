import { apiRequest } from '../../lib/api/client.js';
const query = (v) => new URLSearchParams(v).toString();
export const recruitmentDashboard = async (companyId) =>
  (await apiRequest(`/recruitment/dashboard?${query({ companyId })}`)).data;
export const recruitmentList = async (resource, companyId, params = {}) =>
  (
    await apiRequest(
      `/recruitment/${resource}?${query({ companyId, page: 1, pageSize: 25, ...params })}`,
    )
  ).data.items;
export const recruitmentGet = async (resource, id) =>
  (await apiRequest(`/recruitment/${resource}/${id}`)).data;
export const recruitmentCreate = async (resource, body) =>
  (await apiRequest(`/recruitment/${resource}`, { method: 'POST', body })).data;
export const recruitmentAction = async (resource, id, action, body) =>
  (await apiRequest(`/recruitment/${resource}/${id}/${action}`, { method: 'POST', body })).data;
