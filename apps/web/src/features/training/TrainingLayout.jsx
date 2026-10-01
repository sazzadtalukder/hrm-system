import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
export function TrainingLayout() {
  const { permissions } = useAuth();
  const links = [
    ['catalog', 'Catalog', 'training_course.view'],
    ['my', 'My training', 'training_enrollment.view_own'],
    ['team', 'Team training', 'training_enrollment.view_team'],
    ['enrollments', 'Enrollments', 'training_enrollment.view'],
    ['sessions', 'Sessions', 'training_session.view'],
    ['admin/sessions/new', 'Session administration', 'training_session.create'],
    ['nominate', 'Nominate', 'training_enrollment.nominate'],
    ['assign', 'Assign', 'training_enrollment.assign'],
    ['setup', 'Setup', 'training_course.create'],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Training &amp; Development</h1>
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
