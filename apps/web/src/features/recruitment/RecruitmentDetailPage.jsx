import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { ConfirmActionDialog } from '../../components/ui/ConfirmActionDialog.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { recruitmentAction, recruitmentGet } from './api.js';
export function RecruitmentDetailPage({ resource }) {
  const { id } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [conversion, setConversion] = useState({ employeeCode: '', firstName: '', lastName: '' });
  const result = useQuery({
    queryKey: ['recruitment', resource, id],
    queryFn: () => recruitmentGet(resource, id),
  });
  const row = result.data;
  const transitions =
    {
      'manpower-plans': ['submitted', 'approved', 'rejected', 'closed', 'cancelled'],
      requisitions: ['submitted', 'approved', 'rejected', 'open', 'filled', 'closed', 'cancelled'],
      postings: ['published', 'closed', 'withdrawn'],
      offers: [
        'submitted',
        'approved',
        'rejected',
        'issued',
        'accepted',
        'declined',
        'expired',
        'withdrawn',
      ],
    }[resource] ?? [];
  const permission =
    resource === 'offers'
      ? 'recruitment_offer'
      : resource === 'requisitions'
        ? 'job_requisition'
        : resource === 'postings'
          ? 'job_posting'
          : 'manpower_plan';
  const action = useMutation({
    mutationFn: (name) =>
      recruitmentAction(resource, id, name, {
        workflowVersion: row.workflow_version,
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['recruitment', resource, id] }),
  });
  const convert = useMutation({
    mutationFn: () =>
      recruitmentAction('offers', id, 'convert', {
        ...conversion,
        workflowVersion: row.workflow_version,
        initialStatus: 'probation',
        statusReason: reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['recruitment', resource, id] }),
  });
  if (result.isPending) return <LoadingState />;
  if (result.error) return <ErrorState error={result.error} />;
  return (
    <section>
      <Link className="text-sm text-blue-700" to="..">
        ← Back
      </Link>
      <h2 className="mt-3 text-xl font-semibold">
        {row.code ?? row.offer_number ?? row.candidate_number ?? `Recruitment record #${id}`}
      </h2>
      <dl className="mt-5 grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
        {Object.entries(row)
          .filter(
            ([k, v]) =>
              !['history', 'id', 'company_id'].includes(k) && v !== null && typeof v !== 'object',
          )
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-slate-500">{k.replaceAll('_', ' ')}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
      </dl>
      {transitions.length ? (
        <section className="mt-5 rounded border bg-white p-4">
          <label className="block text-sm">
            Decision reason
            <textarea
              className="mt-1 w-full rounded border p-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {transitions.map((name) => (
              <ConfirmActionDialog
                key={name}
                label={name.replaceAll('_', ' ')}
                disabled={
                  !reason ||
                  action.isPending ||
                  !auth.permissions.includes(
                    `${permission}.${['approved', 'rejected'].includes(name) ? 'approve' : 'update'}`,
                  )
                }
                onConfirm={() => action.mutate(name)}
              />
            ))}
          </div>
          {action.error ? <ErrorState error={action.error} /> : null}
        </section>
      ) : null}
      {resource === 'offers' &&
      row.status === 'accepted' &&
      auth.permissions.includes('recruitment_hire.convert') ? (
        <section className="mt-5 rounded border bg-white p-4">
          <h3 className="font-semibold">Convert accepted offer</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ['employeeCode', 'Employee code'],
              ['firstName', 'First name'],
              ['lastName', 'Last name'],
            ].map(([key, label]) => (
              <label className="text-sm" key={key}>
                {label}
                <input
                  className="mt-1 w-full rounded border p-2"
                  required
                  value={conversion[key]}
                  onChange={(event) => setConversion({ ...conversion, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          <ConfirmActionDialog
            className="mt-3"
            label="Create employee and employment"
            disabled={
              !reason ||
              !conversion.employeeCode ||
              !conversion.firstName ||
              !conversion.lastName ||
              convert.isPending
            }
            onConfirm={() => convert.mutate()}
          />
          {convert.error ? <ErrorState error={convert.error} /> : null}
        </section>
      ) : null}
      {row.history?.length ? (
        <section className="mt-5">
          <h3 className="font-semibold">History</h3>
          <ul className="mt-2 space-y-2">
            {row.history.map((e) => (
              <li className="rounded border p-2" key={e.id}>
                {e.to_status ?? e.outcome} · {e.reason ?? 'Recorded'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
