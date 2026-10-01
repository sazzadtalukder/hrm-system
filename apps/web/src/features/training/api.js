import { apiRequest } from '../../lib/api/client.js';
const query = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  ).toString();
export const getTrainingCourses = async (companyId) =>
  (await apiRequest(`/training/courses?${query({ companyId, page: 1, pageSize: 100 })}`)).data
    .items;
export const getTrainingProviders = async (companyId) =>
  (await apiRequest(`/training/providers?${query({ companyId, page: 1, pageSize: 100 })}`)).data
    .items;
export const getTrainingSessions = async (companyId) =>
  (await apiRequest(`/training/sessions?${query({ companyId, page: 1, pageSize: 100 })}`)).data
    .items;
export const createTrainingCourse = async (body) =>
  (await apiRequest('/training/courses', { method: 'POST', body })).data;
export const createTrainingProvider = async (body) =>
  (await apiRequest('/training/providers', { method: 'POST', body })).data;
export const createTrainingSession = async (body) =>
  (await apiRequest('/training/sessions', { method: 'POST', body })).data;
export const getTrainingEnrollments = async ({ companyId, view = 'all' }) =>
  (
    await apiRequest(
      `${view === 'own' ? '/training/my' : view === 'team' ? '/training/team' : '/training/enrollments'}?${query({ companyId, page: 1, pageSize: 100 })}`,
    )
  ).data.items;
export const getTrainingEnrollment = async (id, view = 'all') =>
  (
    await apiRequest(
      view === 'own'
        ? `/training/my/${id}`
        : view === 'team'
          ? `/training/team/${id}`
          : `/training/enrollments/${id}`,
    )
  ).data;
export const getTrainingHistory = async (id, view = 'all') =>
  (
    await apiRequest(
      view === 'own'
        ? `/training/my/${id}/history`
        : view === 'team'
          ? `/training/team/${id}/history`
          : `/training/enrollments/${id}/history`,
    )
  ).data;
export const createTrainingEnrollment = async (body, source = 'self') =>
  (
    await apiRequest(
      source === 'nomination'
        ? '/training/team/nominations'
        : source === 'assignment'
          ? '/training/assignments'
          : '/training/my',
      { method: 'POST', body },
    )
  ).data;
export const trainingAction = async (id, action, body) =>
  (await apiRequest(`/training/enrollments/${id}/${action}`, { method: 'POST', body })).data;
export const sessionAction = async (id, action, body) =>
  (await apiRequest(`/training/sessions/${id}/${action}`, { method: 'POST', body })).data;
export const recordTrainingOutcome = async (id, kind, body) =>
  (await apiRequest(`/training/enrollments/${id}/${kind}`, { method: 'POST', body })).data;
