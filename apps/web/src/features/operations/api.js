import { apiRequest } from '../../lib/api/client.js';
const query = (values) => {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) result.set(key, String(value));
  return result;
};
export const getExits = async (companyId, filters = {}) =>
  (await apiRequest(`/exits?${query({ companyId, page: 1, pageSize: 100, ...filters })}`)).data
    .items;
export const getExit = async (id) => (await apiRequest(`/exits/${id}`)).data;
export const transitionExit = async (id, action, body) =>
  (await apiRequest(`/exits/${id}/${action}`, { method: 'POST', body })).data;
export const updateExitClearance = async (id, area, body) =>
  (await apiRequest(`/exits/${id}/clearances/${area}`, { method: 'POST', body })).data;
export const getSettlements = async (companyId) =>
  (await apiRequest(`/final-settlements?companyId=${companyId}&pageSize=100`)).data.items;
export const getSettlement = async (id) => (await apiRequest(`/final-settlements/${id}`)).data;
export const createSettlement = async (body) =>
  (await apiRequest('/final-settlements', { method: 'POST', body })).data;
export const transitionSettlement = async (id, action, body) =>
  (await apiRequest(`/final-settlements/${id}/${action}`, { method: 'POST', body })).data;
export const getWorkforceReport = async (companyId) =>
  (await apiRequest(`/reports/workforce?companyId=${companyId}`)).data;
export const getNotifications = async (companyId) =>
  (await apiRequest(`/notifications?companyId=${companyId}&pageSize=100`)).data.items;
export const getUnreadNotificationCount = async (companyId) =>
  (await apiRequest(`/notifications/unread-count?companyId=${companyId}`)).data.unreadCount;
export const getAuditEvents = async (companyId, filters = {}) =>
  (
    await apiRequest(
      `/security-audit/events?${query({ companyId, page: 1, pageSize: 25, ...filters })}`,
    )
  ).data;
export const createExit = async (body) =>
  (await apiRequest('/exits', { method: 'POST', body })).data;
export const markNotificationRead = async (id) =>
  (await apiRequest(`/notifications/${id}/read`, { method: 'POST', body: {} })).data;
export const createNotification = async (body) =>
  (await apiRequest('/notifications', { method: 'POST', body })).data;
