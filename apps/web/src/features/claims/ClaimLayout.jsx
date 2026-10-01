import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function ClaimLayout() {
  const { permissions } = useAuth();
  const links = [
    ['my', 'My claims', 'claim.view_own'],
    ['new', 'New claim', 'claim.create'],
    ['team', 'Team claims', 'claim.view_team'],
    ['all', 'Claims', 'claim.view'],
    ['categories', 'Categories', 'claim_category.view'],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Claims</h1>
      <nav className="my-5 flex flex-wrap gap-2">
        {links
          .filter(([, , p]) => permissions.includes(p))
          .map(([path, label]) => (
            <NavLink
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-accent text-white' : 'border border-subtle bg-surface'}`
              }
              key={path}
              to={path}
            >
              {label}
            </NavLink>
          ))}
      </nav>
      <Outlet />
    </div>
  );
}
