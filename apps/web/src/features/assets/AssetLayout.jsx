import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function AssetLayout() {
  const { permissions } = useAuth();
  const admin = permissions.includes('asset.view');
  return (
    <div>
      <h1 className="text-2xl font-semibold">Asset Management</h1>
      <nav className="my-5 flex gap-2">
        <NavLink to={admin ? 'all' : 'my'}>{admin ? 'Assets' : 'My assets'}</NavLink>
        {permissions.includes('asset.create') && <NavLink to="new">Register asset</NavLink>}
        {permissions.includes('asset_category.create') && <NavLink to="setup">Categories</NavLink>}
      </nav>
      <Outlet />
    </div>
  );
}
