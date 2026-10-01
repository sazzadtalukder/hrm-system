import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getLoanAccount, loanLedgerAction, reverseLoanLedgerEntry } from './api.js';

const today = () => new Date().toISOString().slice(0, 10);

export function LoanAccountPage() {
  const { id } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['loan-account', id], queryFn: () => getLoanAccount(id) });
  const refresh = () => client.invalidateQueries({ queryKey: ['loan-account', id] });
  const ledgerMutation = useMutation({
    mutationFn: (kind) =>
      loanLedgerAction(id, kind, {
        amount,
        effectiveDate: date,
        reference: reference || null,
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      setMessage(`Entry recorded. Outstanding balance is ${result.outstandingAmount}.`);
      setAmount('');
      setReference('');
      setReason('');
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const reversalMutation = useMutation({
    mutationFn: (entryId) =>
      reverseLoanLedgerEntry(id, entryId, {
        effectiveDate: date,
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      setMessage(`Entry reversed. Outstanding balance is ${result.outstandingAmount}.`);
      setReason('');
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const account = query.data;
  const reversedIds = new Set(
    account.ledger
      .filter((entry) => entry.reversal_of_entry_id)
      .map((entry) => Number(entry.reversal_of_entry_id)),
  );
  const canRecord = auth.permissions.includes('loan_repayment.record');
  const canAdjust = auth.permissions.includes('loan_repayment.adjust');
  const canReverse = auth.permissions.includes('loan_repayment.reverse');

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Account {account.account_number}</h2>
            <p className="mt-1 text-secondary">
              Disbursed {String(account.disbursement_date).slice(0, 10)} · Matures{' '}
              {String(account.maturity_date).slice(0, 10)}
            </p>
          </div>
          <StatusBadge status={account.status} />
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-secondary">Original principal</dt>
            <dd>
              {account.original_principal} {account.currency_code}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Total repayable</dt>
            <dd>
              {account.total_repayable} {account.currency_code}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Outstanding</dt>
            <dd className="font-semibold">
              {account.outstanding_amount} {account.currency_code}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h3 className="font-semibold">Repayment schedule</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Installment</th>
                <th className="p-2">Due date</th>
                <th className="p-2">Principal</th>
                <th className="p-2">Total</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {account.installments.map((item) => (
                <tr className="border-t border-subtle" key={item.id}>
                  <td className="p-2">#{item.installment_number}</td>
                  <td className="p-2">{String(item.due_date).slice(0, 10)}</td>
                  <td className="p-2">{item.principal_amount}</td>
                  <td className="p-2">
                    {item.total_amount} {account.currency_code}
                  </td>
                  <td className="p-2">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h3 className="font-semibold">Repayment ledger</h3>
        {!account.ledger.length ? (
          <EmptyState />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Reference</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {account.ledger.map((entry) => (
                  <tr className="border-t border-subtle" key={entry.id}>
                    <td className="p-2">{String(entry.effective_date).slice(0, 10)}</td>
                    <td className="p-2">{entry.entry_type.replaceAll('_', ' ')}</td>
                    <td className="p-2">
                      {entry.amount} {account.currency_code}
                    </td>
                    <td className="p-2">{entry.reference ?? '—'}</td>
                    <td className="p-2">{entry.reason}</td>
                    <td className="p-2">
                      {canReverse &&
                      entry.entry_type !== 'reversal' &&
                      !reversedIds.has(Number(entry.id)) ? (
                        <Button
                          disabled={!date || !reason || reversalMutation.isPending}
                          variant="secondary"
                          onClick={() => {
                            if (globalThis.confirm('Reverse this ledger entry?'))
                              reversalMutation.mutate(entry.id);
                          }}
                        >
                          Reverse
                        </Button>
                      ) : reversedIds.has(Number(entry.id)) ? (
                        'Reversed'
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(canRecord || canAdjust || canReverse) && (
        <section className="space-y-3 rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">Financial action</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(canRecord || canAdjust) && (
              <label className="text-sm">
                Amount
                <input
                  className="mt-1 w-full rounded-md border border-subtle bg-surface p-2"
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
            )}
            <label className="text-sm">
              Effective date
              <input
                className="mt-1 w-full rounded-md border border-subtle bg-surface p-2"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            {(canRecord || canAdjust) && (
              <label className="text-sm">
                Reference (optional)
                <input
                  className="mt-1 w-full rounded-md border border-subtle bg-surface p-2"
                  maxLength={100}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
            )}
            <label className="text-sm">
              Reason
              <textarea
                className="mt-1 w-full rounded-md border border-subtle bg-surface p-2"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRecord && (
              <Button
                disabled={
                  !amount ||
                  !date ||
                  !reason ||
                  ledgerMutation.isPending ||
                  account.status !== 'active'
                }
                onClick={() => {
                  if (globalThis.confirm('Record this repayment?'))
                    ledgerMutation.mutate('repayments');
                }}
              >
                Record repayment
              </Button>
            )}
            {canAdjust && (
              <Button
                disabled={
                  !amount ||
                  !date ||
                  !reason ||
                  ledgerMutation.isPending ||
                  account.status !== 'active'
                }
                variant="secondary"
                onClick={() => {
                  if (globalThis.confirm('Record this authorized adjustment?'))
                    ledgerMutation.mutate('adjustments');
                }}
              >
                Record adjustment
              </Button>
            )}
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
