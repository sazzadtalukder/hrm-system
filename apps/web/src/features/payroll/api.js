import { apiRequest } from '../../lib/api/client.js';

const query = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  ).toString();
export const getPayrollPeriods = async (companyId) =>
  (await apiRequest(`/payroll/periods?${query({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const createPayrollPeriod = async (body) =>
  (await apiRequest('/payroll/periods', { method: 'POST', body })).data;
export const getPayrollComponents = async (companyId) =>
  (await apiRequest(`/payroll/components?${query({ companyId, page: 1, pageSize: 100 })}`)).data
    .items;
export const createPayrollComponent = async (body) =>
  (await apiRequest('/payroll/components', { method: 'POST', body })).data;
export const getPayrollRuns = async (companyId) =>
  (await apiRequest(`/payroll/runs?${query({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const getPayrollRun = async (id) => (await apiRequest(`/payroll/runs/${id}`)).data;
export const createPayrollRun = async (body) =>
  (await apiRequest('/payroll/runs', { method: 'POST', body })).data;
export const payrollAction = async (id, action, body) =>
  (await apiRequest(`/payroll/runs/${id}/${action}`, { method: 'POST', body })).data;
export const getMyPayslips = async () => (await apiRequest('/payroll/payslips/my')).data.items;
export const getPayrollResult = async (id) => (await apiRequest(`/payroll/results/${id}`)).data;
export const addCompensation = async (employmentId, body) =>
  (
    await apiRequest(`/payroll/employments/${employmentId}/compensation-periods`, {
      method: 'POST',
      body,
    })
  ).data;
export const addRecurringInput = async (employmentId, body) =>
  (
    await apiRequest(`/payroll/employments/${employmentId}/recurring-components`, {
      method: 'POST',
      body,
    })
  ).data;
export const addOneTimeInput = async (body) =>
  (await apiRequest('/payroll/one-time-inputs', { method: 'POST', body })).data;
export const createAdjustment = async (resultId, body) =>
  (await apiRequest(`/payroll/results/${resultId}/adjustments`, { method: 'POST', body })).data;
export const reversePayrollResult = async (resultId, body) =>
  (await apiRequest(`/payroll/results/${resultId}/reverse`, { method: 'POST', body })).data;
