import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  hasAnyPermission,
  hasRequiredScope,
  navigationGroups,
  navigationItems,
  permissionsForPath,
  scopeRequirementForPath,
} from '../app/accessPolicy.js';
import { useAuth } from '../lib/auth/AuthContext.jsx';
import { getUnreadNotificationCount } from '../features/operations/api.js';
import { useOrganizationCompany } from '../features/organization/useOrganizationCompany.js';

const itemClass = ({ isActive }) =>
  `flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 ${
    isActive
      ? 'bg-accent text-white shadow-sm shadow-blue-900/15'
      : 'text-secondary hover:bg-app hover:text-primary hover:shadow-sm'
  }`;

const parentItemClass = (isActive) =>
  `flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold transition-all duration-150 ${
    isActive
      ? 'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-100'
      : 'text-primary hover:bg-app hover:text-accent'
  }`;

const childItemClass = ({ isActive }) =>
  `flex min-h-9 items-center rounded-md px-3 py-1.5 text-sm transition-all duration-150 ${
    isActive
      ? 'bg-accent text-white shadow-sm shadow-blue-900/15'
      : 'text-secondary hover:bg-app hover:text-primary'
  }`;

const disabledItemClass =
  'flex min-h-10 cursor-not-allowed items-center rounded-md bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-400';

function resolveTarget(item, permissions, scopes) {
  return typeof item.to === 'function' ? item.to(permissions, scopes) : item.to;
}

function Sidebar({ groups, collapsed, mobile, onClose, onCollapse }) {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState({});

  const itemIsActive = (item) =>
    item.children?.some(itemIsActive) ??
    (item.target ? location.pathname.startsWith(item.target) : false);
  const activeGroup = groups.find((group) => group.items.some(itemIsActive))?.label;

  return (
    <div className="flex h-full flex-col bg-surface shadow-sm">
      <div className="flex h-16 items-center border-b border-subtle bg-app/60 px-4">
        <Link
          className="rounded px-1 text-lg font-semibold tracking-tight text-primary transition-colors hover:text-accent"
          onClick={onClose}
          to="/"
        >
          {collapsed && !mobile ? 'H' : 'HRM'}
        </Link>
        {mobile && (
          <button
            aria-label="Close navigation"
            className="ml-auto rounded-md p-2 text-secondary hover:bg-app"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        )}
      </div>
      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const open =
            collapsed && !mobile
              ? true
              : Object.hasOwn(openGroups, group.label)
                ? Boolean(openGroups[group.label])
                : group.label === activeGroup;
          return (
            <section className="mb-3" key={group.label}>
              {collapsed && !mobile ? null : (
                <button
                  aria-expanded={open}
                  className="flex w-full items-center justify-between rounded-md border-y border-subtle/70 bg-app/40 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-secondary transition-colors hover:bg-app hover:text-primary"
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [group.label]: !current[group.label],
                    }))
                  }
                  type="button"
                >
                  <span>{group.label}</span>
                  <span aria-hidden="true">{open ? '−' : '+'}</span>
                </button>
              )}
              {open && (
                <div
                  className={`mt-1 space-y-1 ${
                    collapsed && !mobile ? '' : 'ml-1 border-l border-subtle pl-2'
                  }`}
                >
                  {group.items.map((item) => {
                    const hasChildren = item.children?.length;
                    const itemOpen = Object.hasOwn(openGroups, item.label)
                      ? Boolean(openGroups[item.label])
                      : itemIsActive(item);
                    if (!hasChildren && item.disabled)
                      return (
                        <div
                          aria-disabled="true"
                          className={disabledItemClass}
                          key={item.label}
                          title={collapsed && !mobile ? `${item.label} (not available)` : undefined}
                        >
                          {collapsed && !mobile ? (
                            <span className="mx-auto" aria-hidden="true">
                              {item.label.slice(0, 1)}
                            </span>
                          ) : (
                            item.label
                          )}
                        </div>
                      );
                    if (!hasChildren)
                      return (
                        <NavLink
                          className={itemClass}
                          key={item.label}
                          onClick={onClose}
                          title={collapsed && !mobile ? item.label : undefined}
                          to={item.target}
                        >
                          {collapsed && !mobile ? (
                            <span className="mx-auto" aria-hidden="true">
                              {item.label.slice(0, 1)}
                            </span>
                          ) : (
                            item.label
                          )}
                        </NavLink>
                      );
                    return (
                      <div key={item.label}>
                        <button
                          aria-expanded={itemOpen}
                          className={`${parentItemClass(itemIsActive(item))} w-full justify-between`}
                          onClick={() =>
                            setOpenGroups((current) => ({
                              ...current,
                              [item.label]: !itemOpen,
                            }))
                          }
                          title={collapsed && !mobile ? item.label : undefined}
                          type="button"
                        >
                          {collapsed && !mobile ? (
                            <span className="mx-auto" aria-hidden="true">
                              {item.label.slice(0, 1)}
                            </span>
                          ) : (
                            <>
                              <span>{item.label}</span>
                              <span aria-hidden="true">{itemOpen ? '⌄' : '›'}</span>
                            </>
                          )}
                        </button>
                        {itemOpen ? (
                          <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-100 pl-2">
                            {item.children.map((child) => (
                              <NavLink
                                className={childItemClass}
                                end
                                key={child.label}
                                onClick={onClose}
                                title={collapsed && !mobile ? child.label : undefined}
                                to={child.target}
                              >
                                {collapsed && !mobile ? (
                                  <span className="mx-auto" aria-hidden="true">
                                    {child.label.slice(0, 1)}
                                  </span>
                                ) : (
                                  child.label
                                )}
                              </NavLink>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </nav>
      {!mobile && (
        <button
          className="m-3 rounded-md border border-subtle bg-surface px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-app hover:text-primary"
          onClick={onCollapse}
          type="button"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      )}
    </div>
  );
}

export function AppLayout({ children }) {
  const auth = useAuth();
  const company = useOrganizationCompany();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const permissions = useMemo(() => new Set(auth.permissions), [auth.permissions]);
  const authorizedItems = useMemo(() => {
    const authorizedTarget = (item) => {
      const target = resolveTarget(item, permissions, auth.permissionScopes);
      return (
        target &&
        hasAnyPermission(permissions, item.permissions) &&
        hasAnyPermission(permissions, permissionsForPath(target)) &&
        hasRequiredScope(auth.permissionScopes, scopeRequirementForPath(target))
      );
    };
    return navigationItems
      .map((item) => {
        const children = item.children?.filter(authorizedTarget).map((child) => ({
          ...child,
          target: resolveTarget(child, permissions, auth.permissionScopes),
        }));
        if ((!item.to || !authorizedTarget(item)) && !children?.length) return null;
        return {
          ...item,
          children,
          disabled: !item.to && !children?.length,
          target: item.to
            ? resolveTarget(item, permissions, auth.permissionScopes)
            : children?.[0]?.target,
        };
      })
      .filter(Boolean);
  }, [auth.permissionScopes, permissions]);
  const groups = useMemo(
    () =>
      navigationGroups
        .map((label) => ({
          label,
          items: authorizedItems.filter(
            (item) => item.group === label && item.placement !== 'header',
          ),
        }))
        .filter((group) => group.items.length > 0),
    [authorizedItems],
  );
  const notifications = authorizedItems.find((item) => item.placement === 'header');
  const unreadNotifications = useQuery({
    queryKey: ['notifications', 'unread-count', company.company?.id],
    queryFn: () => getUnreadNotificationCount(company.company.id),
    enabled: Boolean(notifications && company.company),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = unreadNotifications.data ?? 0;
  const auditWorkspace =
    permissions.has('audit.view') &&
    !auth.permissions.some(
      (permission) =>
        permission !== 'audit.review' &&
        /\.(create|update|approve|reject|submit|assign|process|calculate|publish|revoke|record|adjust|reverse|cancel|complete|finalize|disburse)$/.test(
          permission,
        ),
    );

  return (
    <div className="min-h-screen bg-app text-primary">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-subtle lg:block ${collapsed ? 'w-20' : 'w-64'}`}
      >
        <Sidebar
          collapsed={collapsed}
          groups={groups}
          onCollapse={() => setCollapsed((value) => !value)}
          onClose={() => undefined}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-72 border-r border-subtle shadow-xl">
            <Sidebar
              collapsed={false}
              groups={groups}
              mobile
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className={`min-h-screen transition-[padding] ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-subtle bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            aria-label="Open navigation"
            className="rounded-md border border-subtle px-3 py-2 text-lg lg:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            ☰
          </button>
          <div className="ml-auto flex items-center gap-3">
            {auditWorkspace && (
              <span className="hidden rounded-full border border-subtle px-3 py-1 text-xs font-medium text-secondary md:inline">
                Audit workspace · read only
              </span>
            )}
            {notifications && (
              <NavLink
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                className={({ isActive }) =>
                  `relative rounded-full p-2 text-xl ${isActive ? 'bg-accent text-white' : 'text-secondary hover:bg-app'}`
                }
                title="Notifications"
                to={notifications.target}
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9a6 6 0 0 0-12 0v.75a8.967 8.967 0 0 1-2.311 6.022 23.848 23.848 0 0 0 5.454 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-surface">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            )}
            <span className="hidden text-sm text-secondary sm:inline">{auth.user?.email}</span>
            <button
              className="rounded-md border border-subtle px-3 py-2 text-sm font-medium hover:bg-app"
              onClick={() => auth.logout()}
              type="button"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
