import { apiRequest } from '../../lib/api/client.js';

export async function getCompanies() {
  return (await apiRequest('/organization/companies')).data.items;
}

export async function getCompany(id) {
  return (await apiRequest(`/organization/companies/${id}`)).data;
}

export async function updateCompany(id, body) {
  return (await apiRequest(`/organization/companies/${id}`, { method: 'PATCH', body })).data;
}

export async function getOrganizationRecords(path, companyId) {
  const query = new URLSearchParams({ companyId: String(companyId), page: '1', pageSize: '50' });
  return (await apiRequest(`/organization/${path}?${query}`)).data;
}

export async function createOrganizationRecord(path, body) {
  return (await apiRequest(`/organization/${path}`, { method: 'POST', body })).data;
}

export async function getOrganizationRecord(path, id) {
  return (await apiRequest(`/organization/${path}/${id}`)).data;
}

export async function updateOrganizationRecord(path, id, body) {
  return (await apiRequest(`/organization/${path}/${id}`, { method: 'PATCH', body })).data;
}

export async function transitionOrganizationRecord(path, id, action, body) {
  return apiRequest(`/organization/${path}/${id}/${action}`, { method: 'POST', body });
}

export async function replaceCalendarDays(id, body) {
  return (await apiRequest(`/organization/work-calendars/${id}/days`, { method: 'PUT', body }))
    .data;
}
