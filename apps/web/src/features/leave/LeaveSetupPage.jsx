import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  assignLeavePolicy,
  getLeavePolicies,
  getLeavePolicyAssignments,
  getLeaveTypes,
} from './api.js';

export function LeaveSetupPage() {
  const auth = useAuth();
  const company = useOrganizationCompany();
  const queryClient = useQueryClient();
  const [employmentId, setEmploymentId] = useState('');
  const [message, setMessage] = useState('');
  const types = useQuery({
    queryKey: ['leave', 'types', company.company?.id],
    queryFn: () => getLeaveTypes(company.company.id),
    enabled: Boolean(company.company),
  });
  const policies = useQuery({
    queryKey: ['leave', 'policies', company.company?.id],
    queryFn: () => getLeavePolicies(company.company.id),
    enabled: Boolean(company.company) && auth.permissions.includes('leave_policy.view'),
  });
  const employees = useQuery({
    queryKey: ['leave', 'policy-employees', company.company?.id],
    queryFn: () =>
      getEmployees(company.company.id, {
        page: 1,
        pageSize: 100,
        recordStatus: 'active',
        sort: 'display_name',
        direction: 'asc',
      }),
    enabled: Boolean(company.company) && auth.permissions.includes('leave_policy.assign'),
  });
  const assignments = useQuery({
    queryKey: ['leave', 'policy-assignments', employmentId],
    queryFn: () => getLeavePolicyAssignments(employmentId),
    enabled:
      Boolean(employmentId) &&
      auth.permissions.includes('leave_policy.view') &&
      auth.permissions.includes('leave_policy.assign'),
  });
  const assign = useMutation({
    mutationFn: ({ id, body }) => assignLeavePolicy(id, body),
    onSuccess: async (result) => {
      setMessage(`Leave-policy assignment #${result.id} created.`);
      await queryClient.invalidateQueries({
        queryKey: ['leave', 'policy-assignments', employmentId],
      });
    },
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || types.isPending || policies.isPending || employees.isPending)
    return <LoadingState />;
  if (company.error || types.error || policies.error || employees.error)
    return <ErrorState error={company.error ?? types.error ?? policies.error ?? employees.error} />;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Leave types</h2>
        {!types.data?.length ? (
          <EmptyState message="No business leave types are configured." />
        ) : (
          <ul className="mt-4 divide-y divide-subtle">
            {types.data.map((type) => (
              <li className="py-3" key={type.id}>
                {type.name} <span className="text-secondary">({type.code})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {auth.permissions.includes('leave_policy.view') ? (
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h2 className="font-semibold">Leave policies</h2>
          {!policies.data?.length ? (
            <EmptyState message="No leave policies are configured." />
          ) : (
            <ul className="mt-4 divide-y divide-subtle">
              {policies.data.map((policy) => (
                <li className="py-3" key={policy.id}>
                  {policy.name} <span className="text-secondary">({policy.code})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {auth.permissions.includes('leave_policy.assign') ? (
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h2 className="font-semibold">Assign policy to employee</h2>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage('');
              const data = new FormData(event.currentTarget);
              assign.mutate({
                id: Number(employmentId),
                body: {
                  leavePolicyId: Number(data.get('leavePolicyId')),
                  effectiveStart: data.get('effectiveStart'),
                  effectiveEnd: null,
                  supersedesAssignmentId: null,
                  reason: data.get('reason'),
                },
              });
            }}
          >
            <label className="text-sm font-medium">
              Employee
              <select
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                onChange={(event) => setEmploymentId(event.target.value)}
                required
                value={employmentId}
              >
                <option value="">Select an employee</option>
                {employees.data?.items
                  ?.filter((employee) => employee.employment)
                  .map((employee) => (
                    <option key={employee.employment.id} value={employee.employment.id}>
                      {employee.displayName} ({employee.employment.employeeCode}) · Employment #
                      {employee.employment.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Policy
              <select
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="leavePolicyId"
                required
              >
                <option value="">Select a policy</option>
                {policies.data?.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} ({policy.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Effective from
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="effectiveStart"
                required
                type="date"
              />
            </label>
            <label className="text-sm font-medium">
              Reason
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                maxLength="500"
                name="reason"
                required
              />
            </label>
            <div className="sm:col-span-2">
              <Button disabled={!employmentId || assign.isPending} type="submit">
                Assign policy
              </Button>
            </div>
          </form>
          {message ? (
            <p className="mt-3 text-sm" role="status">
              {message}
            </p>
          ) : null}
          {assignments.error ? <ErrorState error={assignments.error} /> : null}
          {assignments.data?.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Assignment history</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {assignments.data.map((assignment) => {
                  const policy = policies.data?.find(
                    (item) => Number(item.id) === Number(assignment.leave_policy_id),
                  );
                  return (
                    <li className="rounded border border-subtle p-3" key={assignment.id}>
                      {policy?.name ?? `Policy #${assignment.leave_policy_id}`} ·{' '}
                      {String(assignment.effective_start).slice(0, 10)} to{' '}
                      {assignment.effective_end
                        ? String(assignment.effective_end).slice(0, 10)
                        : 'ongoing'}{' '}
                      · {assignment.history_status}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
