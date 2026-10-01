import { apiRequest } from '../../lib/api/client.js';
const query = (v) => new URLSearchParams(v).toString();
export const onboardingList = async (resource, companyId) =>
  (await apiRequest(`/onboarding/${resource}?${query({ companyId, page: 1, pageSize: 25 })}`)).data
    .items;
export const onboardingGet = async (id, own = false) =>
  (await apiRequest(`/onboarding/cases${own ? '/my' : ''}/${id}`)).data;
export const onboardingAction = async (id, action, body) =>
  (await apiRequest(`/onboarding/cases/${id}/${action}`, { method: 'POST', body })).data;
export const onboardingCaseRequest = async (caseId, path, body) =>
  (
    await apiRequest(`/onboarding/cases/${caseId}/${path}`, {
      method: 'POST',
      body,
    })
  ).data;
export const onboardingTaskAction = async (taskId, action, body) =>
  (await apiRequest(`/onboarding/cases/tasks/${taskId}/${action}`, { method: 'POST', body })).data;
