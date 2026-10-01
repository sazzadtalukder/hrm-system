import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getLoan, getLoanTypes, loanAction, updateLoanDraft } from './api.js';
import { LoanApplicationForm } from './LoanApplicationForm.jsx';

const labels = {
  submit: 'Submit application',
  withdraw: 'Withdraw draft',
  'request-cancellation': 'Request cancellation',
  approve: 'Manager approve',
  reject: 'Manager reject',
  'finance-approve': 'Finance approve',
  'finance-reject': 'Finance reject',
  'approve-cancellation': 'Approve cancellation',
  'reject-cancellation': 'Reject cancellation',
  disburse: 'Record disbursement',
};
export function LoanDetailPage({ own = false, team = false }) {
  const { id } = useParams();
  const auth = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const view = own
    ? 'own'
    : team ||
        (!auth.permissions.includes('loan.view') && auth.permissions.includes('loan.view_team'))
      ? 'team'
      : 'all';
  const q = useQuery({ queryKey: ['loan', id, view], queryFn: () => getLoan(id, view) });
  const types = useQuery({
    queryKey: ['loan-types', company.company?.id],
    queryFn: () => getLoanTypes(company.company.id),
    enabled: editing && Boolean(company.company),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['loan', id] });
    client.invalidateQueries({ queryKey: ['loans'] });
  };
  const mutation = useMutation({
    mutationFn: (action) =>
      loanAction(id, action, {
        workflowVersion: q.data.workflow_version,
        reason,
        idempotencyKey: crypto.randomUUID(),
        ...(action === 'disburse' ? { disbursementDate: date, reference } : {}),
      }),
    onSuccess: (result) => {
      setMessage(`Application is now ${result.status.replaceAll('_', ' ')}.`);
      setReason('');
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const update = useMutation({
    mutationFn: (payload) =>
      updateLoanDraft(id, {
        ...payload,
        currencyCode: q.data.currency_code,
        version: q.data.version,
      }),
    onSuccess: () => {
      setMessage('Draft updated.');
      setEditing(false);
      refresh();
    },
  });
  if (q.isPending || company.isPending) return <LoadingState />;
  if (q.error || company.error) return <ErrorState error={q.error ?? company.error} />;
  if (editing && types.isPending) return <LoadingState />;
  if (types.error) return <ErrorState error={types.error} />;
  const application = q.data;
  const actions = [];
  if (own && application.status === 'draft')
    actions.push(['submit', 'loan.submit'], ['withdraw', 'loan.withdraw']);
  if (own && ['submitted', 'manager_approved', 'finance_approved'].includes(application.status))
    actions.push(['request-cancellation', 'loan.request_cancellation']);
  if (!own && application.status === 'submitted')
    actions.push(['approve', 'loan.approve'], ['reject', 'loan.reject']);
  if (!own && application.status === 'manager_approved')
    actions.push(
      ['finance-approve', 'loan.finance_approve'],
      ['finance-reject', 'loan.finance_reject'],
    );
  if (!own && application.status === 'cancellation_requested')
    actions.push(
      ['approve-cancellation', 'loan.approve_cancellation'],
      ['reject-cancellation', 'loan.reject_cancellation'],
    );
  if (!own && application.status === 'finance_approved')
    actions.push(['disburse', 'loan.disburse']);
  if (editing)
    return (
      <section className="mx-auto max-w-2xl rounded-lg border border-subtle bg-surface p-6">
        <div className="mb-5 flex justify-between gap-3">
          <h2 className="text-xl font-semibold">Edit application draft</h2>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel edit
          </Button>
        </div>
        <LoanApplicationForm
          initial={application}
          pending={update.isPending}
          submitLabel="Save changes"
          types={types.data}
          onSubmit={(payload) => update.mutate(payload)}
        />
        {update.error && <ErrorState error={update.error} />}
      </section>
    );
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {application.application_number ?? `Draft #${application.id}`}
            </h2>
            <p>
              {application.facility_name} · {application.facility_kind.replaceAll('_', ' ')}
            </p>
            <p className="mt-2 text-sm">
              {application.display_name} ({application.employee_code}) · Employment #
              {application.employment_id}
            </p>
          </div>
          <StatusBadge status={application.status} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-secondary">Principal</dt>
            <dd>
              {application.requested_principal} {application.currency_code}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">Term</dt>
            <dd>{application.requested_term_months} months</dd>
          </div>
          <div>
            <dt className="text-secondary">Purpose</dt>
            <dd>{application.purpose ?? 'Sensitive purpose restricted'}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-4">
          {own &&
            application.status === 'draft' &&
            auth.permissions.includes('loan.update_draft') && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
            )}
          {application.account && (
            <Link className="text-accent" to={`/loans/accounts/${application.account.id}`}>
              View account and repayments
            </Link>
          )}
          {!own && auth.permissions.includes('loan.view_history') && (
            <Link className="text-accent" to={`/loans/${id}/history`}>
              View workflow history
            </Link>
          )}
        </div>
      </section>
      {actions.some(([, permission]) => auth.permissions.includes(permission)) && (
        <section className="space-y-3 rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">Workflow actions</h3>
          <textarea
            className="w-full rounded-md border border-subtle p-2"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required reason"
          />
          {application.status === 'finance_approved' &&
            auth.permissions.includes('loan.disburse') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Disbursement date
                  <input
                    className="mt-1 w-full rounded-md border p-2"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Disbursement reference
                  <input
                    className="mt-1 w-full rounded-md border p-2"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
              </div>
            )}
          <div className="flex flex-wrap gap-2">
            {actions
              .filter(([, permission]) => auth.permissions.includes(permission))
              .map(([action]) => (
                <Button
                  disabled={
                    !reason ||
                    mutation.isPending ||
                    (action === 'disburse' && (!date || !reference))
                  }
                  key={action}
                  variant={
                    action.includes('reject') || action === 'withdraw' ? 'secondary' : 'primary'
                  }
                  onClick={() => {
                    if (globalThis.confirm(`${labels[action]}?`)) mutation.mutate(action);
                  }}
                >
                  {labels[action]}
                </Button>
              ))}
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
