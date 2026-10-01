import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { CareerPlanDraftEditor } from './CareerPlanDraftEditor.jsx';
import {
  addCareerEvidence,
  careerAction,
  getCareerHistory,
  getCareerPlan,
  reassignCareerManager,
  updateCareerPlan,
  updateCareerProgress,
} from './api.js';
export function CareerPlanDetailPage({ view = 'all' }) {
  const { id } = useParams(),
    { permissions } = useAuth(),
    company = useOrganizationCompany(),
    client = useQueryClient(),
    [decisionReason, setDecisionReason] = useState(''),
    [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['career-plan', id, view],
    queryFn: () => getCareerPlan(id, view),
  });
  const history = useQuery({
    queryKey: ['career-history', id, view],
    queryFn: () => getCareerHistory(id, view),
  });
  const managers = useQuery({
    queryKey: ['career-reassignment-managers', company.company?.id],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company && permissions.includes('career_plan.reassign_manager')),
  });
  const mutation = useMutation({
    mutationFn: ({ action, body }) =>
      action === 'update'
        ? updateCareerPlan(id, body)
        : action === 'progress'
          ? updateCareerProgress(id, body)
          : action === 'reassign'
            ? reassignCareerManager(id, body)
            : action === 'evidence'
              ? addCareerEvidence(id, body)
              : careerAction(id, action, body),
    onSuccess: () => {
      setMessage('Career plan updated.');
      client.invalidateQueries({ queryKey: ['career-plan', id] });
      client.invalidateQueries({ queryKey: ['career-history', id] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (
    query.isPending ||
    history.isPending ||
    company.isPending ||
    (permissions.includes('career_plan.reassign_manager') && managers.isPending)
  )
    return <LoadingState />;
  if (query.error || history.error || company.error || managers.error)
    return <ErrorState error={query.error ?? history.error ?? company.error ?? managers.error} />;
  const plan = query.data,
    currentGoals = history.data.goals.filter((x) => x.history_status === 'current'),
    currentActions = history.data.actions.filter((x) => x.history_status === 'current');
  const run = (action) => {
    if (decisionReason.trim())
      mutation.mutate({
        action,
        body: {
          workflowVersion: plan.workflow_version,
          reason: decisionReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        },
      });
  };
  const actions = [
    ['submit', 'career_plan.submit', ['draft', 'returned']],
    ['withdraw', 'career_plan.withdraw', ['draft', 'returned', 'submitted']],
    ['approve', 'career_plan.approve', ['submitted']],
    ['return', 'career_plan.return', ['submitted']],
    ['complete', 'career_plan.complete', ['active']],
    ['cancel', 'career_plan.cancel', ['submitted', 'active']],
  ];
  return (
    <div className="space-y-5 rounded-lg border border-subtle bg-surface p-6">
      <h2 className="text-xl font-semibold">{plan.employee_name_snapshot}</h2>
      <StatusBadge status={plan.status} />
      {plan.career_direction && <p>{plan.career_direction}</p>}
      {plan.employee_narrative && <p>{plan.employee_narrative}</p>}
      <Link className="block text-accent" to="history">
        Complete history
      </Link>
      <div className="flex flex-wrap gap-2">
        <input
          className="rounded border border-subtle p-2"
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
          placeholder="Mandatory lifecycle reason"
          maxLength={500}
        />
        {actions
          .filter(
            ([, permission, statuses]) =>
              permissions.includes(permission) && statuses.includes(plan.status),
          )
          .map(([a]) => (
            <Button key={a} onClick={() => run(a)}>
              {a}
            </Button>
          ))}
      </div>
      {permissions.includes('career_plan.update_draft') &&
        ['draft', 'returned'].includes(plan.status) && (
          <CareerPlanDraftEditor
            key={`${plan.id}:${plan.version}`}
            plan={plan}
            goals={currentGoals}
            actions={currentActions}
            pending={mutation.isPending}
            onSave={(body) => mutation.mutate({ action: 'update', body })}
          />
        )}
      {mutation.error && <ErrorState error={mutation.error} />}
      <section>
        <h3 className="font-semibold">Goals</h3>
        {currentGoals.map((g) => (
          <div className="border-b py-2" key={g.id}>
            <p>
              {g.title} · {g.status}
            </p>
            {permissions.includes('career_plan.update_progress') &&
              ['active', 'draft', 'returned'].includes(plan.status) &&
              !['completed', 'cancelled'].includes(g.status) && (
                <Button
                  onClick={() =>
                    mutation.mutate({
                      action: 'progress',
                      body: {
                        kind: 'goal',
                        itemId: g.career_plan_goal_id,
                        status: g.status === 'planned' ? 'in_progress' : 'completed',
                        comment: 'Progress recorded in Career UI',
                        completionDate: null,
                        version: g.version_number,
                        reason: 'Career progress update',
                        idempotencyKey: crypto.randomUUID(),
                      },
                    })
                  }
                >
                  Update progress
                </Button>
              )}
          </div>
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Development actions</h3>
        {currentActions.map((a) => (
          <div className="border-b py-2" key={a.id}>
            <p>
              {a.action_type} · {a.status}
            </p>
            {permissions.includes('career_plan.update_progress') &&
              ['active', 'draft', 'returned'].includes(plan.status) &&
              !['completed', 'cancelled'].includes(a.status) && (
                <Button
                  onClick={() =>
                    mutation.mutate({
                      action: 'progress',
                      body: {
                        kind: 'action',
                        itemId: a.career_development_action_id,
                        status: a.status === 'planned' ? 'in_progress' : 'completed',
                        comment: 'Progress recorded in Career UI',
                        completionDate:
                          a.status === 'planned' ? null : new Date().toISOString().slice(0, 10),
                        version: a.version_number,
                        reason: 'Career development action progress update',
                        idempotencyKey: crypto.randomUUID(),
                      },
                    })
                  }
                >
                  Update progress
                </Button>
              )}
            {permissions.includes('career_plan.update_progress') && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  mutation.mutate({
                    action: 'evidence',
                    body: {
                      actionVersionId: a.id,
                      referenceType: 'training_completion_version',
                      trainingCompletionVersionId: Number(d.get('completion')),
                      externalReference: null,
                      reason: d.get('reason'),
                      idempotencyKey: crypto.randomUUID(),
                    },
                  });
                }}
              >
                <input
                  name="completion"
                  type="number"
                  placeholder="Training completion version ID"
                  required
                />
                <input name="reason" placeholder="Reason" required />
                <Button type="submit">Add evidence</Button>
              </form>
            )}
          </div>
        ))}
      </section>
      {permissions.includes('career_plan.reassign_manager') && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            mutation.mutate({
              action: 'reassign',
              body: {
                managerEmploymentId: Number(d.get('manager')),
                workflowVersion: plan.workflow_version,
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
                  employee.employment &&
                  Number(employee.employment.id) !== Number(plan.employment_id),
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
      {message && <p role="status">{message}</p>}
    </div>
  );
}
