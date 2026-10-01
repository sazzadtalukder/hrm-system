import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmActionDialog } from '../../components/ui/ConfirmActionDialog.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import {
  benefitEnrollmentAction,
  getBenefitEnrollment,
  getOwnBenefitEnrollment,
  updateBenefitEnrollmentDraft,
} from './api.js';

const field = 'w-full rounded-md border border-subtle p-2';

export function BenefitEnrollmentDetailPage({ own = false }) {
  const { id } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['benefits', 'enrollment', id, own],
    queryFn: () => (own ? getOwnBenefitEnrollment(id) : getBenefitEnrollment(id)),
  });
  const action = useMutation({
    mutationFn: (name) =>
      benefitEnrollmentAction(id, name, {
        workflowVersion: query.data.workflow_version,
        reason,
        ...(name === 'end' ? { effectiveDate: endDate } : {}),
      }),
    onSuccess: (data) => {
      setMessage(`Enrollment is ${data.status}.`);
      client.invalidateQueries({ queryKey: ['benefits', 'enrollment', id] });
      client.invalidateQueries({ queryKey: ['benefits', 'enrollments'] });
    },
    onError: (error) => setMessage(error.message),
  });
  const update = useMutation({
    mutationFn: (body) => updateBenefitEnrollmentDraft(id, body),
    onSuccess: () => {
      setMessage('Draft enrollment updated.');
      client.invalidateQueries({ queryKey: ['benefits', 'enrollment', id] });
      client.invalidateQueries({ queryKey: ['benefits', 'history', id] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const row = query.data;
  const actions =
    row.status === 'draft'
      ? ['activate', 'cancel']
      : row.status === 'active'
        ? ['suspend', 'end']
        : row.status === 'suspended'
          ? ['resume', 'end']
          : [];
  const permittedActions = actions.filter((name) =>
    auth.permissions.includes(`benefit_enrollment.${name}`),
  );
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{row.plan_name}</h2>
            <p>
              {row.display_name} ({row.employee_code})
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <dt>Employer contribution</dt>
            <dd>
              {row.employer_contribution_amount_snapshot ?? 'Restricted'} {row.currency_code}
            </dd>
          </div>
          <div>
            <dt>Employee contribution</dt>
            <dd>
              {row.employee_contribution_amount_snapshot ?? 'Restricted'} {row.currency_code}
            </dd>
          </div>
          <div>
            <dt>Effective</dt>
            <dd>
              {String(row.effective_start).slice(0, 10)} –{' '}
              {row.effective_end ? String(row.effective_end).slice(0, 10) : 'Open'}
            </dd>
          </div>
          <div>
            <dt>Workflow version</dt>
            <dd>{row.workflow_version}</dd>
          </div>
        </dl>
        {!own && auth.permissions.includes('benefit_enrollment.view_history') && (
          <Link
            className="mt-4 inline-block text-accent"
            to={`/benefits/enrollments/${id}/history`}
          >
            View history
          </Link>
        )}
      </section>

      {!own &&
        row.status === 'draft' &&
        auth.permissions.includes('benefit_enrollment.update_draft') && (
          <form
            className="space-y-3 rounded-lg border border-subtle bg-surface p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              update.mutate({
                version: row.version,
                effectiveStart: data.get('effectiveStart'),
                effectiveEnd: data.get('effectiveEnd') || null,
                reason: data.get('reason'),
              });
            }}
          >
            <h3 className="font-semibold">Edit draft dates</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={field}
                defaultValue={String(row.effective_start).slice(0, 10)}
                name="effectiveStart"
                required
                type="date"
              />
              <input
                className={field}
                defaultValue={row.effective_end ? String(row.effective_end).slice(0, 10) : ''}
                name="effectiveEnd"
                type="date"
              />
            </div>
            <input className={field} name="reason" placeholder="Required reason" required />
            <Button disabled={update.isPending} type="submit">
              Save draft
            </Button>
          </form>
        )}

      {!own && permittedActions.length > 0 && (
        <section className="space-y-3 rounded-lg border border-subtle bg-surface p-5">
          <h3 className="font-semibold">Enrollment workflow</h3>
          <input
            className={field}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required reason"
            value={reason}
          />
          {permittedActions.includes('end') && (
            <input
              className={field}
              onChange={(event) => setEndDate(event.target.value)}
              type="date"
              value={endDate}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {permittedActions.map((name) => (
              <ConfirmActionDialog
                disabled={!reason || action.isPending || (name === 'end' && !endDate)}
                key={name}
                label={name[0].toUpperCase() + name.slice(1)}
                onConfirm={() => action.mutate(name)}
              />
            ))}
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
