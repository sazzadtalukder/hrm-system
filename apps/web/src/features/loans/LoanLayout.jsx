import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function LoanLayout() {
  const { permissions } = useAuth(),
    links = [
      ['my', 'My loans', 'loan.view_own'],
      ['new', 'Apply', 'loan.apply'],
      ['team', 'Team approvals', 'loan.view_team'],
      ['all', 'Loans', 'loan.view'],
      ['types', 'Facility types', 'loan_type.view'],
    ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Loans & Salary Advances</h1>
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
