import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { hasPermissionScope } from '../../app/accessPolicy.js';

export function AttendanceLayout() {
  const { permissions, permissionScopes } = useAuth();
  const broad = hasPermissionScope(permissionScopes, 'attendance.view', [
    'all',
    'company',
    'branch',
    'department',
  ]);
  const own = hasPermissionScope(permissionScopes, 'attendance.view', ['own']);
  const team = hasPermissionScope(permissionScopes, 'attendance.view', ['direct_reports']);
  const links = [
    ['records', 'Records', broad],
    ['my', 'My attendance', own],
    ['team', 'Team attendance', team],
    ['events', 'Raw events', permissions.includes('attendance_event.view')],
    ['imports', 'Imports', permissions.includes('attendance_import.create')],
    ['calculate', 'Calculate', permissions.includes('attendance.calculate')],
    ['corrections', 'Corrections', permissions.includes('attendance_correction.view')],
    ['shifts', 'Shifts', permissions.includes('attendance_shift.view')],
    [
      'locks',
      'Locks',
      permissions.includes('attendance.lock') || permissions.includes('attendance.unlock'),
    ],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Attendance</h1>
      <nav className="my-5 flex flex-wrap gap-2">
        {links
          .filter(([, , visible]) => visible)
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
