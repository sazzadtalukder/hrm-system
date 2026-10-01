import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  createNomination,
  getSuccessionPlan,
  getSuccessionPlanHistory,
  successionPlanAction,
} from './api.js';
export function SuccessionPlanDetailPage() {
  const { id } = useParams(),
    { permissions } = useAuth(),
    company = useOrganizationCompany(),
    client = useQueryClient(),
    [lifecycleReason, setLifecycleReason] = useState(''),
    q = useQuery({ queryKey: ['succession-plan', id], queryFn: () => getSuccessionPlan(id) }),
    h = useQuery({
      queryKey: ['succession-plan-history', id],
      queryFn: () => getSuccessionPlanHistory(id),
    }),
    employees = useQuery({
      queryKey: ['succession-nomination-employees', company.company?.id],
      queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
      enabled: Boolean(company.company && permissions.includes('succession_nomination.create')),
    }),
    m = useMutation({
      mutationFn: ({ action, body }) =>
        action === 'nominate' ? createNomination(id, body) : successionPlanAction(id, action, body),
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['succession-plan', id] });
        client.invalidateQueries({ queryKey: ['succession-plan-history', id] });
        client.invalidateQueries({ queryKey: ['successor-nominations'] });
      },
    });
  if (
    q.isPending ||
    h.isPending ||
    company.isPending ||
    (permissions.includes('succession_nomination.create') && employees.isPending)
  )
    return <LoadingState />;
  if (q.error || h.error || company.error || employees.error)
    return <ErrorState error={q.error ?? h.error ?? company.error ?? employees.error} />;
  const p = q.data,
    run = (a) => {
      if (lifecycleReason.trim())
        m.mutate({
          action: a,
          body: {
            workflowVersion: p.workflow_version,
            reason: lifecycleReason.trim(),
            idempotencyKey: crypto.randomUUID(),
          },
        });
    };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{p.critical_position_name_snapshot}</h2>
      <p>Status: {p.status}</p>
      <div className="flex gap-2">
        <input
          value={lifecycleReason}
          onChange={(event) => setLifecycleReason(event.target.value)}
          placeholder="Mandatory lifecycle reason"
          maxLength={500}
        />
        {[
          ['activate', 'succession_plan.activate', ['draft']],
          ['close', 'succession_plan.close', ['active']],
          ['cancel', 'succession_plan.cancel', ['draft', 'active']],
        ]
          .filter(
            ([, permission, statuses]) =>
              permissions.includes(permission) && statuses.includes(p.status),
          )
          .map(([a]) => (
            <Button key={a} onClick={() => run(a)}>
              {a}
            </Button>
          ))}
      </div>
      {permissions.includes('succession_nomination.create') && p.status === 'active' && (
        <form
          className="grid max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            m.mutate({
              action: 'nominate',
              body: {
                companyId: p.company_id,
                employmentId: Number(d.get('employmentId')),
                managerReadinessRecommendation: d.get('readiness'),
                readinessTargetDate: d.get('target') || null,
                strengths: d.get('strengths'),
                developmentNeeds: d.get('needs'),
                nominationRationale: d.get('rationale'),
                competencyGapNarrative: null,
                reason: d.get('reason'),
                idempotencyKey: crypto.randomUUID(),
              },
            });
          }}
        >
          <h3 className="font-semibold">Nominate successor</h3>
          <select name="employmentId" required>
            <option value="">Select successor</option>
            {employees.data.items
              .filter((employee) => employee.employment)
              .map((employee) => (
                <option key={employee.employment.id} value={employee.employment.id}>
                  {employee.displayName} · {employee.employment.employeeCode} · Employment #
                  {employee.employment.id}
                </option>
              ))}
          </select>
          <select name="readiness">
            <option value="ready_now">Ready now</option>
            <option value="ready_within_1_year">Ready within 1 year</option>
            <option value="ready_within_2_years">Ready within 2 years</option>
            <option value="development_required">Development required</option>
          </select>
          <input name="target" type="date" />
          <textarea name="strengths" placeholder="Strengths" required />
          <textarea name="needs" placeholder="Development needs" required />
          <textarea name="rationale" placeholder="Rationale" required />
          <input name="reason" placeholder="Reason" required />
          <Button type="submit">Create nomination</Button>
        </form>
      )}
      <h3 className="font-semibold">History</h3>
      {h.data.states.map((s) => (
        <p key={s.id}>
          {s.from_state ?? 'created'} → {s.to_state}
        </p>
      ))}
      {m.error && <ErrorState error={m.error} />}
    </div>
  );
}
