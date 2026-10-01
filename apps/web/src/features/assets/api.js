import { apiRequest } from '../../lib/api/client.js';
const query = (values) => new URLSearchParams(values).toString();
export const getAssets = async (companyId, own = false) =>
  (
    await apiRequest(
      `${own ? '/assets/my' : '/assets'}?${query({ companyId, page: 1, pageSize: 100 })}`,
    )
  ).data.items;
export const getAsset = async (id, own = false) =>
  (await apiRequest(`${own ? '/assets/my' : '/assets'}/${id}`)).data;
export const createAssetCategory = async (body) =>
  (await apiRequest('/assets/categories', { method: 'POST', body })).data;
export const createAsset = async (body) =>
  (await apiRequest('/assets', { method: 'POST', body })).data;
export const assetAction = async (id, action, body) =>
  (await apiRequest(`/assets/${id}/${action}`, { method: 'POST', body })).data;
