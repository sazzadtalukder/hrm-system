import { apiRequest } from '../../lib/api/client.js';
const query = (values) => new URLSearchParams(values).toString();
export const getDocuments = async (companyId, own = false) =>
  (
    await apiRequest(
      `${own ? '/documents/my' : '/documents'}?${query({ companyId, page: 1, pageSize: 100 })}`,
    )
  ).data.items;
export const getDocument = async (id, own = false) =>
  (await apiRequest(`${own ? '/documents/my' : '/documents'}/${id}`)).data;
export const getDocumentHistory = async (id, own = false) =>
  (await apiRequest(`${own ? '/documents/my' : '/documents'}/${id}/history`)).data;
export const createDocument = async (body) =>
  (await apiRequest('/documents', { method: 'POST', body })).data;
export const documentAction = async (id, action, body, own = false) =>
  (
    await apiRequest(`${own ? '/documents/my' : '/documents'}/${id}/${action}`, {
      method: 'POST',
      body,
    })
  ).data;
export const createDocumentType = async (body) =>
  (await apiRequest('/documents/types', { method: 'POST', body })).data;
