import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';

const links = [
  ['Company', 'company', 'company.view'],
  ['Branches', 'branches', 'branch.view'],
  ['Departments', 'departments', 'department.view'],
  ['Designations', 'designations', 'designation.view'],
  ['Grades', 'grades', 'grade.view'],
  ['Cost centers', 'cost-centers', 'cost_center.view'],
  ['Work calendars', 'work-calendars', 'work_calendar.view'],
  ['Holidays', 'holidays', 'holiday.view'],
];

export function OrganizationLayout() {
  const auth = useAuth();
  return (
    <section>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Organization</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Organization setup</h1>
        <p className="mt-2 text-secondary">Manage company-owned organization reference data.</p>
      </div>
      <nav
        className="mb-8 flex gap-2 overflow-x-auto border-b border-subtle"
        aria-label="Organization setup"
      >
        {links
          .filter(([, , permission]) => auth.permissions.includes(permission))
          .map(([label, path]) => (
            <NavLink
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${isActive ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'}`
              }
              key={path}
              to={path}
            >
              {label}
            </NavLink>
          ))}
      </nav>
      <Outlet />
    </section>
  );
}
