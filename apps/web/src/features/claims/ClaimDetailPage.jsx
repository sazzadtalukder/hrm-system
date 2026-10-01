import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  claimAction,
  getClaim,
  getClaimCategories,
  recordClaimPayment,
  updateClaimDraft,
} from './api.js';
import { ClaimForm } from './ClaimForm.jsx';

const actionLabels = {
  submit: 'Submit claim',
  withdraw: 'Withdraw draft',
  'request-cancellation': 'Request cancellation',
  'manager-approve': 'Manager approve',
  'manager-reject': 'Manager reject',
  'finance-approve': 'Finance approve',
  'finance-reject': 'Finance reject',
  'approve-cancellation': 'Approve cancellation',
  'reject-cancellation': 'Reject cancellation',
};

export function ClaimDetailPage({ own = false, team = false }) {
  const { id } = useParams();
  const auth = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const view = own
    ? 'own'
    : team ||
        (!auth.permissions.includes('claim.view') && auth.permissions.includes('claim.view_team'))
      ? 'team'
      : 'all';
  const q = useQuery({ queryKey: ['claim', id, view], queryFn: () => getClaim(id, view) });
  const categories = useQuery({
    queryKey: ['claim-categories', company.company?.id],
    queryFn: () => getClaimCategories(company.company.id),
    enabled: editing && Boolean(company.company),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['claim', id] });
    client.invalidateQueries({ queryKey: ['claims'] });
  };
  const mutation = useMutation({
    mutationFn: ({ action, payment = false }) =>
      payment
        ? recordClaimPayment(id, {
            workflowVersion: q.data.workflow_version,
            reason,
            idempotencyKey: crypto.randomUUID(),
            paymentReference,
            paymentDate,
          })
        : claimAction(id, action, {
            workflowVersion: q.data.workflow_version,
            reason,
            idempotencyKey: crypto.randomUUID(),
          }),
    onSuccess: (data) => {
      setMessage(`Claim is now ${data.status.replaceAll('_', ' ')}.`);
      setReason('');
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const update = useMutation({
    mutationFn: (payload) =>
      updateClaimDraft(id, {
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
  if (editing && categories.isPending) return <LoadingState />;
  if (categories.error) return <ErrorState error={categories.error} />;
  const row = q.data;
  const actions = [];
  if (own && row.status === 'draft')
    actions.push(['submit', 'claim.submit'], ['withdraw', 'claim.withdraw']);
  if (own && ['submitted', 'manager_approved', 'finance_approved'].includes(row.status))
    actions.push(['request-cancellation', 'claim.request_cancellation']);
  if (!own && row.status === 'submitted')
    actions.push(['manager-approve', 'claim.approve'], ['manager-reject', 'claim.reject']);
  if (!own && row.status === 'manager_approved')
    actions.push(
      ['finance-approve', 'claim.finance_approve'],
      ['finance-reject', 'claim.finance_reject'],
    );
  if (!own && row.status === 'cancellation_requested')
    actions.push(
      ['approve-cancellation', 'claim.approve_cancellation'],
      ['reject-cancellation', 'claim.reject_cancellation'],
    );
  if (editing)
    return (
      <section className="mx-auto max-w-4xl rounded-lg border border-subtle bg-surface p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Edit claim draft</h2>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel edit
          </Button>
        </div>
        <ClaimForm
          categories={categories.data}
          initial={row}
          pending={update.isPending}
          submitLabel="Save changes"
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
            <h2 className="text-xl font-semibold">{row.claim_number ?? `Draft #${row.id}`}</h2>
            <p>{row.title}</p>
            <p className="mt-2 text-sm text-secondary">{row.business_purpose}</p>
            <p className="mt-2 text-sm">
              {row.display_name} ({row.employee_code}) · Employment #{row.employment_id}
            </p>
          </div>
          <div className="text-right">
            <StatusBadge status={row.status} />
            <p className="mt-3 font-semibold">
              {row.total_amount} {row.currency_code}
            </p>
          </div>
        </div>
        {own && row.status === 'draft' && auth.permissions.includes('claim.update_draft') && (
          <Button className="mt-4" variant="secondary" onClick={() => setEditing(true)}>
            Edit draft
          </Button>
        )}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Description</th>
                <th className="p-2">Merchant/reference</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((item) => (
                <tr className="border-t align-top" key={item.id}>
                  <td className="p-2">{String(item.expense_date).slice(0, 10)}</td>
                  <td className="p-2">{item.description ?? 'Sensitive details restricted'}</td>
                  <td className="p-2">{item.merchant_reference ?? '—'}</td>
                  <td className="p-2">{item.amount}</td>
                  <td className="p-2">
                    {item.evidence?.map((evidence) => (
                      <div key={evidence.id}>
                        {evidence.display_name}: {evidence.reference_value}
                      </div>
                    )) ?? (item.evidencePresent ? 'Evidence recorded (restricted)' : 'None')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!own && auth.permissions.includes('claim.view_history') && (
          <Link className="mt-4 inline-block text-accent" to={`/claims/${id}/history`}>
            View workflow history
          </Link>
        )}
      </section>
      {(actions.some(([, permission]) => auth.permissions.includes(permission)) ||
        (!own &&
          row.status === 'finance_approved' &&
          auth.permissions.includes('claim.record_payment'))) && (
        <section className="space-y-3 rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">Workflow actions</h3>
          <textarea
            className="w-full rounded-md border border-subtle p-2"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required reason"
          />
          <div className="flex flex-wrap gap-2">
            {actions
              .filter(([, permission]) => auth.permissions.includes(permission))
              .map(([action]) => (
                <Button
                  disabled={!reason || mutation.isPending}
                  key={action}
                  variant={
                    action.includes('reject') || action.includes('withdraw')
                      ? 'secondary'
                      : 'primary'
                  }
                  onClick={() => {
                    if (globalThis.confirm(`${actionLabels[action]}?`)) mutation.mutate({ action });
                  }}
                >
                  {actionLabels[action]}
                </Button>
              ))}
          </div>
          {!own &&
            row.status === 'finance_approved' &&
            auth.permissions.includes('claim.record_payment') && (
              <div className="space-y-2 border-t border-subtle pt-3">
                <h4 className="font-medium">Record reimbursement payment</h4>
                <input
                  className="w-full rounded-md border border-subtle p-2"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Payment reference"
                />
                <input
                  className="w-full rounded-md border border-subtle p-2"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
                <Button
                  disabled={!reason || !paymentReference || !paymentDate || mutation.isPending}
                  onClick={() => {
                    if (globalThis.confirm('Record this claim as paid?'))
                      mutation.mutate({ action: 'payment', payment: true });
                  }}
                >
                  Record payment
                </Button>
              </div>
            )}
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
