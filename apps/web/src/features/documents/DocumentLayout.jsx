import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function DocumentLayout() {
  const { permissions } = useAuth();
  const admin = permissions.includes('document.view');
  return (
    <div>
      <h1 className="text-2xl font-semibold">Document Management</h1>
      <nav className="my-5 flex gap-3">
        <NavLink to={admin ? 'all' : 'my'}>{admin ? 'Documents' : 'My documents'}</NavLink>
        {permissions.includes('document.create') && <NavLink to="new">New document</NavLink>}
        {permissions.includes('document_type.create') && (
          <NavLink to="setup">Document types</NavLink>
        )}
      </nav>
      <Outlet />
    </div>
  );
}
