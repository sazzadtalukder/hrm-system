import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ActionDialog } from '../../components/ui/ActionDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  createExit,
  createNotification,
  createSettlement,
  getAuditEvents,
  getExit,
  getExits,
  getNotifications,
  getSettlement,
  getSettlements,
  getWorkforceReport,
  markNotificationRead,
  transitionExit,
  transitionSettlement,
  updateExitClearance,
} from './api.js';

const makeKey = () => crypto.randomUUID();
const inputClass = 'mt-1 block w-full rounded border border-subtle bg-surface p-2';
const has = (auth, permission) => auth.permissions.includes(permission);
const settlementItem = (itemType = 'earning') => ({
  itemType,
  code: '',
  description: '',
  amount: '',
});

function notificationTarget(row, auth) {
  if (!row.reference_id) return null;
  if (row.reference_type === 'expense_claim') {
    if (has(auth, 'claim.view')) return `/claims/${row.reference_id}`;
    if (has(auth, 'claim.view_team')) return `/claims/team/${row.reference_id}`;
    if (has(auth, 'claim.view_own')) return `/claims/my/${row.reference_id}`;
  }
  if (row.reference_type === 'loan_application') {
    if (has(auth, 'loan.view')) return `/loans/${row.reference_id}`;
    if (has(auth, 'loan.view_team')) return `/loans/team/${row.reference_id}`;
    if (has(auth, 'loan.view_own')) return `/loans/my/${row.reference_id}`;
  }
  if (row.reference_type === 'performance_review') {
    if (has(auth, 'performance_review.view')) return `/performance/${row.reference_id}`;
    if (has(auth, 'performance_review.view_team')) return `/performance/team/${row.reference_id}`;
    if (has(auth, 'performance_review.view_own')) return `/performance/my/${row.reference_id}`;
  }
  if (row.reference_type === 'training_enrollment') {
    if (has(auth, 'training_enrollment.view')) return `/training/enrollments/${row.reference_id}`;
    if (has(auth, 'training_enrollment.view_team')) return `/training/team/${row.reference_id}`;
    if (has(auth, 'training_enrollment.view_own')) return `/training/my/${row.reference_id}`;
  }
  if (row.reference_type === 'career_plan') {
    if (has(auth, 'career_plan.view')) return `/career/plans/${row.reference_id}`;
    if (has(auth, 'career_plan.view_team')) return `/career/team/${row.reference_id}`;
    if (has(auth, 'career_plan.view_own')) return `/career/my/${row.reference_id}`;
  }
  if (row.reference_type === 'successor_nomination') {
    if (has(auth, 'succession_nomination.view'))
      return `/succession/nominations/${row.reference_id}`;
    if (has(auth, 'succession_nomination.view_team')) return `/succession/team/${row.reference_id}`;
  }
  if (row.reference_type === 'employee_exit' && has(auth, 'exit.view'))
    return `/exits?selected=${row.reference_id}`;
  if (row.reference_type === 'final_settlement' && has(auth, 'final_settlement.view'))
    return `/final-settlements?selected=${row.reference_id}`;
  return null;
}

function Action({ label, action, run }) {
  return (
    <Button onClick={() => run(action)} type="button" variant="secondary">
      {label}
    </Button>
  );
}

function ExitWorkspace({ companyId, auth }) {
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [selectedId, setSelectedId] = useState(() => Number(searchParams.get('selected')) || null);
  const [pendingAction, setPendingAction] = useState(null);
  const [approvedLastWorkingDay, setApprovedLastWorkingDay] = useState('');
  const [message, setMessage] = useState('');
  const list = useQuery({
    queryKey: ['operations', 'exits', companyId, filters],
    queryFn: () => getExits(companyId, filters),
  });
  const detail = useQuery({
    queryKey: ['operations', 'exit', selectedId],
    queryFn: () => getExit(selectedId),
    enabled: Boolean(selectedId),
  });
  const employees = useQuery({
    queryKey: ['operations', 'exit-employees', companyId],
    queryFn: () => getEmployees(companyId, { pageSize: 100 }),
    enabled: has(auth, 'exit.create'),
  });
  const mutation = useMutation({
    mutationFn: (operation) => operation(),
    onSuccess: async (result) => {
      if (result?.id) setSelectedId(result.id);
      setMessage('Exit record updated successfully.');
      await client.invalidateQueries({ queryKey: ['operations', 'exit'] });
      await client.invalidateQueries({ queryKey: ['operations', 'exits'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (list.isPending || (has(auth, 'exit.create') && employees.isPending)) return <LoadingState />;
  if (list.error || employees.error) return <ErrorState error={list.error ?? employees.error} />;
  const transition = (action) => setPendingAction({ kind: 'transition', action });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exit Management</h1>
      {has(auth, 'exit.create') && (
        <form
          className="grid gap-3 rounded border border-subtle p-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate(() =>
              createExit({
                companyId,
                employmentId: Number(data.get('employmentId')),
                exitType: data.get('exitType'),
                requestedLastWorkingDay: data.get('lastWorkingDay'),
                employeeComment: data.get('comment') || null,
                reason: data.get('reason'),
                idempotencyKey: makeKey(),
              }),
            );
          }}
        >
          <h2 className="font-semibold sm:col-span-3">Create exit request</h2>
          <label>
            Employee
            <select className={inputClass} name="employmentId" required>
              <option value="">Select employee</option>
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
          <label>
            Exit type
            <select className={inputClass} name="exitType" required>
              <option value="resignation">Resignation</option>
              <option value="termination">Termination</option>
              <option value="retirement">Retirement</option>
              <option value="contract_end">Contract end</option>
            </select>
          </label>
          <label>
            Requested last working day
            <input className={inputClass} name="lastWorkingDay" required type="date" />
          </label>
          <label className="sm:col-span-2">
            Comment
            <textarea className={inputClass} maxLength="5000" name="comment" />
          </label>
          <label>
            Reason
            <input className={inputClass} maxLength="500" name="reason" required />
          </label>
          <Button disabled={mutation.isPending} type="submit">
            Create draft
          </Button>
        </form>
      )}
      <form
        className="grid gap-3 rounded border border-subtle p-4 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilters({ search: data.get('search'), status: data.get('status') });
        }}
      >
        <label>
          Employee search
          <input className={inputClass} name="search" placeholder="Code or name" />
        </label>
        <label>
          Status
          <select className={inputClass} name="status">
            <option value="">All statuses</option>
            {[
              'draft',
              'submitted',
              'manager_approved',
              'clearance',
              'completed',
              'withdrawn',
              'rejected',
              'cancelled',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button className="self-end" type="submit">
          Search
        </Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {list.data.length ? (
            list.data.map((row) => (
              <button
                className="block w-full border-b border-subtle p-3 text-left"
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                <strong>
                  {row.employee_name_snapshot} ({row.employee_code_snapshot})
                </strong>
                <span className="block text-sm text-secondary">
                  {row.status} · {String(row.requested_last_working_day).slice(0, 10)}
                </span>
              </button>
            ))
          ) : (
            <EmptyState />
          )}
        </div>
        <div>
          {!selectedId ? (
            <EmptyState message="Select an exit." />
          ) : detail.isPending ? (
            <LoadingState />
          ) : detail.error ? (
            <ErrorState error={detail.error} />
          ) : (
            <section className="space-y-4 rounded border border-subtle p-5">
              <h2 className="text-lg font-semibold">Exit #{detail.data.id}</h2>
              <p>
                {detail.data.status} · workflow version {detail.data.workflow_version}
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.data.status === 'draft' && has(auth, 'exit.submit') && (
                  <Action action="submit" label="Submit" run={transition} />
                )}
                {['draft', 'submitted'].includes(detail.data.status) &&
                  has(auth, 'exit.withdraw') && (
                    <Action action="withdraw" label="Withdraw" run={transition} />
                  )}
                {detail.data.status === 'submitted' && has(auth, 'exit.manager_approve') && (
                  <Action action="manager-approve" label="Manager approve" run={transition} />
                )}
                {detail.data.status === 'manager_approved' && has(auth, 'exit.approve') && (
                  <Action action="approve" label="HR approve" run={transition} />
                )}
                {['submitted', 'manager_approved'].includes(detail.data.status) &&
                  has(auth, 'exit.reject') && (
                    <Action action="reject" label="Reject" run={transition} />
                  )}
                {['draft', 'submitted', 'manager_approved'].includes(detail.data.status) &&
                  has(auth, 'exit.cancel') && (
                    <Action action="cancel" label="Cancel" run={transition} />
                  )}
                {detail.data.status === 'clearance' &&
                  detail.data.clearances.length > 0 &&
                  detail.data.clearances.every((item) =>
                    ['cleared', 'waived'].includes(item.status),
                  ) &&
                  has(auth, 'exit.complete') && (
                  <Action action="complete" label="Complete exit" run={transition} />
                )}
              </div>
              {detail.data.status === 'manager_approved' && has(auth, 'exit.approve') && (
                <label className="block max-w-sm">
                  Approved last working day
                  <input
                    className={inputClass}
                    onChange={(event) => setApprovedLastWorkingDay(event.target.value)}
                    type="date"
                    value={approvedLastWorkingDay}
                  />
                </label>
              )}
              <div>
                <h3 className="font-semibold">Clearance</h3>
                {detail.data.clearances.length ? (
                  detail.data.clearances.map((item) => (
                    <div className="mt-2 rounded border border-subtle p-3" key={item.id}>
                      <strong>{item.area}</strong>
                      <span className="ml-2 text-sm">{item.status}</span>
                      {has(auth, 'exit.clearance') && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['cleared', 'waived', 'blocked'].map((status) => (
                            <Button
                              key={status}
                              variant="secondary"
                              onClick={() => setPendingAction({ kind: 'clearance', item, status })}
                              type="button"
                            >
                              {status}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-secondary">
                    Clearance items appear after HR approval.
                  </p>
                )}
                {detail.data.status === 'clearance' &&
                detail.data.clearances.some(
                  (item) => !['cleared', 'waived'].includes(item.status),
                ) ? (
                  <p className="mt-2 text-sm text-secondary">
                    Resolve or waive every clearance item before completing the exit.
                  </p>
                ) : null}
              </div>
              <div>
                <h3 className="font-semibold">History</h3>
                {detail.data.events.map((event) => (
                  <p className="text-sm" key={event.id}>
                    {event.from_state} → {event.to_state}: {event.reason}
                  </p>
                ))}
              </div>
              {mutation.error && <ErrorState error={mutation.error} />}
            </section>
          )}
        </div>
      </div>
      {pendingAction ? (
        <ActionDialog
          busy={mutation.isPending}
          confirmLabel="Confirm"
          onCancel={() => setPendingAction(null)}
          onConfirm={({ reason }) => {
            if (pendingAction.kind === 'transition')
              mutation.mutate(() =>
                transitionExit(selectedId, pendingAction.action, {
                  workflowVersion: detail.data.workflow_version,
                  ...(pendingAction.action === 'approve' && approvedLastWorkingDay
                    ? { approvedLastWorkingDay }
                    : {}),
                  reason,
                  idempotencyKey: makeKey(),
                }),
              );
            else
              mutation.mutate(() =>
                updateExitClearance(detail.data.id, pendingAction.item.area, {
                  status: pendingAction.status,
                  version: pendingAction.item.version,
                  reason,
                  comment: null,
                  idempotencyKey: makeKey(),
                }),
              );
            setPendingAction(null);
          }}
          title={
            pendingAction.kind === 'transition'
              ? `Confirm ${pendingAction.action.replaceAll('-', ' ')}`
              : `Mark ${pendingAction.item.area} ${pendingAction.status}`
          }
        />
      ) : null}
      {message && <p role={mutation.error ? 'alert' : 'status'}>{message}</p>}
    </div>
  );
}

function SettlementWorkspace({ companyId, auth }) {
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => Number(searchParams.get('selected')) || null);
  const [pendingAction, setPendingAction] = useState(null);
  const [items, setItems] = useState([settlementItem('earning')]);
  const [message, setMessage] = useState('');
  const list = useQuery({
    queryKey: ['operations', 'settlements', companyId],
    queryFn: () => getSettlements(companyId),
  });
  const detail = useQuery({
    queryKey: ['operations', 'settlement', selectedId],
    queryFn: () => getSettlement(selectedId),
    enabled: Boolean(selectedId),
  });
  const completedExits = useQuery({
    queryKey: ['operations', 'completed-exits', companyId],
    queryFn: () => getExits(companyId, { status: 'completed' }),
    enabled: has(auth, 'final_settlement.create'),
  });
  const mutation = useMutation({
    mutationFn: (operation) => operation(),
    onSuccess: async (result) => {
      if (result?.id) setSelectedId(result.id);
      setMessage('Final settlement updated successfully.');
      await client.invalidateQueries({ queryKey: ['operations', 'settlement'] });
      await client.invalidateQueries({ queryKey: ['operations', 'settlements'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (list.isPending || (has(auth, 'final_settlement.create') && completedExits.isPending))
    return <LoadingState />;
  if (list.error || completedExits.error)
    return <ErrorState error={list.error ?? completedExits.error} />;
  const transition = (action) => setPendingAction(action);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Final Settlements</h1>
      {has(auth, 'final_settlement.create') && (
        <form
          className="grid gap-3 rounded border border-subtle p-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const submittedItems = items.filter(
              (item) => item.code.trim() && item.description.trim() && item.amount,
            );
            mutation.mutate(() =>
              createSettlement({
                companyId,
                employeeExitId: Number(data.get('exitId')),
                settlementDate: data.get('settlementDate'),
                currencyCode: data.get('currencyCode'),
                items: submittedItems,
                reason: data.get('reason'),
                idempotencyKey: makeKey(),
              }),
            );
          }}
        >
          <label>
            Completed exit
            <select className={inputClass} name="exitId" required>
              <option value="">Select completed exit</option>
              {completedExits.data.map((exit) => (
                <option key={exit.id} value={exit.id}>
                  {exit.employee_name_snapshot} · {exit.employee_code_snapshot} · Exit #{exit.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Settlement date
            <input className={inputClass} name="settlementDate" required type="date" />
          </label>
          <label>
            Currency
            <input
              className={inputClass}
              defaultValue="BDT"
              maxLength="3"
              minLength="3"
              name="currencyCode"
              required
            />
          </label>
          <div className="space-y-3 sm:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Settlement items</h3>
              <div className="flex gap-2">
                <Button
                  onClick={() => setItems((current) => [...current, settlementItem('earning')])}
                  type="button"
                  variant="secondary"
                >
                  Add earning
                </Button>
                <Button
                  onClick={() => setItems((current) => [...current, settlementItem('deduction')])}
                  type="button"
                  variant="secondary"
                >
                  Add deduction
                </Button>
              </div>
            </div>
            {items.map((item, index) => (
              <div
                className="grid gap-2 rounded border border-subtle p-3 sm:grid-cols-4"
                key={index}
              >
                <select
                  className={inputClass}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, position) =>
                        position === index ? { ...entry, itemType: event.target.value } : entry,
                      ),
                    )
                  }
                  value={item.itemType}
                >
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, position) =>
                        position === index ? { ...entry, code: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Code"
                  required={index === 0}
                  value={item.code}
                />
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, position) =>
                        position === index ? { ...entry, description: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Description"
                  required={index === 0}
                  value={item.description}
                />
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, amount: event.target.value } : entry,
                        ),
                      )
                    }
                    pattern="\d+(\.\d{1,2})?"
                    placeholder="Amount"
                    required={index === 0}
                    value={item.amount}
                  />
                  {items.length > 1 && (
                    <Button
                      onClick={() =>
                        setItems((current) => current.filter((_, position) => position !== index))
                      }
                      type="button"
                      variant="secondary"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <label className="sm:col-span-2">
            Reason
            <input className={inputClass} maxLength="500" name="reason" required />
          </label>
          <Button className="self-end" type="submit">
            Create settlement
          </Button>
        </form>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {list.data.length ? (
            list.data.map((row) => (
              <button
                className="block w-full border-b border-subtle p-3 text-left"
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                <strong>
                  {row.employee_name_snapshot} ({row.employee_code_snapshot})
                </strong>
                <span className="block text-sm text-secondary">
                  Settlement #{row.id} · {row.status} · {row.net_amount} {row.currency_code}
                </span>
              </button>
            ))
          ) : (
            <EmptyState />
          )}
        </div>
        <div>
          {!selectedId ? (
            <EmptyState message="Select a settlement to review." />
          ) : detail.isPending ? (
            <LoadingState />
          ) : detail.error ? (
            <ErrorState error={detail.error} />
          ) : (
            <section className="space-y-4 rounded border border-subtle p-5">
              <h2 className="text-lg font-semibold">Settlement #{detail.data.id}</h2>
              <p>
                {detail.data.versions[0]?.employee_name_snapshot} (
                {detail.data.versions[0]?.employee_code_snapshot}) · {detail.data.status}
              </p>
              <p>
                Earnings {detail.data.total_earnings} · Deductions {detail.data.total_deductions} ·
                Net {detail.data.net_amount} {detail.data.currency_code}
              </p>
              <div>
                {detail.data.items.map((item) => (
                  <p className="text-sm" key={item.id}>
                    {item.item_type}: {item.description} — {item.amount}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.data.status === 'draft' && has(auth, 'final_settlement.calculate') && (
                  <Action action="calculate" label="Calculate" run={transition} />
                )}
                {detail.data.status === 'calculated' && has(auth, 'final_settlement.submit') && (
                  <Action action="submit" label="Submit" run={transition} />
                )}
                {['draft', 'calculated'].includes(detail.data.status) &&
                  has(auth, 'final_settlement.cancel') && (
                    <Action action="cancel" label="Cancel" run={transition} />
                  )}
                {detail.data.status === 'submitted' && has(auth, 'final_settlement.approve') && (
                  <Action action="approve" label="Approve" run={transition} />
                )}
                {detail.data.status === 'submitted' && has(auth, 'final_settlement.reject') && (
                  <Action action="reject" label="Reject" run={transition} />
                )}
              </div>
              {detail.data.status === 'approved' &&
                has(auth, 'final_settlement.record_payment') && (
                  <form
                    className="grid gap-2 rounded border border-subtle p-3 sm:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      mutation.mutate(() =>
                        transitionSettlement(selectedId, 'payment', {
                          workflowVersion: detail.data.workflow_version,
                          amount: data.get('amount'),
                          paidOn: data.get('paidOn'),
                          paymentReference: data.get('reference'),
                          reason: data.get('reason'),
                          idempotencyKey: makeKey(),
                        }),
                      );
                    }}
                  >
                    <h3 className="font-semibold sm:col-span-2">Record payment</h3>
                    <label>
                      Amount
                      <input
                        className={inputClass}
                        defaultValue={detail.data.net_amount}
                        name="amount"
                        pattern="\d+(\.\d{1,2})?"
                        required
                      />
                    </label>
                    <label>
                      Paid on
                      <input className={inputClass} name="paidOn" required type="date" />
                    </label>
                    <label>
                      Payment reference
                      <input className={inputClass} maxLength="200" name="reference" required />
                    </label>
                    <label>
                      Reason
                      <input className={inputClass} maxLength="500" name="reason" required />
                    </label>
                    <Button disabled={mutation.isPending} type="submit">
                      Record payment
                    </Button>
                  </form>
                )}
              {detail.data.payments.length ? (
                <div>
                  <h3 className="font-semibold">Payment</h3>
                  {detail.data.payments.map((payment) => (
                    <p className="text-sm" key={payment.id}>
                      {payment.amount} {detail.data.currency_code} · {payment.paid_on} ·{' '}
                      {payment.payment_reference}
                    </p>
                  ))}
                </div>
              ) : null}
              <div>
                <h3 className="font-semibold">History</h3>
                {detail.data.events.map((event) => (
                  <p className="text-sm" key={event.id}>
                    {event.from_state} → {event.to_state}: {event.reason}
                  </p>
                ))}
              </div>
              {mutation.error && <ErrorState error={mutation.error} />}
            </section>
          )}
        </div>
      </div>
      {pendingAction ? (
        <ActionDialog
          busy={mutation.isPending}
          confirmLabel={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={({ reason }) => {
            mutation.mutate(() =>
              transitionSettlement(selectedId, pendingAction, {
                workflowVersion: detail.data.workflow_version,
                reason,
                idempotencyKey: makeKey(),
              }),
            );
            setPendingAction(null);
          }}
          title={`Confirm ${pendingAction}`}
        />
      ) : null}
      {message && <p role={mutation.error ? 'alert' : 'status'}>{message}</p>}
    </div>
  );
}

function NotificationWorkspace({ companyId, auth, rows }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (operation) => operation(),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['operations', 'notifications'] });
      client.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      {has(auth, 'notification.create') && (
        <form
          className="grid gap-3 rounded border border-subtle p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate(() =>
              createNotification({
                companyId,
                userId: Number(data.get('userId')),
                type: data.get('type'),
                title: data.get('title'),
                message: data.get('message'),
                idempotencyKey: makeKey(),
              }),
            );
          }}
        >
          <label>
            Recipient user ID
            <input className={inputClass} min="1" name="userId" required type="number" />
          </label>
          <label>
            Type
            <input className={inputClass} name="type" required />
          </label>
          <label>
            Title
            <input className={inputClass} maxLength="200" name="title" required />
          </label>
          <label>
            Message
            <textarea className={inputClass} maxLength="1000" name="message" required />
          </label>
          <Button type="submit">Create notification</Button>
        </form>
      )}
      {rows.length ? (
        rows.map((row) => {
          const target = notificationTarget(row, auth);
          return (
            <div className="rounded border border-subtle p-3" key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>{row.title}</strong>
                <span className="text-sm text-secondary">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="mt-1">{row.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-secondary">
                <span>{readableCode(row.notification_type)}</span>
                {row.reference_type && (
                  <span>
                    {readableCode(row.reference_type)}
                    {row.reference_id ? ` #${row.reference_id}` : ''}
                  </span>
                )}
                <span>{row.status}</span>
              </div>
              {row.status === 'unread' && has(auth, 'notification.update_own') && (
                <button
                  className="mt-2 underline"
                  onClick={() => mutation.mutate(() => markNotificationRead(row.id))}
                  type="button"
                >
                  Mark read
                </button>
              )}
              {target && (
                <Link
                  className="ml-4 mt-2 inline-block font-medium text-accent"
                  onClick={async (event) => {
                    if (row.status !== 'unread' || !has(auth, 'notification.update_own')) return;
                    event.preventDefault();
                    try {
                      await mutation.mutateAsync(() => markNotificationRead(row.id));
                      navigate(target);
                    } catch {
                      // The shared mutation error is rendered below the notification list.
                    }
                  }}
                  to={target}
                >
                  Open record
                </Link>
              )}
            </div>
          );
        })
      ) : (
        <EmptyState />
      )}
      {mutation.error && <ErrorState error={mutation.error} />}
    </div>
  );
}

const initialAuditFilters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  actorId: '',
  action: '',
  module: '',
  outcome: '',
  resourceType: '',
  page: 1,
  pageSize: 25,
};

const readableCode = (value) =>
  value
    ? value
        .split(/[._]/)
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(' · ')
    : '—';

const formatAuditDate = (value) => (value ? new Date(value).toLocaleString() : '—');

function AuditWorkspace({ companyId }) {
  const [filters, setFilters] = useState(initialAuditFilters);
  const [selected, setSelected] = useState(null);
  const audit = useQuery({
    queryKey: ['security-audit', companyId, filters],
    queryFn: () => getAuditEvents(companyId, filters),
    placeholderData: (previousData) => previousData,
  });
  if (audit.isPending && !audit.data) return <LoadingState />;
  if (audit.error) return <ErrorState error={audit.error} />;
  const rows = audit.data.items ?? [];
  const pagination = audit.data.pagination ?? {
    page: 1,
    pageSize: 25,
    total: rows.length,
    totalPages: 1,
  };
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const clear = () => {
    setFilters(initialAuditFilters);
    setSelected(null);
  };
  const actor = (row, prefix = 'actor') =>
    row[`${prefix}_email`] ??
    (row[`${prefix}_user_id`] ? `User #${row[`${prefix}_user_id`]}` : 'System');
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Security &amp; Audit</h1>
        <p className="mt-1 text-sm text-secondary">
          Company-scoped, read-only operational and security activity.
        </p>
      </div>
      <div className="grid gap-3 rounded border border-subtle bg-surface p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">
          Search
          <input
            className={inputClass}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Actor, action, or resource"
            value={filters.search}
          />
        </label>
        <label className="text-sm">
          Actor user ID
          <input
            className={inputClass}
            min="1"
            onChange={(event) => update('actorId', event.target.value)}
            placeholder="Any actor"
            type="number"
            value={filters.actorId}
          />
        </label>
        <label className="text-sm">
          From date
          <input
            className={inputClass}
            onChange={(event) => update('dateFrom', event.target.value)}
            type="date"
            value={filters.dateFrom}
          />
        </label>
        <label className="text-sm">
          To date
          <input
            className={inputClass}
            onChange={(event) => update('dateTo', event.target.value)}
            type="date"
            value={filters.dateTo}
          />
        </label>
        <label className="text-sm">
          Module
          <input
            className={inputClass}
            onChange={(event) => update('module', event.target.value)}
            placeholder="e.g. employee"
            value={filters.module}
          />
        </label>
        <label className="text-sm">
          Exact action code
          <input
            className={inputClass}
            onChange={(event) => update('action', event.target.value)}
            placeholder="e.g. employee.link_user"
            value={filters.action}
          />
        </label>
        <label className="text-sm">
          Outcome
          <select
            className={inputClass}
            onChange={(event) => update('outcome', event.target.value)}
            value={filters.outcome}
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </label>
        <label className="text-sm">
          Resource type
          <input
            className={inputClass}
            onChange={(event) => update('resourceType', event.target.value)}
            placeholder="e.g. employee"
            value={filters.resourceType}
          />
        </label>
        <div className="flex items-end">
          <Button onClick={clear} type="button" variant="secondary">
            Clear filters
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-subtle bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-subtle bg-app text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Date / Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Resource</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-subtle last:border-0" key={row.id}>
                <td className="whitespace-nowrap px-4 py-3">{formatAuditDate(row.created_at)}</td>
                <td className="px-4 py-3">{actor(row)}</td>
                <td className="px-4 py-3">
                  <span className="font-medium">{readableCode(row.action_code)}</span>
                  <span className="mt-1 block font-mono text-xs text-secondary">
                    {row.action_code}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.record_type
                    ? `${readableCode(row.record_type)} #${row.record_id ?? '—'}`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${row.outcome === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}
                  >
                    {readableCode(row.outcome)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button onClick={() => setSelected(row)} type="button" variant="secondary">
                    Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <EmptyState message="No audit events match the selected filters." /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-secondary">
        <span>
          {pagination.total} event{pagination.total === 1 ? '' : 's'} · page {pagination.page} of{' '}
          {Math.max(1, pagination.totalPages)}
        </span>
        <div className="flex gap-2">
          <Button
            disabled={pagination.page <= 1}
            onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
            type="button"
            variant="secondary"
          >
            Previous
          </Button>
          <Button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
            type="button"
            variant="secondary"
          >
            Next
          </Button>
        </div>
      </div>
      {selected ? (
        <div
          aria-labelledby="audit-event-detail-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
          role="dialog"
        >
          <section
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded border border-subtle bg-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" id="audit-event-detail-title">
                  Audit event #{selected.id}
                </h2>
                <p className="mt-1 text-sm text-secondary">{readableCode(selected.action_code)}</p>
              </div>
              <Button onClick={() => setSelected(null)} type="button" variant="secondary">
                Close
              </Button>
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-secondary">Actor</dt>
                <dd>{actor(selected)}</dd>
              </div>
              <div>
                <dt className="text-secondary">Subject</dt>
                <dd>{actor(selected, 'subject')}</dd>
              </div>
              <div>
                <dt className="text-secondary">Action</dt>
                <dd className="font-mono">{selected.action_code}</dd>
              </div>
              <div>
                <dt className="text-secondary">Outcome</dt>
                <dd>{selected.outcome}</dd>
              </div>
              <div>
                <dt className="text-secondary">Resource</dt>
                <dd>
                  {selected.record_type
                    ? `${selected.record_type} #${selected.record_id ?? '—'}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-secondary">Permission</dt>
                <dd>{selected.permission_code ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-secondary">Reason</dt>
                <dd>{selected.reason ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-secondary">Occurred</dt>
                <dd>{formatAuditDate(selected.created_at)}</dd>
              </div>
              <div>
                <dt className="text-secondary">Company</dt>
                <dd>Company #{selected.company_id}</dd>
              </div>
              <div>
                <dt className="text-secondary">Scope</dt>
                <dd>{selected.scope_type ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-secondary">Correlation ID</dt>
                <dd className="break-all font-mono text-xs">{selected.correlation_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-secondary">Request ID</dt>
                <dd className="break-all font-mono text-xs">{selected.request_id ?? '—'}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function OperationsPage({ mode }) {
  const company = useOrganizationCompany();
  const auth = useAuth();
  const loaders = {
    reports: getWorkforceReport,
    notifications: getNotifications,
  };
  const result = useQuery({
    queryKey: ['operations', mode, company.company?.id],
    queryFn: () => loaders[mode]?.(company.company.id),
    enabled: Boolean(company.company && loaders[mode]),
    refetchInterval: mode === 'notifications' ? 30_000 : false,
  });
  if (company.isPending || (loaders[mode] && result.isPending)) return <LoadingState />;
  if (company.error || result.error) return <ErrorState error={company.error ?? result.error} />;
  if (mode === 'exits') return <ExitWorkspace auth={auth} companyId={company.company.id} />;
  if (mode === 'settlements')
    return <SettlementWorkspace auth={auth} companyId={company.company.id} />;
  if (mode === 'reports')
    return (
      <div>
        <h1 className="text-2xl font-semibold">Reports & Analytics</h1>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded border border-subtle p-4">
            <dt>Active employments</dt>
            <dd className="text-2xl font-semibold">{result.data.activeEmployments}</dd>
          </div>
          <div className="rounded border border-subtle p-4">
            <dt>Exit status groups</dt>
            <dd className="text-2xl font-semibold">{result.data.exits.length}</dd>
          </div>
          <div className="rounded border border-subtle p-4">
            <dt>Asset status groups</dt>
            <dd className="text-2xl font-semibold">{result.data.assets.length}</dd>
          </div>
        </dl>
      </div>
    );
  if (mode === 'notifications')
    return <NotificationWorkspace auth={auth} companyId={company.company.id} rows={result.data} />;
  if (mode === 'security') return <AuditWorkspace companyId={company.company.id} />;
  return null;
}
