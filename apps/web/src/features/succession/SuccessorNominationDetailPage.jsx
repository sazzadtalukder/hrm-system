import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  getNomination,
  nominationAction,
  reassignNominationManager,
  updateReadiness,
} from './api.js';
export function SuccessorNominationDetailPage({ team = false }) {
  const { id } = useParams(),
    { permissions } = useAuth(),
    company = useOrganizationCompany(),
    client = useQueryClient(),
    [decisionReason, setDecisionReason] = useState(''),
    q = useQuery({
      queryKey: ['successor-nomination', id, team],
      queryFn: () => getNomination(id, team),
    }),
    managers = useQuery({
      queryKey: ['succession-reassignment-managers', company.company?.id],
      queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
      enabled: Boolean(
        company.company && permissions.includes('succession_nomination.reassign_manager'),
      ),
    }),
    m = useMutation({
      mutationFn: ({ action, body }) =>
        action === 'readiness'
          ? updateReadiness(id, body)
          : action === 'reassign'
            ? reassignNominationManager(id, body)
            : nominationAction(id, action, body),
      onSuccess: () => client.invalidateQueries({ queryKey: ['successor-nomination', id] }),
    });
  if (
    q.isPending ||
    company.isPending ||
    (permissions.includes('succession_nomination.reassign_manager') && managers.isPending)
  )
    return <LoadingState />;
  if (q.error || company.error || managers.error)
    return <ErrorState error={q.error ?? company.error ?? managers.error} />;
  const n = q.data,
    run = (action) => {
      if (decisionReason.trim())
        m.mutate({
          action,
          body: {
            workflowVersion: n.workflow_version,
            reason: decisionReason.trim(),
            idempotencyKey: crypto.randomUUID(),
          },
        });
    };
  const actions = [
    ['submit', 'succession_nomination.submit', ['draft']],
    ['recommend', 'succession_nomination.recommend', ['submitted']],
    ['reject', 'succession_nomination.reject', ['submitted', 'manager_recommended']],
    ['confirm', 'succession_nomination.confirm', ['manager_recommended']],
    [
      'remove',
      'succession_nomination.remove',
      ['submitted', 'manager_recommended', 'hr_confirmed'],
    ],
    ['withdraw', 'succession_nomination.withdraw', ['draft', 'submitted']],
  ];
  return (
    <div className="space-y-4 rounded-lg border border-subtle bg-surface p-6">
      <h2 className="text-xl font-semibold">{n.employee_name_snapshot}</h2>
      <StatusBadge status={n.status} />
      {n.confirmed_readiness && <p>Confirmed readiness: {n.confirmed_readiness}</p>}
      <Link className="block text-accent" to="history">
        History
      </Link>
      <div className="flex flex-wrap gap-2">
        <input
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
          placeholder="Mandatory decision reason"
          maxLength={500}
        />
        {actions
          .filter(
            ([, permission, statuses]) =>
              permissions.includes(permission) && statuses.includes(n.status),
          )
          .map(([a]) => (
            <Button key={a} onClick={() => run(a)}>
              {a}
            </Button>
          ))}
      </div>
      {permissions.includes('succession_nomination.update_readiness') && (
        <form
          className="grid max-w-lg gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            m.mutate({
              action: 'readiness',
              body: {
                workflowVersion: n.workflow_version,
                version: n.version,
                readiness: d.get('readiness'),
                reason: d.get('reason'),
                idempotencyKey: crypto.randomUUID(),
              },
            });
          }}
        >
          <select name="readiness">
            <option value="ready_now">Ready now</option>
            <option value="ready_within_1_year">Ready within 1 year</option>
            <option value="ready_within_2_years">Ready within 2 years</option>
            <option value="development_required">Development required</option>
          </select>
          <input name="reason" placeholder="Mandatory revision reason" required />
          <Button type="submit">Record readiness</Button>
        </form>
      )}
      {permissions.includes('succession_nomination.reassign_manager') && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            m.mutate({
              action: 'reassign',
              body: {
                managerEmploymentId: Number(d.get('manager')),
                workflowVersion: n.workflow_version,
                reason: d.get('reason'),
                idempotencyKey: crypto.randomUUID(),
              },
            });
          }}
        >
          <select name="manager" required>
            <option value="">Select replacement manager</option>
            {managers.data.items
              .filter(
                (employee) =>
                  employee.employment && Number(employee.employment.id) !== Number(n.employment_id),
              )
              .map((employee) => (
                <option key={employee.employment.id} value={employee.employment.id}>
                  {employee.displayName} · {employee.employment.employeeCode} · Employment #
                  {employee.employment.id}
                </option>
              ))}
          </select>
          <input name="reason" placeholder="Reason" required />
          <Button type="submit">Reassign manager</Button>
        </form>
      )}
    </div>
  );
}
