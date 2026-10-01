import { env } from '../../config/env.js';
import { ApiError } from './ApiError.js';
import {
  clearAccessToken,
  getAccessToken,
  publishAuthEvent,
  setAccessToken,
} from '../auth/session.js';

function createCorrelationId() {
  return globalThis.crypto?.randomUUID?.();
}

let refreshPromise;

async function performRefresh() {
  const execute = async () => {
    const headers = new Headers({ Accept: 'application/json' });
    const correlationId = createCorrelationId();
    if (correlationId) headers.set('X-Correlation-ID', correlationId);
    const response = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data?.accessToken) {
      clearAccessToken();
      publishAuthEvent('session-revoked');
      throw new ApiError({
        message: payload?.error?.message ?? 'The session has expired.',
        code: payload?.error?.code ?? 'SESSION_EXPIRED',
        status: response.status,
        requestId: payload?.requestId,
      });
    }
    setAccessToken(payload.data.accessToken);
    publishAuthEvent('refresh-complete');
    return payload.data.accessToken;
  };

  if (navigator.locks?.request) return navigator.locks.request('hrm-auth-refresh', execute);
  return execute();
}

export function refreshAccessToken() {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

export async function apiRequest(path, options = {}) {
  const {
    correlationId: suppliedCorrelationId,
    body: suppliedBody,
    skipAuthRefresh = false,
    _retried = false,
    ...fetchOptions
  } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set('Accept', 'application/json');
  const correlationId = suppliedCorrelationId ?? createCorrelationId();
  if (correlationId) headers.set('X-Correlation-ID', correlationId);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body = suppliedBody;
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...fetchOptions,
      body,
      headers,
      credentials: 'include',
    });
  } catch (cause) {
    throw new ApiError({
      message: 'The server could not be reached.',
      code: 'NETWORK_ERROR',
      status: 0,
      cause,
    });
  }

  const requestId = response.headers.get('x-request-id');
  let payload = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch (cause) {
      throw new ApiError({
        message: 'The server returned an invalid API response.',
        code: 'INVALID_API_RESPONSE',
        status: response.status,
        requestId,
        cause,
      });
    }
  }

  if (response.status === 401 && !skipAuthRefresh && !_retried) {
    await refreshAccessToken();
    return apiRequest(path, {
      ...fetchOptions,
      body: suppliedBody,
      correlationId: suppliedCorrelationId,
      skipAuthRefresh: true,
      _retried: true,
    });
  }

  if (!response.ok) {
    throw new ApiError({
      message: payload?.error?.message ?? 'The request failed.',
      code: payload?.error?.code ?? 'HTTP_ERROR',
      status: response.status,
      details: payload?.error?.details ?? [],
      requestId: payload?.requestId ?? requestId,
    });
  }

  return payload;
}

export async function apiCsvRequest(path, retried = false) {
  const headers = new Headers({ Accept: 'text/csv' });
  const correlationId = createCorrelationId();
  if (correlationId) headers.set('X-Correlation-ID', correlationId);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    credentials: 'include',
    headers,
  });
  if (response.status === 401 && !retried) {
    await refreshAccessToken();
    return apiCsvRequest(path, true);
  }
  if (!response.ok)
    throw new ApiError({
      message: 'The export request failed.',
      code: 'EXPORT_FAILED',
      status: response.status,
      requestId: response.headers.get('x-request-id'),
    });
  return response.text();
}
