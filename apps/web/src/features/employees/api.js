import { apiRequest } from '../../lib/api/client.js';

export async function getEmployees(companyId, filters = {}) {
  const query = new URLSearchParams({
    companyId: String(companyId),
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  for (const [key, value] of Object.entries(filters))
    if (value !== '' && value != null && !['page', 'pageSize'].includes(key))
      query.set(key, String(value));
  return (await apiRequest(`/employees?${query}`)).data;
}
export async function getEmployee(id) {
  return (await apiRequest(`/employees/${id}`)).data;
}
export async function createEmployee(body) {
  return (await apiRequest('/employees', { method: 'POST', body })).data;
}
export async function updateEmployee(id, body) {
  return (await apiRequest(`/employees/${id}`, { method: 'PATCH', body })).data;
}
export async function linkEmployeeUser(id, body) {
  return (await apiRequest(`/employees/${id}/user-link`, { method: 'POST', body })).data;
}
export async function transitionEmployee(id, action, body) {
  return apiRequest(`/employees/${id}/${action}`, { method: 'POST', body });
}
export async function getEmployeeHistory(id) {
  return (await apiRequest(`/employees/${id}/history`)).data;
}
export async function addEmployeeAssignment(id, body) {
  return (await apiRequest(`/employees/${id}/assignments`, { method: 'POST', body })).data;
}
export async function addStatusTransition(id, body) {
  return (await apiRequest(`/employees/${id}/status-transitions`, { method: 'POST', body })).data;
}
export async function getEmployeePersonal(id) {
  return (await apiRequest(`/employees/${id}/personal`)).data;
}
export async function updateEmployeePersonal(id, body) {
  return (await apiRequest(`/employees/${id}/personal`, { method: 'PATCH', body })).data;
}
export async function getEmployeeContact(id) {
  return (await apiRequest(`/employees/${id}/contact`)).data;
}
export async function updateEmployeeContact(id, body) {
  return (await apiRequest(`/employees/${id}/contact`, { method: 'PATCH', body })).data;
}
