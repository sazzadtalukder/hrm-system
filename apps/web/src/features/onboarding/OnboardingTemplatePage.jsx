import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmActionDialog } from '../../components/ui/ConfirmActionDialog.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { apiRequest } from '../../lib/api/client.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';

export function OnboardingTemplatePage() {
  const { id } = useParams();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [task, setTask] = useState({
    taskCode: '',
    title: '',
    taskType: 'task',
    sequenceNumber: '1',
    isMandatory: true,
  });
  const query = useQuery({
    queryKey: ['onboarding-template', id],
    queryFn: async () => (await apiRequest(`/onboarding/templates/${id}`)).data,
  });
  const transition = useMutation({
    mutationFn: (action) =>
      apiRequest(`/onboarding/templates/${id}/${action}`, {
        method: 'POST',
        body: {
          workflowVersion: query.data.workflow_version,
          reason,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-template', id] }),
  });
  const addTask = useMutation({
    mutationFn: () =>
      apiRequest(`/onboarding/templates/${id}/tasks`, {
        method: 'POST',
        body: {
          companyId: company.company.id,
          ...task,
          sequenceNumber: Number(task.sequenceNumber),
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-template', id] }),
  });
  if (query.isPending || company.isPending) return <LoadingState />;
  if (query.error || company.error) return <ErrorState error={query.error ?? company.error} />;
  const row = query.data;
  return (
    <section className="max-w-3xl">
      <Link className="text-sm text-blue-700" to="..">
        Back to templates
      </Link>
      <h2 className="mt-3 text-xl font-semibold">{row.name}</h2>
      <p className="mt-1">
        <span className="rounded bg-slate-100 px-2 py-1 text-sm">{row.status}</span>
      </p>
      <label className="mt-4 block text-sm">
        Action reason
        <textarea
          className="mt-1 w-full rounded border p-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="mt-3 flex gap-2">
        {row.status === 'draft' ? (
          <ConfirmActionDialog
            label="Activate"
            disabled={!reason || transition.isPending}
            onConfirm={() => transition.mutate('active')}
          />
        ) : null}
        {['draft', 'active'].includes(row.status) ? (
          <ConfirmActionDialog
            label="Inactivate"
            disabled={!reason || transition.isPending}
            onConfirm={() => transition.mutate('inactive')}
          />
        ) : null}
      </div>
      {row.status === 'draft' ? (
        <form
          className="mt-5 grid gap-3 rounded border bg-white p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            addTask.mutate();
          }}
        >
          <h3 className="sm:col-span-2 font-semibold">Add template task</h3>
          <label className="text-sm">
            Task code
            <input
              required
              className="mt-1 w-full rounded border p-2"
              value={task.taskCode}
              onChange={(event) => setTask({ ...task, taskCode: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Title
            <input
              required
              className="mt-1 w-full rounded border p-2"
              value={task.title}
              onChange={(event) => setTask({ ...task, title: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Type
            <select
              className="mt-1 w-full rounded border p-2"
              value={task.taskType}
              onChange={(event) => setTask({ ...task, taskType: event.target.value })}
            >
              {[
                'task',
                'document',
                'equipment',
                'access',
                'orientation',
                'probation_milestone',
                'attendance_readiness',
                'payroll_readiness',
              ].map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Sequence
            <input
              required
              min="1"
              type="number"
              className="mt-1 w-full rounded border p-2"
              value={task.sequenceNumber}
              onChange={(event) => setTask({ ...task, sequenceNumber: event.target.value })}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={task.isMandatory}
              onChange={(event) => setTask({ ...task, isMandatory: event.target.checked })}
            />
            Mandatory
          </label>
          <div className="sm:col-span-2">
            <Button disabled={addTask.isPending}>Add task</Button>
          </div>
        </form>
      ) : null}
      {transition.error || addTask.error ? (
        <ErrorState error={transition.error ?? addTask.error} />
      ) : null}
    </section>
  );
}
