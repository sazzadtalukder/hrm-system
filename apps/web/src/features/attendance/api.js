import { apiRequest } from '../../lib/api/client.js';

const query = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  ).toString();

export async function getAttendanceRecords(filters) {
  return (await apiRequest(`/attendance/records?${query(filters)}`)).data;
}
export async function getAttendanceRecord(id) {
  return (await apiRequest(`/attendance/records/${id}`)).data;
}
export async function getAttendanceShifts(companyId) {
  return (await apiRequest(`/attendance/shifts?${query({ companyId })}`)).data;
}
export async function getAttendanceEmploymentOptions(filters) {
  return (await apiRequest(`/attendance/employment-options?${query(filters)}`)).data;
}
export async function createAttendanceShift(body) {
  return (await apiRequest('/attendance/shifts', { method: 'POST', body })).data;
}
export async function assignAttendanceShift(employmentId, body) {
  return (
    await apiRequest(`/attendance/employments/${employmentId}/shift-assignments`, {
      method: 'POST',
      body,
    })
  ).data;
}
export async function getAttendanceShiftAssignments(employmentId) {
  return (await apiRequest(`/attendance/employments/${employmentId}/shift-assignments`)).data;
}
export async function getAttendanceCorrections(companyId) {
  return (await apiRequest(`/attendance/corrections?${query({ companyId })}`)).data;
}
export async function getAttendanceLocks(companyId) {
  return (await apiRequest(`/attendance/locks?${query({ companyId })}`)).data;
}
export async function getAttendanceEvents(filters) {
  return (await apiRequest(`/attendance/events?${query(filters)}`)).data;
}
export async function createManualAttendanceEvent(body) {
  return (await apiRequest('/attendance/events/manual', { method: 'POST', body })).data;
}
export async function importAttendanceJson(body) {
  return (await apiRequest('/attendance/imports/json', { method: 'POST', body })).data;
}
export async function createCorrection(recordId, body) {
  return (await apiRequest(`/attendance/records/${recordId}/corrections`, { method: 'POST', body }))
    .data;
}
export async function decideCorrection(id, action, body) {
  return (await apiRequest(`/attendance/corrections/${id}/${action}`, { method: 'POST', body }))
    .data;
}
export async function transitionCorrection(id, action, body) {
  return (await apiRequest(`/attendance/corrections/${id}/${action}`, { method: 'POST', body }))
    .data;
}
export async function calculateAttendance(body) {
  return (await apiRequest('/attendance/calculate', { method: 'POST', body })).data;
}
