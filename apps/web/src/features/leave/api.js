import { apiRequest } from '../../lib/api/client.js';

const query = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  ).toString();

export async function getLeaveRequests(filters) {
  return (await apiRequest(`/leave/requests?${query(filters)}`)).data;
}
export async function getLeaveRequest(id) {
  return (await apiRequest(`/leave/requests/${id}`)).data;
}
export async function getLeaveTypes(companyId) {
  return (await apiRequest(`/leave/types?${query({ companyId })}`)).data;
}
export async function getOwnLeaveEmployment(companyId) {
  return (await apiRequest(`/leave/my-employment?${query({ companyId })}`)).data;
}
export async function getLeavePolicies(companyId) {
  return (await apiRequest(`/leave/policies?${query({ companyId })}`)).data;
}
export async function getLeavePolicyAssignments(employmentId) {
  return (await apiRequest(`/leave/employments/${employmentId}/policy-assignments`)).data;
}
export async function assignLeavePolicy(employmentId, body) {
  return (
    await apiRequest(`/leave/employments/${employmentId}/policy-assignments`, {
      method: 'POST',
      body,
    })
  ).data;
}
export async function createLeaveRequest(body) {
  return (await apiRequest('/leave/requests', { method: 'POST', body })).data;
}
export async function submitLeaveRequest(id, body) {
  return (await apiRequest(`/leave/requests/${id}/submit`, { method: 'POST', body })).data;
}
export async function decideLeaveRequest(id, action, body) {
  return (await apiRequest(`/leave/requests/${id}/${action}`, { method: 'POST', body })).data;
}
export async function requestLeaveCancellation(id, body) {
  return (await apiRequest(`/leave/requests/${id}/cancellation-requests`, { method: 'POST', body }))
    .data;
}
export async function getLeaveBalances(employmentId, asOfDate) {
  return (await apiRequest(`/leave/employments/${employmentId}/balances?${query({ asOfDate })}`))
    .data;
}
