import { apiCsvRequest, apiRequest } from '../../lib/api/client.js';
const qs = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== ''),
  ).toString();
export const getClaimCategories = async (companyId) =>
  (await apiRequest(`/claims/categories?${qs({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const createClaimCategory = async (body) =>
  (await apiRequest('/claims/categories', { method: 'POST', body })).data;
export const getClaimCategory = async (id) => (await apiRequest(`/claims/categories/${id}`)).data;
export const updateClaimCategory = async (id, body) =>
  (await apiRequest(`/claims/categories/${id}`, { method: 'PATCH', body })).data;
export const createClaimCategoryVersion = async (id, body, correction = false) =>
  (
    await apiRequest(`/claims/categories/${id}/${correction ? 'corrections' : 'versions'}`, {
      method: 'POST',
      body,
    })
  ).data;
export const deactivateClaimCategory = async (id, body) =>
  (await apiRequest(`/claims/categories/${id}/deactivate`, { method: 'POST', body })).data;
export const getClaims = async ({ companyId, view = 'all', status, page = 1, pageSize = 25 }) => {
  const path = view === 'own' ? '/claims/my' : view === 'team' ? '/claims/team' : '/claims';
  return (await apiRequest(`${path}?${qs({ companyId, status, page, pageSize })}`)).data.items;
};
export const getClaim = async (id, view = 'all') => {
  const path =
    view === 'own' ? `/claims/my/${id}` : view === 'team' ? `/claims/team/${id}` : `/claims/${id}`;
  return (await apiRequest(path)).data;
};
export const createClaim = async (body) =>
  (await apiRequest('/claims', { method: 'POST', body })).data;
export const updateClaimDraft = async (id, body) =>
  (await apiRequest(`/claims/${id}/draft`, { method: 'PATCH', body })).data;
export const claimAction = async (id, action, body) =>
  (await apiRequest(`/claims/${id}/${action}`, { method: 'POST', body })).data;
export const recordClaimPayment = async (id, body) =>
  (await apiRequest(`/claims/${id}/payment`, { method: 'POST', body })).data;
export const getClaimHistory = async (id) => (await apiRequest(`/claims/${id}/history`)).data;
export const exportClaims = async ({ companyId, status }) =>
  apiCsvRequest(`/claims/export?${qs({ companyId, status, page: 1, pageSize: 100 })}`);
