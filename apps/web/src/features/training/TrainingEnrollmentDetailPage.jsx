import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ActionDialog } from '../../components/ui/ActionDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getTrainingEnrollment, recordTrainingOutcome, trainingAction } from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function TrainingEnrollmentDetailPage({ view = 'all' }) {
  const { id } = useParams(),
    { permissions } = useAuth(),
    client = useQueryClient(),
    [message, setMessage] = useState(''),
    [pendingAction, setPendingAction] = useState(null);
  const q = useQuery({
    queryKey: ['training-enrollment', id, view],
    queryFn: () => getTrainingEnrollment(id, view),
  });
  const mutate = useMutation({
    mutationFn: ({ action, body }) => trainingAction(id, action, body),
    onSuccess: () => {
      setMessage('Action completed.');
      client.invalidateQueries({ queryKey: ['training-enrollment', id] });
    },
    onError: (e) => setMessage(e.message),
  });
  const outcome = useMutation({
    mutationFn: ({ kind, body }) => recordTrainingOutcome(id, kind, body),
    onSuccess: () => {
      setMessage('Training result recorded.');
      client.invalidateQueries({ queryKey: ['training-enrollment', id] });
      client.invalidateQueries({ queryKey: ['training-history', id] });
    },
    onError: (e) => setMessage(e.message),
  });
  if (q.isPending) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const enrollment = q.data;
  const action = (path) => setPendingAction(path);
  const actions = [
    ['submit', 'training_enrollment.submit', ['draft']],
    ['withdraw', 'training_enrollment.withdraw', ['draft', 'submitted']],
    [
      'accept-nomination',
      'training_enrollment.accept_nomination',
      enrollment.source === 'manager_nomination' ? ['submitted'] : [],
    ],
    [
      'decline-nomination',
      'training_enrollment.decline_nomination',
      enrollment.source === 'manager_nomination' ? ['submitted'] : [],
    ],
    ['approve', 'training_enrollment.approve', ['submitted']],
    ['reject', 'training_enrollment.reject', ['submitted', 'employee_accepted']],
    ['request-cancellation', 'training_enrollment.request_cancellation', ['enrolled']],
    [
      'approve-cancellation',
      'training_enrollment.approve_cancellation',
      ['cancellation_requested'],
    ],
    ['reject-cancellation', 'training_enrollment.reject_cancellation', ['cancellation_requested']],
  ];
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {enrollment.employee_name_snapshot ?? enrollment.employee_code_snapshot}
            </h2>
            <p>
              {enrollment.title_snapshot} · {enrollment.source}
            </p>
          </div>
          <StatusBadge status={enrollment.status} />
        </div>
        {enrollment.request_narrative && <p className="mt-3">{enrollment.request_narrative}</p>}
        <Link className="mt-3 inline-block text-accent" to={`../${enrollment.id}/history`}>
          History
        </Link>
        <div className="mt-4 flex flex-wrap gap-2">
          {actions
            .filter(
              ([, permission, statuses]) =>
                permissions.includes(permission) && statuses.includes(enrollment.status),
            )
            .map(([path]) => (
              <Button key={path} onClick={() => action(path)} type="button">
                {path.replaceAll('-', ' ')}
              </Button>
            ))}
        </div>
      </section>
      {permissions.includes('training_participation.record') &&
        ['enrolled', 'cancellation_requested'].includes(enrollment.status) && (
          <form
            className="grid gap-2 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              outcome.mutate({
                kind: 'participation',
                body: {
                  participationStatus: data.get('status'),
                  comment: data.get('comment') || null,
                  reason: data.get('reason'),
                  idempotencyKey: crypto.randomUUID(),
                },
              });
            }}
          >
            <h3 className="font-semibold sm:col-span-3">Participation</h3>
            <select className={field} name="status">
              <option value="attended">Attended</option>
              <option value="partially_attended">Partially attended</option>
              <option value="no_show">No show</option>
              <option value="excused">Excused</option>
            </select>
            <input className={field} name="comment" placeholder="Comment" />
            <input className={field} name="reason" placeholder="Reason" required />
            <Button type="submit">Record participation</Button>
          </form>
        )}
      {permissions.includes('training_completion.record') &&
        ['enrolled', 'cancellation_requested'].includes(enrollment.status) && (
          <form
            className="grid gap-2 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              outcome.mutate({
                kind: 'completion',
                body: {
                  outcome: data.get('outcome'),
                  score: data.get('score') || null,
                  completionDate: data.get('date'),
                  comment: data.get('comment') || null,
                  reason: data.get('reason'),
                  idempotencyKey: crypto.randomUUID(),
                },
              });
            }}
          >
            <h3 className="font-semibold sm:col-span-3">Completion</h3>
            <select className={field} name="outcome">
              <option value="completed">Completed</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="not_completed">Not completed</option>
            </select>
            <input className={field} name="score" placeholder="Score (when configured)" />
            <input className={field} name="date" type="date" required />
            <input className={field} name="comment" placeholder="Comment" />
            <input className={field} name="reason" placeholder="Reason" required />
            <Button type="submit">Record completion</Button>
          </form>
        )}
      {permissions.includes('training_evidence.create_reference') && (
        <form
          className="grid gap-2 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            outcome.mutate({
              kind: 'evidence-references',
              body: {
                referenceType: data.get('referenceType'),
                referenceValue: data.get('referenceValue'),
                reason: data.get('reason'),
                idempotencyKey: crypto.randomUUID(),
              },
            });
          }}
        >
          <h3 className="font-semibold sm:col-span-3">Completion evidence</h3>
          <p className="text-sm text-secondary sm:col-span-3">
            Completion must be recorded before its certificate or external reference can be added.
          </p>
          <select className={field} name="referenceType">
            <option value="certificate_number">Certificate number</option>
            <option value="external_reference">External reference</option>
            <option value="external_url">External HTTPS URL</option>
          </select>
          <input className={field} name="referenceValue" placeholder="Reference value" required />
          <input className={field} name="reason" placeholder="Reason" required />
          <Button type="submit">Add evidence</Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {pendingAction ? (
        <ActionDialog
          busy={mutate.isPending}
          confirmLabel={pendingAction.replaceAll('-', ' ')}
          onCancel={() => setPendingAction(null)}
          onConfirm={({ reason }) => {
            mutate.mutate({
              action: pendingAction,
              body: {
                workflowVersion: enrollment.workflow_version,
                reason,
                idempotencyKey: crypto.randomUUID(),
              },
            });
            setPendingAction(null);
          }}
          title={`Confirm ${pendingAction.replaceAll('-', ' ')}`}
        />
      ) : null}
    </div>
  );
}
