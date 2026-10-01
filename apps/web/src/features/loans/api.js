import { apiCsvRequest, apiRequest } from '../../lib/api/client.js';
const qs = (v) =>
  new URLSearchParams(Object.entries(v).filter(([, x]) => x !== undefined && x !== '')).toString();
export const getLoanTypes = async (companyId) =>
  (await apiRequest(`/loans/types?${qs({ companyId, page: 1, pageSize: 100 })}`)).data.items;
export const createLoanType = async (body) =>
  (await apiRequest('/loans/types', { method: 'POST', body })).data;
export const getLoanType = async (id) => (await apiRequest(`/loans/types/${id}`)).data;
export const updateLoanType = async (id, body) =>
  (await apiRequest(`/loans/types/${id}`, { method: 'PATCH', body })).data;
export const createLoanTypeVersion = async (id, body, correction = false) =>
  (
    await apiRequest(`/loans/types/${id}/${correction ? 'corrections' : 'versions'}`, {
      method: 'POST',
      body,
    })
  ).data;
export const deactivateLoanType = async (id, body) =>
  (await apiRequest(`/loans/types/${id}/deactivate`, { method: 'POST', body })).data;
export const getLoans = async ({ companyId, view = 'all', status, page = 1, pageSize = 25 }) =>
  (
    await apiRequest(
      `${view === 'own' ? '/loans/my' : view === 'team' ? '/loans/team' : '/loans'}?${qs({ companyId, status, page, pageSize })}`,
    )
  ).data.items;
export const getLoan = async (id, view = 'all') => {
  const path =
    view === 'own' ? `/loans/my/${id}` : view === 'team' ? `/loans/team/${id}` : `/loans/${id}`;
  return (await apiRequest(path)).data;
};
export const createLoan = async (body) =>
  (await apiRequest('/loans', { method: 'POST', body })).data;
export const updateLoanDraft = async (id, body) =>
  (await apiRequest(`/loans/${id}/draft`, { method: 'PATCH', body })).data;
export const loanAction = async (id, action, body) =>
  (await apiRequest(`/loans/${id}/${action}`, { method: 'POST', body })).data;
export const getLoanHistory = async (id) => (await apiRequest(`/loans/${id}/history`)).data;
export const getLoanAccount = async (id) => (await apiRequest(`/loans/accounts/${id}`)).data;
export const loanLedgerAction = async (id, kind, body) =>
  (await apiRequest(`/loans/accounts/${id}/${kind}`, { method: 'POST', body })).data;
export const reverseLoanLedgerEntry = async (accountId, entryId, body) =>
  (
    await apiRequest(`/loans/accounts/${accountId}/ledger/${entryId}/reversal`, {
      method: 'POST',
      body,
    })
  ).data;
export const exportLoans = async ({ companyId, status }) =>
  apiCsvRequest(`/loans/export?${qs({ companyId, status, page: 1, pageSize: 100 })}`);
