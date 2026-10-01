import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  hasAnyPermission,
  hasRequiredScope,
  navigationGroups,
  navigationItems,
  permissionsForPath,
  scopeRequirementForPath,
} from '../app/accessPolicy.js';
import { useAuth } from '../lib/auth/AuthContext.jsx';

const workspaceLinks = [
  ['My Attendance', 'Review your attendance records and daily status.', '/attendance/my', 'clock'],
  ['My Leave', 'Apply for leave and follow your requests.', '/leave/my', 'calendar'],
  ['My Payslips', 'Access your published payroll statements.', '/payroll/my-payslips', 'wallet'],
  ['My Benefits', 'Review your current benefit enrollments.', '/benefits/my', 'heart'],
  ['My Claims', 'Create and monitor expense claims.', '/claims/my', 'receipt'],
  ['My Loans', 'View facilities, schedules, and repayments.', '/loans/my', 'bank'],
  ['My Reviews', 'Complete and acknowledge performance reviews.', '/performance/my', 'chart'],
  ['My Learning', 'Browse training and track your enrollments.', '/training/my', 'book'],
  ['My Career', 'Manage your career and development plan.', '/career/my', 'growth'],
  ['My Onboarding', 'Follow assigned joining tasks and readiness.', '/onboarding/my', 'checklist'],
  ['My Assets', 'Review assets currently assigned to you.', '/assets/my', 'box'],
  ['My Documents', 'Access your authorized employee documents.', '/documents/my', 'document'],
  ['Manager Workspace', 'Open direct-report work and team actions.', '/manager', 'team'],
].map(([label, description, to, icon]) => ({ label, description, to, icon }));

const moduleDescriptions = {
  Organization: 'Company structure and operating units',
  Employees: 'Employee records and employment history',
  Recruitment: 'Hiring pipeline and candidate management',
  Onboarding: 'New-joiner cases and readiness',
  Attendance: 'Time records, shifts, and corrections',
  Leave: 'Requests, approvals, and balances',
  Payroll: 'Payroll processing and payslips',
  Benefits: 'Plans and employee enrollments',
  Claims: 'Expense claims and reimbursements',
  Loans: 'Loans, advances, and repayments',
  Performance: 'Review cycles and assessments',
  Training: 'Learning catalog and enrollments',
  Career: 'Career plans and development paths',
  Succession: 'Critical positions and succession planning',
  Assets: 'Asset register and assignments',
  Documents: 'Controlled employee documents',
  Exits: 'Employee exit and clearance workflow',
  Settlements: 'Final settlement preparation and decisions',
  Reports: 'Authorized workforce reporting',
  'Audit & Security': 'Security events and audit review',
  'Access management': 'Users, roles, grants, and sessions',
};

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    bank: <path d="M3 10h18M5 10V20M9 10V20M15 10V20M19 10V20M3 20h18M12 3 3 8h18L12 3Z" />,
    book: (
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Zm16 0A2.5 2.5 0 0 0 17.5 3H13v17h4.5a2.5 2.5 0 0 1 2.5 2V5.5Z" />
    ),
    box: <path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10" />,
    calendar: <path d="M7 2v4m10-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" />,
    chart: <path d="M4 20V10m6 10V4m6 16v-7m5 7H2" />,
    checklist: <path d="m4 6 2 2 4-4M4 13l2 2 4-4M13 7h7m-7 7h7m-7 6h7" />,
    clock: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v5l3 2" />,
    document: <path d="M6 2h8l4 4v16H6V2Zm8 0v5h4M9 12h6m-6 4h6" />,
    growth: <path d="M4 20V9m6 11V4m6 16v-7m-9 1 4-4 3 2 6-7" />,
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    receipt: <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm3 6h6m-6 4h6m-6 4h4" />,
    team: (
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-12a4 4 0 0 1 0 7.8" />
    ),
    wallet: <path d="M3 6h16a2 2 0 0 1 2 2v11H3V6Zm0 0V4h14v2m0 6h4m-4 0v3h4" />,
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name] ?? paths.document}
    </svg>
  );
}

function canOpen(path, permissions, permissionScopes) {
  return (
    hasAnyPermission(permissions, permissionsForPath(path)) &&
    hasRequiredScope(permissionScopes, scopeRequirementForPath(path))
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function displayIdentity(email) {
  const local = email?.split('@')[0] ?? 'there';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function FoundationPage() {
  const auth = useAuth();
  const permissions = useMemo(() => new Set(auth.permissions), [auth.permissions]);
  const quickLinks = useMemo(
    () => workspaceLinks.filter((link) => canOpen(link.to, permissions, auth.permissionScopes)),
    [auth.permissionScopes, permissions],
  );
  const modules = useMemo(
    () =>
      navigationItems
        .filter((item) => item.placement !== 'header')
        .map((item) => {
          const destination = (item.children ?? [item]).find((candidate) => {
            const target =
              typeof candidate.to === 'function'
                ? candidate.to(permissions, auth.permissionScopes)
                : candidate.to;
            return (
              target &&
              hasAnyPermission(permissions, candidate.permissions) &&
              canOpen(target, permissions, auth.permissionScopes)
            );
          });
          if (!destination) return null;
          const target =
            typeof destination.to === 'function'
              ? destination.to(permissions, auth.permissionScopes)
              : destination.to;
          return {
            label: item.label,
            description: moduleDescriptions[item.label] ?? 'Open your authorized workspace',
            group: item.group,
            to: target,
          };
        })
        .filter(Boolean),
    [auth.permissionScopes, permissions],
  );
  const visibleModules = modules.slice(0, 8);
  const scopeLabels = useMemo(
    () =>
      [...new Set(Object.values(auth.permissionScopes ?? {}).flat())]
        .map((scope) => scope.replaceAll('_', ' '))
        .sort(),
    [auth.permissionScopes],
  );
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-6 py-8 text-white shadow-lg shadow-blue-950/10 sm:px-8 sm:py-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
        <div className="absolute -bottom-24 right-24 h-56 w-56 rounded-full border border-white/10 bg-blue-400/10" />
        <div className="relative max-w-3xl">
          <p className="text-sm font-medium text-blue-200">{today}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {greeting()}, {displayIdentity(auth.user?.email)}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Welcome to your HR workspace. Access the services, team operations, and business tools
            available to you from one secure place.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {scopeLabels.slice(0, 4).map((scope) => (
              <span
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium capitalize text-blue-50 backdrop-blur"
                key={scope}
              >
                {scope} access
              </span>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="workspace-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Quick access
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight" id="workspace-title">
              My workspace
            </h2>
            <p className="mt-1 text-sm text-secondary">
              Your most relevant self-service and team workspaces.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            {quickLinks.length} available
          </span>
        </div>
        {quickLinks.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickLinks.slice(0, 8).map((link) => (
              <Link
                className="group rounded-xl border border-subtle bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                key={link.to}
                to={link.to}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-blue-50 p-2.5 text-accent transition group-hover:bg-accent group-hover:text-white">
                    <Icon name={link.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-primary">
                      {link.label}
                      <span
                        aria-hidden="true"
                        className="text-secondary transition-transform group-hover:translate-x-1 group-hover:text-accent"
                      >
                        →
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-secondary">
                      {link.description}
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-subtle bg-surface p-6 text-sm text-secondary">
            No self-service workspace is assigned to this account. Use the authorized business
            modules below or contact your administrator.
          </div>
        )}
      </section>

      <section aria-labelledby="modules-title" className="pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Authorized access
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight" id="modules-title">
          Business modules
        </h2>
        <p className="mt-1 text-sm text-secondary">
          These areas reflect your current permissions and organization scope.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm">
          {visibleModules.map((module, index) => (
            <Link
              className={`group flex items-center gap-4 px-4 py-4 transition hover:bg-app sm:px-5 ${index ? 'border-t border-subtle' : ''}`}
              key={`${module.group}-${module.label}`}
              to={module.to}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-800">
                {module.label.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-primary">{module.label}</span>
                <span className="block truncate text-sm text-secondary">{module.description}</span>
              </span>
              <span className="hidden rounded-full border border-subtle px-2.5 py-1 text-xs text-secondary sm:inline">
                {navigationGroups.includes(module.group) ? module.group : 'Workspace'}
              </span>
              <span
                aria-hidden="true"
                className="text-lg text-secondary transition-transform group-hover:translate-x-1 group-hover:text-accent"
              >
                →
              </span>
            </Link>
          ))}
          {!visibleModules.length ? (
            <div className="p-6 text-sm text-secondary">
              No business module is assigned to this account.
            </div>
          ) : null}
        </div>
        {modules.length > visibleModules.length ? (
          <p className="mt-3 text-sm text-secondary">
            {modules.length - visibleModules.length} more authorized module
            {modules.length - visibleModules.length === 1 ? '' : 's'} are available from the
            sidebar.
          </p>
        ) : null}
      </section>
    </div>
  );
}
