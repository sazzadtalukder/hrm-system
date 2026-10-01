import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function BenefitLayout() {
  const { permissions } = useAuth();
  const links = [
    ['enrollments', 'Enrollments', 'benefit_enrollment.view'],
    ['plans', 'Plans', 'benefit_plan.view'],
    ['new', 'New enrollment', 'benefit_enrollment.create'],
    ['my', 'My benefits', 'benefit_enrollment.view_own'],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Benefits</h1>
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
