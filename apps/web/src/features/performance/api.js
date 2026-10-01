import { apiCsvRequest, apiRequest } from '../../lib/api/client.js';
const qs = (v) =>
  new URLSearchParams(Object.entries(v).filter(([, x]) => x !== undefined && x !== '')).toString();
export const getPerformanceReviews = async ({
  companyId,
  view = 'all',
  status,
  page = 1,
  pageSize = 25,
}) =>
  (
    await apiRequest(
      `${view === 'own' ? '/performance/my' : view === 'team' ? '/performance/team' : '/performance'}?${qs({ companyId, status, page, pageSize })}`,
    )
  ).data.items;
export const getPerformanceReview = async (id, view = 'all') =>
  (
    await apiRequest(
      view === 'own'
        ? `/performance/my/${id}`
        : view === 'team'
          ? `/performance/team/${id}`
          : `/performance/${id}`,
    )
  ).data;
export const performanceAction = async (id, path, body) =>
  (await apiRequest(`/performance/${id}/${path}`, { method: 'POST', body })).data;
export const createGoal = async (id, body) =>
  (await apiRequest(`/performance/${id}/goals`, { method: 'POST', body })).data;
export const updateGoal = async (reviewId, goalId, body) =>
  (
    await apiRequest(`/performance/${reviewId}/goals/${goalId}`, {
      method: 'PATCH',
      body,
    })
  ).data;
export const getPerformanceHistory = async (id, view = 'all') =>
  (
    await apiRequest(
      view === 'own'
        ? `/performance/my/${id}/history`
        : view === 'team'
          ? `/performance/team/${id}/history`
          : `/performance/${id}/history`,
    )
  ).data;
export const getPerformanceConfig = async (kind, companyId) =>
  (await apiRequest(`/performance/${kind}?${qs({ companyId, page: 1, pageSize: 100 })}`)).data
    .items;
export const createPerformanceConfig = async (kind, body) =>
  (await apiRequest(`/performance/${kind}`, { method: 'POST', body })).data;
export const getCycles = async (companyId) =>
  (await apiRequest(`/performance/cycles?${qs({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const createCycle = async (body) =>
  (await apiRequest('/performance/cycles', { method: 'POST', body })).data;
export const cycleAction = async (id, path, body) =>
  (await apiRequest(`/performance/cycles/${id}/${path}`, { method: 'POST', body })).data;
export const exportPerformanceReviews = async ({ companyId, status }) =>
  apiCsvRequest(`/performance/export.csv?${qs({ companyId, status, page: 1, pageSize: 100 })}`);
