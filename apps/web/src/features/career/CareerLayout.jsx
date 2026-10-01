import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function CareerLayout() {
  const { permissions } = useAuth(),
    links = [
      ['my', 'My career', 'career_plan.view_own'],
      ['team', 'Team plans', 'career_plan.view_team'],
      ['plans', 'Plans', 'career_plan.view'],
      ['paths', 'Career paths', 'career_path.view'],
    ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Career Development</h1>
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
