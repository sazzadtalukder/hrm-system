import { apiCsvRequest, apiRequest } from '../../lib/api/client.js';
const q = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')).toString();
export const getCriticalPositions = async (companyId) =>
  (await apiRequest(`/succession/critical-positions?${q({ companyId, page: 1, pageSize: 100 })}`))
    .data.items;
export const createCriticalPosition = async (body) =>
  (await apiRequest('/succession/critical-positions', { method: 'POST', body })).data;
export const getCriticalPosition = async (id) =>
  (await apiRequest(`/succession/critical-positions/${id}`)).data;
export const getCriticalPositionHistory = async (id) =>
  (await apiRequest(`/succession/critical-positions/${id}/history`)).data;
export const versionCriticalPosition = async (id, body) =>
  (await apiRequest(`/succession/critical-positions/${id}/versions`, { method: 'POST', body }))
    .data;
export const criticalPositionStatus = async (id, action, body) =>
  (await apiRequest(`/succession/critical-positions/${id}/${action}`, { method: 'POST', body }))
    .data;
export const getSuccessionPlans = async (companyId) =>
  (await apiRequest(`/succession/plans?${q({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const getNominations = async ({ companyId, team = false }) =>
  (
    await apiRequest(
      `${team ? '/succession/team' : '/succession/nominations'}?${q({ companyId, page: 1, pageSize: 100 })}`,
    )
  ).data.items;
export const getNomination = async (id, team = false) =>
  (await apiRequest(`${team ? '/succession/team' : '/succession/nominations'}/${id}`)).data;
export const getNominationHistory = async (id, team = false) =>
  (await apiRequest(`${team ? '/succession/team' : '/succession/nominations'}/${id}/history`)).data;
export const nominationAction = async (id, a, body) =>
  (await apiRequest(`/succession/nominations/${id}/${a}`, { method: 'POST', body })).data;
export const createSuccessionPlan = async (body) =>
  (await apiRequest('/succession/plans', { method: 'POST', body })).data;
export const getSuccessionPlan = async (id) => (await apiRequest(`/succession/plans/${id}`)).data;
export const getSuccessionPlanHistory = async (id) =>
  (await apiRequest(`/succession/plans/${id}/history`)).data;
export const successionPlanAction = async (id, action, body) =>
  (await apiRequest(`/succession/plans/${id}/${action}`, { method: 'POST', body })).data;
export const createNomination = async (planId, body) =>
  (await apiRequest(`/succession/plans/${planId}/nominations`, { method: 'POST', body })).data;
export const updateReadiness = async (id, body) =>
  (await apiRequest(`/succession/nominations/${id}/readiness`, { method: 'POST', body })).data;
export const reassignNominationManager = async (id, body) =>
  (await apiRequest(`/succession/nominations/${id}/reassign-manager`, { method: 'POST', body }))
    .data;
export const exportSuccessionNominations = (companyId) =>
  apiCsvRequest(`/succession/export.csv?${q({ companyId, page: 1, pageSize: 100 })}`);
