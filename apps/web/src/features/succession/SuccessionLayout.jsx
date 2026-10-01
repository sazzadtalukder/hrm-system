import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function SuccessionLayout() {
  const { permissions } = useAuth(),
    links = [
      ['plans', 'Plans', 'succession_plan.view'],
      ['critical-positions', 'Critical positions', 'critical_position.view'],
      ['nominations', 'Nominations', 'succession_nomination.view'],
      ['team', 'Team nominations', 'succession_nomination.view_team'],
    ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Succession Management</h1>
      <nav className="my-5 flex flex-wrap gap-2">
        {links
          .filter(([, , p]) => permissions.includes(p))
          .map(([x, l]) => (
            <NavLink
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-accent text-white' : 'border border-subtle bg-surface'}`
              }
              key={x}
              to={x}
            >
              {l}
            </NavLink>
          ))}
      </nav>
      <Outlet />
    </div>
  );
}
