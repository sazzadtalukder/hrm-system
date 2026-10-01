import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { getUsers } from '../accessManagement/api.js';
import {
  addEmployeeAssignment,
  getEmployee,
  getEmployeeHistory,
  getEmployees,
  linkEmployeeUser,
  updateEmployee,
} from './api.js';

export function EmployeeDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const employee = useQuery({ queryKey: ['employee', id], queryFn: () => getEmployee(id) });
  if (employee.isPending) return <LoadingState />;
  if (employee.error) return <ErrorState error={employee.error} />;
  const tabs = [
    ['', 'Overview', true],
    ['history', 'History', auth.permissions.includes('employee.view_history')],
    ['personal', 'Personal', auth.permissions.includes('employee_personal.view')],
    ['contact', 'Contact', auth.permissions.includes('employee_contact.view')],
  ];
  return (
    <div>
      <div className="mb-5 rounded-lg border border-subtle bg-surface p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{employee.data.displayName}</h2>
            <p className="mt-1 text-sm text-secondary">
              {employee.data.employment?.employeeCode ?? 'No active employment'}
            </p>
          </div>
          <StatusBadge status={employee.data.recordStatus} />
        </div>
      </div>
      <nav className="mb-5 flex gap-2 border-b border-subtle">
        {tabs
          .filter(([, , visible]) => visible)
          .map(([path, label]) => (
            <NavLink
              className={({ isActive }) =>
                `px-3 py-2 text-sm font-medium ${isActive ? 'border-b-2 border-accent' : 'text-secondary'}`
              }
              end={path === ''}
              key={path}
              to={path}
            >
              {label}
            </NavLink>
          ))}
      </nav>
      <Outlet context={{ employee: employee.data }} />
    </div>
  );
}

export function EmployeeOverview() {
  const { employee } = useOutletContext();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [linkReason, setLinkReason] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState(
    employee.employment?.managerEmploymentId ? String(employee.employment.managerEmploymentId) : '',
  );
  const [assignmentEffectiveStart, setAssignmentEffectiveStart] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [assignmentReason, setAssignmentReason] = useState('');
  const canLinkUser = auth.permissions.includes('employee.link_user');
  const canManageAssignment =
    auth.permissions.includes('employee.manage_assignment') && Boolean(employee.employment);
  const users = useQuery({
    queryKey: ['employee-link-users', employee.companyId],
    queryFn: () => getUsers({ companyId: employee.companyId, page: 1, pageSize: 100 }),
    enabled: canLinkUser && !employee.userId,
  });
  const managers = useQuery({
    queryKey: ['employee-assignment-managers', employee.companyId],
    queryFn: () =>
      getEmployees(employee.companyId, {
        page: 1,
        pageSize: 100,
        recordStatus: 'active',
        sort: 'display_name',
        direction: 'asc',
      }),
    enabled: canManageAssignment,
  });
  const assignmentHistory = useQuery({
    queryKey: ['employee', String(employee.id), 'history'],
    queryFn: () => getEmployeeHistory(employee.id),
    enabled: canManageAssignment && auth.permissions.includes('employee.view_history'),
  });
  const mutation = useMutation({
    mutationFn: (body) => updateEmployee(employee.id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee', String(employee.id)] }),
  });
  const linkMutation = useMutation({
    mutationFn: () =>
      linkEmployeeUser(employee.id, { userId: Number(selectedUserId), reason: linkReason }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employee', String(employee.id)] }),
        queryClient.invalidateQueries({ queryKey: ['employee-link-users', employee.companyId] }),
      ]);
    },
  });
  const assignmentMutation = useMutation({
    mutationFn: () => {
      const overlappingAssignment = assignmentHistory.data?.assignments.find(
        (assignment) =>
          Number(assignment.employment_id) === Number(employee.employment.id) &&
          assignment.history_status === 'current' &&
          String(assignment.effective_start).slice(0, 10) === assignmentEffectiveStart,
      );
      return addEmployeeAssignment(employee.id, {
        branchId: employee.employment.branchId,
        departmentId: employee.employment.departmentId,
        designationId: employee.employment.designationId,
        gradeId: employee.employment.gradeId,
        costCenterId: employee.employment.costCenterId,
        workCalendarId: employee.employment.workCalendarId,
        managerEmploymentId: selectedManagerId ? Number(selectedManagerId) : null,
        effectiveStart: assignmentEffectiveStart,
        effectiveEnd: null,
        reason: assignmentReason,
        supersedesAssignmentId: overlappingAssignment?.id ?? null,
      });
    },
    onSuccess: async () => {
      setAssignmentReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employee', String(employee.id)] }),
        queryClient.invalidateQueries({ queryKey: ['employee', String(employee.id), 'history'] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ]);
    },
  });
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutation.mutateAsync({
      version: employee.version,
      firstName: data.get('firstName'),
      middleName: data.get('middleName') || null,
      lastName: data.get('lastName'),
      preferredName: data.get('preferredName') || null,
    });
  }
  const employment = employee.employment;
  const namedReference = (name, id, code) => {
    if (!id) return 'Not assigned';
    const identity = code ? `${code} · #${id}` : `#${id}`;
    return name ? `${name} (${identity})` : identity;
  };
  return employee ? (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Active employment', employment ? `Yes · Employment #${employment.id}` : 'No'],
          [
            'Active assignment',
            employment?.assignmentId ? `Yes · Assignment #${employment.assignmentId}` : 'No',
          ],
          ['Employee code', employment?.employeeCode],
          ['Employment type', employment?.employmentType],
          ['Employment status', employment?.employmentStatus],
          ['Branch', namedReference(employment?.branchName, employment?.branchId)],
          ['Department', namedReference(employment?.departmentName, employment?.departmentId)],
          ['Designation', namedReference(employment?.designationName, employment?.designationId)],
          ['Grade', namedReference(employment?.gradeName, employment?.gradeId)],
          ['Cost center', namedReference(employment?.costCenterName, employment?.costCenterId)],
          [
            'Work calendar',
            namedReference(
              employment?.workCalendarName,
              employment?.workCalendarId,
              employment?.workCalendarCode,
            ),
          ],
          [
            'Reporting manager',
            namedReference(
              employment?.managerDisplayName,
              employment?.managerEmploymentId,
              employment?.managerEmployeeCode,
            ),
          ],
          ['Joining date', employment?.joiningDate],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-subtle bg-surface p-4" key={label}>
            <dt className="text-sm text-secondary">{label}</dt>
            <dd className="mt-1 font-medium">{value ?? '—'}</dd>
          </div>
        ))}
      </div>
      {auth.permissions.includes('employee.update') && (
        <form className="rounded-lg border border-subtle bg-surface p-5" onSubmit={submit}>
          <h3 className="mb-4 font-semibold">Employee name</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              First name
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue={employee.firstName}
                name="firstName"
                required
              />
            </label>
            <label className="text-sm font-medium">
              Middle name
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue={employee.middleName ?? ''}
                name="middleName"
              />
            </label>
            <label className="text-sm font-medium">
              Last name
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue={employee.lastName}
                name="lastName"
                required
              />
            </label>
            <label className="text-sm font-medium">
              Preferred name
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue={employee.preferredName ?? ''}
                name="preferredName"
              />
            </label>
          </div>
          {mutation.error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {mutation.error.message}
            </p>
          )}
          <Button className="mt-4" disabled={mutation.isPending} type="submit">
            Save name
          </Button>
        </form>
      )}
      {canManageAssignment ? (
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <h3 className="font-semibold">Reporting line</h3>
          <p className="mt-1 text-sm text-secondary">
            Change the reporting manager through effective-dated assignment history. Leave the
            manager empty only for the top-level employee.
          </p>
          {managers.error || assignmentHistory.error ? (
            <div className="mt-4">
              <ErrorState error={managers.error ?? assignmentHistory.error} />
            </div>
          ) : (
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                assignmentMutation.mutate();
              }}
            >
              <label className="text-sm font-medium">
                Reporting manager
                <select
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  disabled={managers.isPending || assignmentHistory.isPending}
                  onChange={(event) => setSelectedManagerId(event.target.value)}
                  value={selectedManagerId}
                >
                  <option value="">No manager (top-level employee)</option>
                  {managers.data?.items
                    ?.filter(
                      (manager) => manager.employment && Number(manager.id) !== Number(employee.id),
                    )
                    .map((manager) => (
                      <option key={manager.employment.id} value={manager.employment.id}>
                        {manager.displayName} ({manager.employment.employeeCode})
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Effective from
                <input
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  min={employee.employment.joiningDate}
                  onChange={(event) => setAssignmentEffectiveStart(event.target.value)}
                  required
                  type="date"
                  value={assignmentEffectiveStart}
                />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Reason
                <textarea
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  maxLength="500"
                  onChange={(event) => setAssignmentReason(event.target.value)}
                  required
                  rows="3"
                  value={assignmentReason}
                />
              </label>
              <div className="sm:col-span-2">
                <Button
                  disabled={
                    managers.isPending ||
                    assignmentHistory.isPending ||
                    !assignmentEffectiveStart ||
                    !assignmentReason.trim() ||
                    assignmentMutation.isPending
                  }
                  type="submit"
                >
                  {assignmentMutation.isPending ? 'Updating…' : 'Update reporting manager'}
                </Button>
              </div>
            </form>
          )}
          {assignmentMutation.isSuccess ? (
            <p className="mt-3 text-sm text-emerald-700" role="status">
              Reporting line updated and preserved in assignment history.
            </p>
          ) : null}
          {assignmentMutation.error ? (
            <div className="mt-3">
              <ErrorState error={assignmentMutation.error} />
            </div>
          ) : null}
        </section>
      ) : null}
      {canLinkUser && !employee.userId ? (
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <h3 className="font-semibold">Link User</h3>
          <p className="mt-1 text-sm text-secondary">
            Link an existing Identity user to this employee for self-service access.
          </p>
          {users.error ? <ErrorState error={users.error} /> : null}
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              linkMutation.mutate();
            }}
          >
            <label className="text-sm font-medium">
              Existing user
              <select
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                disabled={users.isPending || Boolean(users.error)}
                onChange={(event) => setSelectedUserId(event.target.value)}
                required
                value={selectedUserId}
              >
                <option value="">Select a user</option>
                {users.data?.items?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email} ({user.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Reason
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                maxLength="500"
                onChange={(event) => setLinkReason(event.target.value)}
                required
                value={linkReason}
              />
            </label>
            <div className="sm:col-span-2">
              <Button
                disabled={!selectedUserId || !linkReason || linkMutation.isPending}
                type="submit"
              >
                Link User
              </Button>
            </div>
          </form>
          {linkMutation.isSuccess ? (
            <p className="mt-3 text-sm text-emerald-700">User linked successfully.</p>
          ) : null}
          {linkMutation.error ? <ErrorState error={linkMutation.error} /> : null}
        </section>
      ) : null}
      {canLinkUser && employee.userId ? (
        <section className="rounded-lg border border-subtle bg-surface p-5">
          <h3 className="font-semibold">Linked User</h3>
          <p className="mt-1 text-sm text-secondary">
            User ID #{employee.userId} is linked to this employee.
          </p>
        </section>
      ) : null}
    </div>
  ) : null;
}
