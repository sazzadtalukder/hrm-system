import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActionDialog } from '../../components/ui/ActionDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  createTrainingSession,
  getTrainingCourses,
  getTrainingProviders,
  getTrainingSessions,
  sessionAction,
} from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function TrainingSessionAdminPage() {
  const company = useOrganizationCompany(),
    { permissions } = useAuth(),
    client = useQueryClient(),
    [message, setMessage] = useState(''),
    [pendingAction, setPendingAction] = useState(null),
    courses = useQuery({
      queryKey: ['training-courses', company.company?.id],
      queryFn: () => getTrainingCourses(company.company.id),
      enabled: Boolean(company.company),
    }),
    providers = useQuery({
      queryKey: ['training-providers', company.company?.id],
      queryFn: () => getTrainingProviders(company.company.id),
      enabled: Boolean(company.company),
    }),
    sessions = useQuery({
      queryKey: ['training-sessions', company.company?.id],
      queryFn: () => getTrainingSessions(company.company.id),
      enabled: Boolean(company.company),
    }),
    create = useMutation({
      mutationFn: createTrainingSession,
      onSuccess: () => {
        setMessage('Session created.');
        client.invalidateQueries({ queryKey: ['training-sessions'] });
      },
      onError: (error) => setMessage(error.message),
    }),
    transition = useMutation({
      mutationFn: ({ id, path, body }) => sessionAction(id, path, body),
      onSuccess: () => {
        setMessage('Session updated.');
        client.invalidateQueries({ queryKey: ['training-sessions'] });
      },
      onError: (error) => setMessage(error.message),
    });
  if (company.isPending || courses.isPending || providers.isPending || sessions.isPending)
    return <LoadingState />;
  if (company.error || courses.error || providers.error || sessions.error)
    return (
      <ErrorState error={company.error ?? courses.error ?? providers.error ?? sessions.error} />
    );
  return (
    <div className="space-y-5">
      <form
        className="grid gap-2 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          create.mutate({
            companyId: company.company.id,
            code: data.get('code'),
            trainingCourseVersionId: Number(data.get('course')),
            title: data.get('title'),
            startsAtUtc: new Date(data.get('start')).toISOString(),
            endsAtUtc: new Date(data.get('end')).toISOString(),
            timezone: company.company.timezone,
            enrollmentOpensOn: data.get('opens'),
            enrollmentClosesOn: data.get('closes'),
            capacity: Number(data.get('capacity')),
            branchId: null,
            location: data.get('location') || null,
            virtualReference: null,
            trainingProviderVersionId: data.get('provider') ? Number(data.get('provider')) : null,
            facilitators: [],
            reason: data.get('reason'),
          });
        }}
      >
        <h2 className="font-semibold sm:col-span-3">Create training session</h2>
        <input className={field} name="code" placeholder="Session code" required />
        <input className={field} name="title" placeholder="Session title" required />
        <select className={field} name="course" required>
          <option value="">Course</option>
          {courses.data.map((item) => (
            <option key={item.id} value={item.course_version_id}>
              {item.code} · {item.name}
            </option>
          ))}
        </select>
        <input className={field} name="start" type="datetime-local" required />
        <input className={field} name="end" type="datetime-local" required />
        <input className={field} name="opens" type="date" required />
        <input className={field} name="closes" type="date" required />
        <input
          className={field}
          max="1000"
          min="1"
          name="capacity"
          placeholder="Capacity"
          type="number"
          required
        />
        <select className={field} name="provider">
          <option value="">No provider</option>
          {providers.data.map((item) => (
            <option key={item.id} value={item.provider_version_id}>
              {item.name}
            </option>
          ))}
        </select>
        <input className={field} name="location" placeholder="Location" />
        <input className={field} name="reason" placeholder="Reason" required />
        <Button type="submit">Create session</Button>
      </form>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Session administration</h2>
        {sessions.data.map((item) => (
          <div className="flex flex-wrap items-center gap-2 border-b py-2" key={item.id}>
            <span className="mr-auto">
              {item.code} · {item.title_snapshot} · {item.status}
            </span>
            {[
              ['draft', 'publish', 'training_session.publish'],
              ['draft', 'cancel', 'training_session.cancel'],
              ['published', 'close-enrollment', 'training_session.close_enrollment'],
              ['published', 'cancel', 'training_session.cancel'],
              ['enrollment_closed', 'start', 'training_session.start'],
              ['enrollment_closed', 'cancel', 'training_session.cancel'],
              ['in_progress', 'complete', 'training_session.complete'],
            ]
              .filter(
                ([state, , permission]) =>
                  state === item.status && permissions.includes(permission),
              )
              .map(([, path]) => (
                <Button key={path} onClick={() => setPendingAction({ item, path })} type="button">
                  {path}
                </Button>
              ))}
          </div>
        ))}
      </section>
      {message && <p role="status">{message}</p>}
      {pendingAction ? (
        <ActionDialog
          busy={transition.isPending}
          confirmLabel={pendingAction.path.replaceAll('-', ' ')}
          onCancel={() => setPendingAction(null)}
          onConfirm={({ reason }) => {
            transition.mutate({
              id: pendingAction.item.id,
              path: pendingAction.path,
              body: {
                workflowVersion: pendingAction.item.workflow_version,
                reason,
                idempotencyKey: crypto.randomUUID(),
              },
            });
            setPendingAction(null);
          }}
          title={`Confirm ${pendingAction.path.replaceAll('-', ' ')}`}
        />
      ) : null}
    </div>
  );
}
