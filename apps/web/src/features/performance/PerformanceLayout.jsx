import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function PerformanceLayout() {
  const { permissions } = useAuth(),
    links = [
      ['my', 'My reviews', 'performance_review.view_own'],
      ['team', 'Team reviews', 'performance_review.view_team'],
      ['all', 'Reviews', 'performance_review.view'],
      ['cycles', 'Cycles', 'performance_cycle.view'],
      ['setup', 'Setup', 'performance_template.create'],
    ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Performance Management</h1>
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
