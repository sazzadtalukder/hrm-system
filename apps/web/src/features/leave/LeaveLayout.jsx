import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { hasPermissionScope } from '../../app/accessPolicy.js';

export function LeaveLayout() {
  const { permissions, permissionScopes } = useAuth();
  const broad = hasPermissionScope(permissionScopes, 'leave.view', [
    'all',
    'company',
    'branch',
    'department',
  ]);
  const own = hasPermissionScope(permissionScopes, 'leave.view', ['own']);
  const team = hasPermissionScope(permissionScopes, 'leave.view', ['direct_reports']);
  const canApply =
    permissions.includes('leave.apply') &&
    hasPermissionScope(permissionScopes, 'leave.apply', ['own']);
  const links = [
    ['requests', 'Requests', broad],
    ['my', 'My leave', own],
    ['team', 'Team leave', team],
    ['new', 'Apply', canApply],
    ['balances', 'Balances', permissions.includes('leave_balance.view')],
    [
      'setup',
      'Setup',
      permissions.some((permission) =>
        [
          'leave_type.create',
          'leave_policy.view',
          'leave_policy.create',
          'leave_policy.assign',
        ].includes(permission),
      ),
    ],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Leave</h1>
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
