import { apiCsvRequest, apiRequest } from '../../lib/api/client.js';
const q = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')).toString();
export const getCareerPaths = async (companyId) =>
  (await apiRequest(`/career/paths?${q({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const createCareerPath = async (body) =>
  (await apiRequest('/career/paths', { method: 'POST', body })).data;
export const getCareerPath = async (id) => (await apiRequest(`/career/paths/${id}`)).data;
export const getCareerPathHistory = async (id) =>
  (await apiRequest(`/career/paths/${id}/history`)).data;
export const versionCareerPath = async (id, body) =>
  (await apiRequest(`/career/paths/${id}/versions`, { method: 'POST', body })).data;
export const careerPathStatus = async (id, action, body) =>
  (await apiRequest(`/career/paths/${id}/${action}`, { method: 'POST', body })).data;
export const getCareerPlans = async ({ companyId, view = 'all' }) =>
  (
    await apiRequest(
      `${view === 'own' ? '/career/my' : view === 'team' ? '/career/team' : '/career/plans'}?${q({ companyId, page: 1, pageSize: 100 })}`,
    )
  ).data.items;
export const getCareerPlan = async (id, view = 'all') =>
  (
    await apiRequest(
      view === 'own'
        ? `/career/my/${id}`
        : view === 'team'
          ? `/career/team/${id}`
          : `/career/plans/${id}`,
    )
  ).data;
export const getCareerHistory = async (id, view = 'all') =>
  (
    await apiRequest(
      view === 'own'
        ? `/career/my/${id}/history`
        : view === 'team'
          ? `/career/team/${id}/history`
          : `/career/plans/${id}/history`,
    )
  ).data;
export const createCareerPlan = async (body) =>
  (await apiRequest('/career/my', { method: 'POST', body })).data;
export const careerAction = async (id, action, body) =>
  (await apiRequest(`/career/plans/${id}/${action}`, { method: 'POST', body })).data;
export const updateCareerPlan = async (id, body) =>
  (await apiRequest(`/career/plans/${id}`, { method: 'PUT', body })).data;
export const updateCareerProgress = async (id, body) =>
  (await apiRequest(`/career/plans/${id}/progress`, { method: 'POST', body })).data;
export const reassignCareerManager = async (id, body) =>
  (await apiRequest(`/career/plans/${id}/reassign-manager`, { method: 'POST', body })).data;
export const addCareerEvidence = async (id, body) =>
  (await apiRequest(`/career/plans/${id}/evidence`, { method: 'POST', body })).data;
export const exportCareerPlans = (companyId) =>
  apiCsvRequest(`/career/export.csv?${q({ companyId, page: 1, pageSize: 100 })}`);
