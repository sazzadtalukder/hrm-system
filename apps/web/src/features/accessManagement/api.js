import { apiRequest } from '../../lib/api/client.js';

const query = (values) => {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') result.set(key, String(value));
  }
  return result;
};

export async function getUsers(input) {
  return (await apiRequest(`/users?${query(input)}`)).data;
}
export async function getUser(id) {
  return (await apiRequest(`/users/${id}`)).data;
}
export async function createUser(body) {
  return (await apiRequest('/users', { method: 'POST', body })).data;
}
export async function updateUser(id, body) {
  return (await apiRequest(`/users/${id}`, { method: 'PATCH', body })).data;
}
export function userAction(id, action, reason) {
  return apiRequest(`/users/${id}/${action}`, { method: 'POST', body: { reason } });
}
export async function getPasswordSetupStatus(id, companyId) {
  return (await apiRequest(`/users/${id}/password-setup-status?${query({ companyId })}`)).data;
}
export async function issueInvitation(id, body) {
  return (await apiRequest(`/users/${id}/invitations`, { method: 'POST', body })).data;
}
export async function resetAuthentication(id, body) {
  return (await apiRequest(`/users/${id}/reset-authentication`, { method: 'POST', body })).data;
}
export async function getRoles() {
  return (await apiRequest('/access/roles')).data;
}
export async function getAssignments(userId) {
  return (await apiRequest(`/access/role-assignments?${query({ userId })}`)).data;
}
export async function getDirectGrants(userId) {
  return (await apiRequest(`/access/permission-grants?${query({ userId })}`)).data;
}
export async function getDirectGrantPermissions() {
  return (await apiRequest('/access/permissions/direct-grant-eligible')).data;
}
export async function assignRole(body) {
  return (await apiRequest('/access/role-assignments', { method: 'POST', body })).data;
}
export function revokeRole(id, reason) {
  return apiRequest(`/access/role-assignments/${id}/revoke`, {
    method: 'POST',
    body: { reason },
  });
}
export async function grantPermission(body) {
  return (await apiRequest('/access/permission-grants', { method: 'POST', body })).data;
}
export function revokePermission(id, reason) {
  return apiRequest(`/access/permission-grants/${id}/revoke`, {
    method: 'POST',
    body: { reason },
  });
}
export async function getSessions(companyId, userId) {
  return (await apiRequest(`/security-audit/sessions?${query({ companyId, userId })}`)).data.items;
}
