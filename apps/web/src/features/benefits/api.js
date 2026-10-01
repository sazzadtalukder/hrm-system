import { apiCsvRequest, apiRequest } from '../../lib/api/client.js';
const query = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  ).toString();
export const getBenefitPlans = async (companyId, filters = {}) =>
  (await apiRequest(`/benefits/plans?${query({ companyId, page: 1, pageSize: 100, ...filters })}`))
    .data.items;
export const getBenefitPlan = async (id) => (await apiRequest(`/benefits/plans/${id}`)).data;
export const createBenefitPlan = async (body) =>
  (await apiRequest('/benefits/plans', { method: 'POST', body })).data;
export const updateBenefitPlan = async (id, body) =>
  (await apiRequest(`/benefits/plans/${id}`, { method: 'PATCH', body })).data;
export const createBenefitPlanVersion = async (id, body, correction = false) =>
  (
    await apiRequest(`/benefits/plans/${id}/${correction ? 'corrections' : 'versions'}`, {
      method: 'POST',
      body,
    })
  ).data;
export const deactivateBenefitPlan = async (id, body) =>
  (await apiRequest(`/benefits/plans/${id}/deactivate`, { method: 'POST', body })).data;
export const getBenefitEnrollments = async (companyId, filters = {}) =>
  (
    await apiRequest(
      `/benefits/enrollments?${query({ companyId, page: 1, pageSize: 20, ...filters })}`,
    )
  ).data.items;
export const getMyBenefits = async (filters = {}) =>
  (await apiRequest(`/benefits/my-enrollments?${query({ page: 1, pageSize: 20, ...filters })}`))
    .data.items;
export const getBenefitEnrollment = async (id) =>
  (await apiRequest(`/benefits/enrollments/${id}`)).data;
export const getOwnBenefitEnrollment = async (id) =>
  (await apiRequest(`/benefits/my-enrollments/${id}`)).data;
export const getBenefitHistory = async (id) =>
  (await apiRequest(`/benefits/enrollments/${id}/history`)).data;
export const createBenefitEnrollment = async (body) =>
  (await apiRequest('/benefits/enrollments', { method: 'POST', body })).data;
export const createHistoricalBenefitEnrollment = async (body) =>
  (await apiRequest('/benefits/enrollments/historical', { method: 'POST', body })).data;
export const updateBenefitEnrollmentDraft = async (id, body) =>
  (await apiRequest(`/benefits/enrollments/${id}/draft`, { method: 'PATCH', body })).data;
export const benefitEnrollmentAction = async (id, action, body) =>
  (await apiRequest(`/benefits/enrollments/${id}/${action}`, { method: 'POST', body })).data;
export const exportBenefitEnrollments = (companyId, filters = {}) =>
  apiCsvRequest(`/benefits/enrollments/export?${query({ companyId, ...filters })}`);
