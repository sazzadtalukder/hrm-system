import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActionDialog } from '../../components/ui/ActionDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  assignRole,
  createUser,
  getAssignments,
  getDirectGrantPermissions,
  getDirectGrants,
  getPasswordSetupStatus,
  getRoles,
  getSessions,
  getUser,
  getUsers,
  grantPermission,
  issueInvitation,
  revokePermission,
  revokeRole,
  resetAuthentication,
  updateUser,
  userAction,
} from './api.js';

const today = new Date().toISOString().slice(0, 10);
const fieldClass = 'mt-1 w-full rounded-md border border-subtle bg-surface px-3 py-2';

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function ScopeFields() {
  return (
    <>
      <Field label="Scope">
        <select className={fieldClass} defaultValue="company" name="scopeType">
          {['company', 'branch', 'department', 'own', 'direct_reports', 'all'].map((value) => (
            <option key={value} value={value}>
              {value.replace('_', ' ')}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Branch ID (branch scope only)">
        <input className={fieldClass} min="1" name="branchId" type="number" />
      </Field>
      <Field label="Department ID (department scope only)">
        <input className={fieldClass} min="1" name="departmentId" type="number" />
      </Field>
      <Field label="Effective start">
        <input
          className={fieldClass}
          defaultValue={today}
          name="effectiveStart"
          required
          type="date"
        />
      </Field>
      <Field label="Effective end">
        <input className={fieldClass} name="effectiveEnd" type="date" />
      </Field>
    </>
  );
}

function scopeBody(form, companyId) {
  const scopeType = form.get('scopeType');
  return {
    scopeType,
    companyId: scopeType === 'all' ? null : companyId,
    branchId: scopeType === 'branch' ? Number(form.get('branchId')) : null,
    departmentId: scopeType === 'department' ? Number(form.get('departmentId')) : null,
    effectiveStart: form.get('effectiveStart'),
    effectiveEnd: form.get('effectiveEnd') || null,
  };
}

export function AccessManagementPage() {
  const auth = useAuth();
  const permissions = new Set(auth.permissions);
  const companyState = useOrganizationCompany();
  const companyId = companyState.company?.id;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manualSetupLink, setManualSetupLink] = useState('');
  const [pendingDialog, setPendingDialog] = useState(null);
  const users = useQuery({
    queryKey: ['access-management', 'users', companyId, search],
    queryFn: () => getUsers({ companyId, search, page: 1, pageSize: 100 }),
    enabled: Boolean(companyId),
  });
  const roles = useQuery({ queryKey: ['access-management', 'roles'], queryFn: getRoles });
  const user = useQuery({
    queryKey: ['access-management', 'user', selectedId],
    queryFn: () => getUser(selectedId),
    enabled: Boolean(selectedId),
  });
  const assignments = useQuery({
    queryKey: ['access-management', 'assignments', selectedId],
    queryFn: () => getAssignments(selectedId),
    enabled: Boolean(selectedId && permissions.has('role.view_assignment_history')),
  });
  const grants = useQuery({
    queryKey: ['access-management', 'grants', selectedId],
    queryFn: () => getDirectGrants(selectedId),
    enabled: Boolean(selectedId && permissions.has('user.assign_role')),
  });
  const eligiblePermissions = useQuery({
    queryKey: ['access-management', 'direct-permissions'],
    queryFn: getDirectGrantPermissions,
    enabled: permissions.has('user.assign_role'),
  });
  const sessions = useQuery({
    queryKey: ['access-management', 'sessions', companyId, selectedId],
    queryFn: () => getSessions(companyId, selectedId),
    enabled: Boolean(companyId && selectedId && permissions.has('security_session.view')),
  });
  const setupStatus = useQuery({
    queryKey: ['access-management', 'password-setup', companyId, selectedId],
    queryFn: () => getPasswordSetupStatus(selectedId, companyId),
    enabled: Boolean(companyId && selectedId),
  });
  const mutation = useMutation({
    mutationFn: async (operation) => operation(),
    onSuccess: async (result) => {
      setError('');
      setMessage('Saved successfully.');
      setManualSetupLink(
        result?.manualSetupToken
          ? `${window.location.origin}/set-password#token=${encodeURIComponent(result.manualSetupToken)}`
          : '',
      );
      await queryClient.invalidateQueries({ queryKey: ['access-management'] });
    },
    onError: (cause) => {
      setMessage('');
      setError(cause.message);
    },
  });
  const run = (operation) => {
    setError('');
    setMessage('');
    setManualSetupLink('');
    mutation.mutate(operation);
  };

  if (companyState.isPending || users.isPending || roles.isPending) return <LoadingState />;
  if (companyState.error || users.error || roles.error)
    return <ErrorState error={companyState.error ?? users.error ?? roles.error} />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Access management</h1>
        <p className="mt-1 text-secondary">
          Manage accounts, scoped role assignments, exceptional grants, and sessions.
        </p>
      </header>
      {(message || error) && (
        <p className={error ? 'text-danger' : 'text-green-700'} role="status">
          {error || message}
        </p>
      )}
      {manualSetupLink && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <strong>QA-only password setup link</strong>
          <p className="mt-1 break-all">{manualSetupLink}</p>
          <p className="mt-1 text-secondary">
            This link is returned only outside production. Deliver it securely and do not place it
            in logs or tickets.
          </p>
        </div>
      )}
      <section className="grid gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,2fr)]">
        <div className="rounded-lg border border-subtle bg-surface p-5">
          <form
            className="mb-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(new FormData(event.currentTarget).get('search').trim());
            }}
          >
            <input
              aria-label="Search users"
              className={`${fieldClass} mt-0`}
              name="search"
              placeholder="Search email"
            />
            <Button type="submit">Search</Button>
          </form>
          {permissions.has('user.create') && (
            <form
              className="mb-5 space-y-2 border-b border-subtle pb-5"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                run(() => createUser({ email: form.get('email'), companyId }));
              }}
            >
              <Field label="New user email">
                <input className={fieldClass} name="email" required type="email" />
              </Field>
              <Button disabled={mutation.isPending} type="submit">
                Create inactive user
              </Button>
            </form>
          )}
          <h2 className="mb-2 font-semibold">Users</h2>
          {users.data.items.length ? (
            users.data.items.map((item) => (
              <button
                className={`block w-full border-b border-subtle px-2 py-3 text-left ${selectedId === item.id ? 'bg-app' : ''}`}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <span className="block font-medium">{item.email}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-secondary">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      item.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.provisioning_status === 'pending_setup' &&
                    !item.administratively_deactivated_at
                      ? 'Awaiting setup'
                      : item.status === 'active'
                        ? 'Active'
                        : item.status === 'locked'
                          ? 'Locked'
                          : 'Inactive'}
                  </span>
                  <span>{item.role_codes.join(', ') || 'No role'}</span>
                </span>
              </button>
            ))
          ) : (
            <EmptyState message="No users found." />
          )}
        </div>
        <div className="space-y-6">
          {!selectedId ? (
            <EmptyState message="Select a user to manage access." />
          ) : user.isPending ? (
            <LoadingState />
          ) : user.error ? (
            <ErrorState error={user.error} />
          ) : (
            <>
              <section className="rounded-lg border border-subtle bg-surface p-5">
                <h2 className="text-lg font-semibold">{user.data.email}</h2>
                <p className="text-sm text-secondary">Account status: {user.data.status}</p>
                {setupStatus.data && (
                  <p className="mt-1 text-sm text-secondary">
                    Password setup: {setupStatus.data.provisioningStatus.replace('_', ' ')}
                    {setupStatus.data.token
                      ? ` · ${setupStatus.data.token.status} ${setupStatus.data.token.purpose.replace('_', ' ')}`
                      : ''}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {permissions.has('user.update') && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setPendingDialog({
                          title: 'Update user email',
                          confirmLabel: 'Update email',
                          fields: [
                            {
                              name: 'email',
                              label: 'New email',
                              type: 'email',
                              defaultValue: user.data.email,
                              maxLength: 320,
                            },
                            { name: 'reason', label: 'Reason', type: 'textarea', maxLength: 500 },
                          ],
                          submit: ({ email, reason }) =>
                            run(() => updateUser(selectedId, { email, reason })),
                        })
                      }
                      type="button"
                    >
                      Update email
                    </Button>
                  )}
                  {permissions.has(
                    user.data.status === 'active' ? 'user.deactivate' : 'user.activate',
                  ) &&
                    (user.data.status === 'active' ||
                      setupStatus.data?.administrativelyDeactivated) && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const action = user.data.status === 'active' ? 'deactivate' : 'activate';
                          setPendingDialog({
                            title: `${action === 'activate' ? 'Activate' : 'Deactivate'} user`,
                            confirmLabel: action,
                            submit: ({ reason }) =>
                              run(() => userAction(selectedId, action, reason)),
                          });
                        }}
                        type="button"
                      >
                        {user.data.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  {permissions.has('user.reset_authentication') &&
                    (setupStatus.data?.provisioningStatus === 'pending_setup' &&
                    !setupStatus.data?.administrativelyDeactivated ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setPendingDialog({
                            title: setupStatus.data?.token
                              ? 'Replace password invitation'
                              : 'Issue password invitation',
                            confirmLabel: setupStatus.data?.token ? 'Replace invitation' : 'Issue',
                            submit: ({ reason }) =>
                              run(() => issueInvitation(selectedId, { companyId, reason })),
                          })
                        }
                        type="button"
                      >
                        {setupStatus.data?.token ? 'Resend invitation' : 'Issue invitation'}
                      </Button>
                    ) : user.data.status === 'active' ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setPendingDialog({
                            title: 'Reset authentication',
                            description:
                              'The user will be unable to sign in until password setup is completed.',
                            confirmLabel: 'Reset authentication',
                            submit: ({ reason }) =>
                              run(() => resetAuthentication(selectedId, { companyId, reason })),
                          })
                        }
                        type="button"
                      >
                        Reset authentication
                      </Button>
                    ) : null)}
                  {permissions.has('user.revoke_session') && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setPendingDialog({
                          title: 'Revoke all sessions',
                          confirmLabel: 'Revoke sessions',
                          submit: ({ reason }) =>
                            run(() => userAction(selectedId, 'revoke-sessions', reason)),
                        })
                      }
                      type="button"
                    >
                      Revoke all sessions
                    </Button>
                  )}
                </div>
              </section>
              <section className="rounded-lg border border-subtle bg-surface p-5">
                <h2 className="text-lg font-semibold">Role assignments</h2>
                {permissions.has('role.assign') && (
                  <form
                    className="mt-4 grid gap-3 md:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      run(() =>
                        assignRole({
                          userId: selectedId,
                          roleCode: form.get('roleCode'),
                          ...scopeBody(form, companyId),
                        }),
                      );
                    }}
                  >
                    <Field label="Role">
                      <select className={fieldClass} defaultValue="" name="roleCode" required>
                        <option disabled value="">
                          Select a role
                        </option>
                        {roles.data.map((role) => (
                          <option key={role.code} value={role.code}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <ScopeFields />
                    <div>
                      <Button type="submit">Assign role</Button>
                    </div>
                  </form>
                )}
                <div className="mt-5 space-y-2">
                  {(assignments.data ?? []).map((item) => (
                    <div className="rounded border border-subtle p-3" key={item.id}>
                      <strong>{item.role_name}</strong>
                      <p className="text-sm text-secondary">
                        {item.scope_type} · {item.effective_start} to {item.effective_end ?? 'open'}{' '}
                        · {item.status}
                      </p>
                      {item.status === 'active' && permissions.has('role.revoke') && (
                        <Button
                          className="mt-2"
                          variant="secondary"
                          onClick={() =>
                            setPendingDialog({
                              title: `Revoke ${item.role_name}`,
                              confirmLabel: 'Revoke role',
                              submit: ({ reason }) => run(() => revokeRole(item.id, reason)),
                            })
                          }
                          type="button"
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              {permissions.has('user.assign_role') && (
                <section className="rounded-lg border border-subtle bg-surface p-5">
                  <h2 className="text-lg font-semibold">Exceptional direct permissions</h2>
                  <p className="text-sm text-secondary">
                    Only catalog permissions explicitly approved for direct grants are selectable.
                  </p>
                  <form
                    className="mt-4 grid gap-3 md:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      run(() =>
                        grantPermission({
                          userId: selectedId,
                          permissionCode: form.get('permissionCode'),
                          reason: form.get('reason'),
                          ...scopeBody(form, companyId),
                        }),
                      );
                    }}
                  >
                    <Field label="Permission">
                      <select className={fieldClass} name="permissionCode" required>
                        {(eligiblePermissions.data ?? []).map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.code}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Reason">
                      <input className={fieldClass} maxLength="500" name="reason" required />
                    </Field>
                    <ScopeFields />
                    <div>
                      <Button type="submit">Grant permission</Button>
                    </div>
                  </form>
                  <div className="mt-5 space-y-2">
                    {(grants.data ?? []).map((item) => (
                      <div className="rounded border border-subtle p-3" key={item.id}>
                        <strong>{item.permission_code}</strong>
                        <p className="text-sm text-secondary">
                          {item.scope_type} · {item.status} · {item.reason}
                        </p>
                        {item.status === 'active' && (
                          <Button
                            className="mt-2"
                            variant="secondary"
                            onClick={() =>
                              setPendingDialog({
                                title: `Revoke ${item.permission_code}`,
                                confirmLabel: 'Revoke permission',
                                submit: ({ reason }) =>
                                  run(() => revokePermission(item.id, reason)),
                              })
                            }
                            type="button"
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {permissions.has('security_session.view') && (
                <section className="rounded-lg border border-subtle bg-surface p-5">
                  <h2 className="text-lg font-semibold">Sessions</h2>
                  {(sessions.data ?? []).length ? (
                    sessions.data.map((item) => (
                      <div className="border-b border-subtle py-3" key={item.id}>
                        <strong>Session {item.id}</strong>
                        <p className="text-sm text-secondary">
                          Created {item.created_at} · expires {item.expires_at} ·{' '}
                          {item.revoked_at ? 'revoked' : 'active'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <EmptyState message="No sessions found." />
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="text-lg font-semibold">Managed role catalog</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {roles.data.map((role) => (
            <details className="rounded border border-subtle p-3" key={role.id}>
              <summary className="cursor-pointer font-medium">
                {role.name} <span className="text-xs text-secondary">({role.code})</span>
              </summary>
              <p className="mt-2 text-sm text-secondary">
                {role.description || 'Managed system role'}
              </p>
              <ul className="mt-2 max-h-48 overflow-auto text-xs text-secondary">
                {role.permission_codes.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
      {pendingDialog ? (
        <ActionDialog
          busy={mutation.isPending}
          confirmLabel={pendingDialog.confirmLabel}
          description={pendingDialog.description}
          fields={pendingDialog.fields}
          onCancel={() => setPendingDialog(null)}
          onConfirm={(values) => {
            pendingDialog.submit(values);
            setPendingDialog(null);
          }}
          title={pendingDialog.title}
        />
      ) : null}
    </div>
  );
}
