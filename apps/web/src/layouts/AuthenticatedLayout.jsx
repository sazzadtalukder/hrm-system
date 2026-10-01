import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth/AuthContext.jsx';
import { AppLayout } from './AppLayout.jsx';
import { ForbiddenState } from '../components/ui/PageState.jsx';
import {
  hasAnyPermission,
  hasRequiredScope,
  permissionsForPath,
  scopeRequirementForPath,
} from '../app/accessPolicy.js';

export function AuthenticatedLayout() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'unknown')
    return <main className="p-8 text-secondary">Loading session…</main>;
  if (auth.status !== 'authenticated')
    return <Navigate to="/login" replace state={{ from: location }} />;
  const required = permissionsForPath(location.pathname);
  const scopeRequirement = scopeRequirementForPath(location.pathname);
  if (
    !hasAnyPermission(new Set(auth.permissions), required) ||
    !hasRequiredScope(auth.permissionScopes, scopeRequirement)
  )
    return (
      <AppLayout>
        <ForbiddenState />
      </AppLayout>
    );
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
