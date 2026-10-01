import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createCycle, cycleAction, getCycles, getPerformanceConfig } from './api.js';

const field = 'mt-1 w-full rounded-md border border-subtle bg-surface p-2';
const transitions = {
  draft: [
    ['activate', 'Activate', 'performance_cycle.activate'],
    ['cancel', 'Cancel', 'performance_cycle.cancel'],
  ],
  active: [
    ['open-review', 'Open review', 'performance_cycle.open_review'],
    ['cancel', 'Cancel', 'performance_cycle.cancel'],
  ],
  review_open: [
    ['close', 'Close', 'performance_cycle.close'],
    ['cancel', 'Cancel', 'performance_cycle.cancel'],
  ],
};

export function PerformanceCyclesPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const cycles = useQuery({
    queryKey: ['performance-cycles', company.company?.id],
    queryFn: () => getCycles(company.company.id),
    enabled: Boolean(company.company),
  });
  const templates = useQuery({
    queryKey: ['performance-templates', company.company?.id],
    queryFn: () => getPerformanceConfig('templates', company.company.id),
    enabled: Boolean(company.company),
  });
  const employees = useQuery({
    queryKey: ['performance-population-employees', company.company?.id],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company && permissions.includes('performance_cycle.populate')),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['performance-cycles'] });
  const createMutation = useMutation({
    mutationFn: createCycle,
    onSuccess: () => {
      setMessage('Cycle created.');
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const actionMutation = useMutation({
    mutationFn: ({ cycleId, action, body }) => cycleAction(cycleId, action, body),
    onSuccess: (result) => {
      setMessage(`Cycle is now ${result.status.replaceAll('_', ' ')}.`);
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const populationMutation = useMutation({
    mutationFn: ({ cycleId, body }) => cycleAction(cycleId, 'population', body),
    onSuccess: (result) => {
      setMessage(`${result.reviewIds.length} review(s) created.`);
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  if (
    company.isPending ||
    cycles.isPending ||
    templates.isPending ||
    (permissions.includes('performance_cycle.populate') && employees.isPending)
  )
    return <LoadingState />;
  if (
    company.error ||
    cycles.error ||
    templates.error ||
    (permissions.includes('performance_cycle.populate') && employees.error)
  )
    return (
      <ErrorState error={company.error ?? cycles.error ?? templates.error ?? employees.error} />
    );
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Review cycles</h2>
        {!cycles.data.length ? (
          <EmptyState message="No review cycles configured." />
        ) : (
          <div className="mt-3 space-y-3">
            {cycles.data.map((cycle) => (
              <article className="rounded-md border border-subtle p-4" key={cycle.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {cycle.name} ({cycle.code})
                    </p>
                    <p className="text-sm text-secondary">
                      {String(cycle.review_period_start).slice(0, 10)}–
                      {String(cycle.review_period_end).slice(0, 10)}
                    </p>
                  </div>
                  <StatusBadge status={cycle.status} />
                </div>
                {transitions[cycle.status]?.some(([, , permission]) =>
                  permissions.includes(permission),
                ) && (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const action = data.get('action');
                      if (globalThis.confirm(`Confirm ${action.replaceAll('-', ' ')}?`))
                        actionMutation.mutate({
                          cycleId: cycle.id,
                          action,
                          body: {
                            workflowVersion: cycle.workflow_version,
                            reason: data.get('reason'),
                            idempotencyKey: crypto.randomUUID(),
                          },
                        });
                    }}
                  >
                    <select className={field} name="action" required>
                      <option value="">Select action</option>
                      {transitions[cycle.status]
                        .filter(([, , permission]) => permissions.includes(permission))
                        .map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                    </select>
                    <input
                      className={field}
                      maxLength={500}
                      name="reason"
                      placeholder="Required reason"
                      required
                    />
                    <Button disabled={actionMutation.isPending} type="submit">
                      Apply
                    </Button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {permissions.includes('performance_cycle.create') && (
        <form
          className="grid gap-3 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            createMutation.mutate({
              companyId: company.company.id,
              code: data.get('code'),
              name: data.get('name'),
              reviewPeriodStart: data.get('start'),
              reviewPeriodEnd: data.get('end'),
              goalSubmissionDueDate: data.get('goalDue'),
              selfReviewDueDate: data.get('selfDue'),
              managerReviewDueDate: data.get('managerDue'),
              acknowledgmentDueDate: data.get('ackDue'),
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="sm:col-span-2 font-semibold">Create cycle</h2>
          <label>
            Code
            <input className={field} name="code" required />
          </label>
          <label>
            Name
            <input className={field} name="name" required />
          </label>
          <label>
            Review start
            <input className={field} name="start" type="date" required />
          </label>
          <label>
            Review end
            <input className={field} name="end" type="date" required />
          </label>
          <label>
            Goal submission due
            <input className={field} name="goalDue" type="date" required />
          </label>
          <label>
            Self-review due
            <input className={field} name="selfDue" type="date" required />
          </label>
          <label>
            Manager-review due
            <input className={field} name="managerDue" type="date" required />
          </label>
          <label>
            Acknowledgment due
            <input className={field} name="ackDue" type="date" required />
          </label>
          <label className="sm:col-span-2">
            Reason
            <input className={field} name="reason" required />
          </label>
          <Button disabled={createMutation.isPending} type="submit">
            Create cycle
          </Button>
        </form>
      )}

      {permissions.includes('performance_cycle.populate') &&
        cycles.data.some((cycle) => ['draft', 'active'].includes(cycle.status)) && (
          <form
            className="grid gap-3 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              populationMutation.mutate({
                cycleId: Number(data.get('cycleId')),
                body: {
                  employmentIds: data.getAll('employmentIds').map(Number),
                  templateVersionId: Number(data.get('templateVersionId')),
                  allowOverlapOverride: data.get('override') === 'on',
                  reason: data.get('reason'),
                },
              });
            }}
          >
            <h2 className="sm:col-span-2 font-semibold">Create review population</h2>
            <label>
              Cycle
              <select className={field} name="cycleId" required>
                {cycles.data
                  .filter((cycle) => ['draft', 'active'].includes(cycle.status))
                  .map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name} · {cycle.status}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Template
              <select className={field} name="templateVersionId" required>
                <option value="">Select template</option>
                {templates.data.map((template) => (
                  <option key={template.version_id} value={template.version_id}>
                    {template.name} ({template.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Employees
              <span className="block text-xs text-secondary">
                Select one or more eligible probation/confirmed employments.
              </span>
              <select className={`${field} min-h-36`} multiple name="employmentIds" required>
                {employees.data.items
                  .filter((employee) => employee.employment)
                  .map((employee) => (
                    <option key={employee.employment.id} value={employee.employment.id}>
                      {employee.displayName} · {employee.employment.employeeCode} · Employment #
                      {employee.employment.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="sm:col-span-2 flex items-center gap-2">
              <input name="override" type="checkbox" /> Authorized overlapping-review override
            </label>
            <label className="sm:col-span-2">
              Reason
              <input className={field} name="reason" required />
            </label>
            <Button disabled={populationMutation.isPending || !templates.data.length} type="submit">
              Create reviews
            </Button>
          </form>
        )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
