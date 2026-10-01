import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';

export function PayrollLayout() {
  const { permissions } = useAuth();
  const links = [
    ['runs', 'Runs', 'payroll.view'],
    ['setup', 'Setup', 'payroll_period.view'],
    ['inputs', 'Compensation & inputs', 'payroll_input.view'],
    ['new', 'New run', 'payroll.create'],
    ['my-payslips', 'My payslips', 'payslip.view_own'],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Payroll</h1>
      <nav className="my-5 flex flex-wrap gap-2">
        {links
          .filter(([, , permission]) => permissions.includes(permission))
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
