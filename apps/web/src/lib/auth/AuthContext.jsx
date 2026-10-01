import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { queryClient } from '../../app/queryClient.js';
import { apiRequest, refreshAccessToken } from '../api/client.js';
import {
  clearAccessToken,
  publishAuthEvent,
  setAccessToken,
  subscribeAuthEvents,
} from './session.js';

/* eslint-disable react-refresh/only-export-components */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'unknown',
    user: null,
    permissions: [],
    permissionScopes: {},
  });

  async function loadCurrentUser() {
    const response = await apiRequest('/auth/me', { skipAuthRefresh: true });
    setState({ status: 'authenticated', ...response.data });
  }

  useEffect(() => {
    let active = true;
    refreshAccessToken()
      .then(() => active && loadCurrentUser())
      .catch(
        () =>
          active &&
          setState({ status: 'anonymous', user: null, permissions: [], permissionScopes: {} }),
      );
    const unsubscribe = subscribeAuthEvents((event) => {
      if (event.local) return;
      if (event.type === 'logout' || event.type === 'session-revoked') {
        clearAccessToken();
        queryClient.clear();
        setState({ status: 'anonymous', user: null, permissions: [], permissionScopes: {} });
      }
      if (event.type === 'authorization-changed') {
        queryClient.clear();
        refreshAccessToken()
          .then(loadCurrentUser)
          .catch(() => undefined);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      async login(credentials) {
        const response = await apiRequest('/auth/login', {
          method: 'POST',
          body: credentials,
          skipAuthRefresh: true,
        });
        setAccessToken(response.data.accessToken);
        await loadCurrentUser();
      },
      async logout() {
        await apiRequest('/auth/logout', { method: 'POST', skipAuthRefresh: true }).catch(
          () => undefined,
        );
        clearAccessToken();
        queryClient.clear();
        setState({ status: 'anonymous', user: null, permissions: [], permissionScopes: {} });
        publishAuthEvent('logout');
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
