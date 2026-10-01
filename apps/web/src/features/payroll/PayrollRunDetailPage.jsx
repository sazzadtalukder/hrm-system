import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getPayrollRun, payrollAction } from './api.js';

export function PayrollRunDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const run = useQuery({ queryKey: ['payroll', 'run', id], queryFn: () => getPayrollRun(id) });
  const action = useMutation({
    mutationFn: ({ name, body }) => payrollAction(id, name, body),
    onSuccess: (data) => {
      setMessage(`Payroll is ${data.status ?? 'updated'}.`);
      client.invalidateQueries({ queryKey: ['payroll', 'run', id] });
    },
    onError: (e) => setMessage(e.message),
  });
  if (run.isPending) return <LoadingState />;
  if (run.error) return <ErrorState error={run.error} />;
  const value = run.data;
  const execute = (name, decision = false) =>
    action.mutate({
      name,
      body: {
        workflowVersion: value.workflow_version,
        reason,
        ...(decision
          ? { idempotencyKey: crypto.randomUUID() }
          : name === 'process'
            ? { idempotencyKey: crypto.randomUUID() }
            : {}),
      },
    });
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{value.code}</h2>
            <p className="text-secondary">{value.period_code}</p>
          </div>
          <StatusBadge status={value.status} />
        </div>
        <p className="mt-3">
          Calculation: {value.calculation_status} · Workflow version {value.workflow_version}
        </p>
        <label className="mt-4 block text-sm">
          Required action reason
          <input
            className="mt-1 w-full rounded-md border p-2"
            onChange={(e) => setReason(e.target.value)}
            value={reason}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {auth.permissions.includes('payroll.process') &&
            ['draft', 'processed'].includes(value.status) && (
              <Button disabled={!reason} onClick={() => execute('process')}>
                Process
              </Button>
            )}
          {auth.permissions.includes('payroll.submit') && value.status === 'processed' && (
            <Button disabled={!reason} onClick={() => execute('submit')}>
              Submit
            </Button>
          )}
          {auth.permissions.includes('payroll.approve') && value.status === 'submitted' && (
            <Button disabled={!reason} onClick={() => execute('approve', true)}>
              Approve
            </Button>
          )}
          {auth.permissions.includes('payroll.reject') && value.status === 'submitted' && (
            <Button disabled={!reason} onClick={() => execute('reject', true)}>
              Reject
            </Button>
          )}
          {auth.permissions.includes('payroll.lock') && value.status === 'approved' && (
            <Button disabled={!reason} onClick={() => execute('lock')}>
              Lock
            </Button>
          )}
          {auth.permissions.includes('payslip.publish') && value.status === 'locked' && (
            <Button disabled={!reason} onClick={() => execute('publish-payslips')}>
              Publish payslips
            </Button>
          )}
        </div>
        {message && (
          <p className="mt-3" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="overflow-x-auto rounded-lg border border-subtle bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Employee</th>
              <th className="p-3">Calculation</th>
              <th className="p-3">Net pay</th>
            </tr>
          </thead>
          <tbody>
            {value.employees.map((member) => {
              const result = value.results.find(
                (r) => Number(r.payroll_run_employee_id) === Number(member.id),
              );
              return (
                <tr className="border-t" key={member.id}>
                  <td className="p-3">
                    {member.employee_name_snapshot} ({member.employee_code_snapshot})
                  </td>
                  <td className="p-3">
                    {member.calculation_status}
                    {member.failure_message ? `: ${member.failure_message}` : ''}
                  </td>
                  <td className="p-3">
                    {result ? (
                      <Link className="text-accent" to={`/payroll/results/${result.id}`}>
                        {result.net_pay} {result.currency_code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
