import { NavLink, Outlet } from 'react-router';

export function EmployeeLayout() {
  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <p className="mt-1 text-sm text-secondary">
          Employee records, employment, and organization history
        </p>
      </div>
      <nav aria-label="Employee management" className="mb-6 flex gap-2 border-b border-subtle">
        <NavLink
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium ${isActive ? 'border-b-2 border-accent text-primary' : 'text-secondary'}`
          }
          end
          to="/employees"
        >
          Directory
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
