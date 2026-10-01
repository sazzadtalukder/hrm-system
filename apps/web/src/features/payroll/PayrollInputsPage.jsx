import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  addCompensation,
  addOneTimeInput,
  addRecurringInput,
  getPayrollComponents,
  getPayrollPeriods,
} from './api.js';

const fieldClass = 'w-full rounded-md border border-subtle px-3 py-2';

function EmploymentAmountReasonFields() {
  return (
    <>
      <input
        className={fieldClass}
        name="employmentId"
        placeholder="Employment ID"
        required
        type="number"
      />
      <input
        className={fieldClass}
        name="amount"
        pattern="\d+(\.\d{1,2})?"
        placeholder="0.00"
        required
      />
      <input className={fieldClass} name="reason" placeholder="Required reason" required />
    </>
  );
}

function ComponentSelect({ components }) {
  return (
    <select className={fieldClass} name="componentId">
      {components.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}

export function PayrollInputsPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const [message, setMessage] = useState('');
  const periods = useQuery({
    queryKey: ['payroll', 'periods', company.company?.id],
    queryFn: () => getPayrollPeriods(company.company.id),
    enabled: Boolean(company.company),
  });
  const components = useQuery({
    queryKey: ['payroll', 'components', company.company?.id],
    queryFn: () => getPayrollComponents(company.company.id),
    enabled: Boolean(company.company),
  });
  const mutation = useMutation({
    mutationFn: ({ kind, employmentId, body }) =>
      kind === 'compensation'
        ? addCompensation(employmentId, body)
        : kind === 'recurring'
          ? addRecurringInput(employmentId, body)
          : addOneTimeInput(body),
    onSuccess: () => setMessage('Payroll input saved.'),
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || periods.isPending || components.isPending) return <LoadingState />;
  if (company.error || periods.error || components.error)
    return <ErrorState error={company.error ?? periods.error ?? components.error} />;

  const submit = (kind) => (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const employmentId = Number(data.get('employmentId'));
    const common = {
      companyId: company.company.id,
      amount: data.get('amount'),
      reason: data.get('reason'),
    };
    const body =
      kind === 'compensation'
        ? {
            ...common,
            effectiveStart: data.get('effectiveStart'),
            monthlyBaseAmount: common.amount,
            currencyCode: company.company.currency_code,
          }
        : kind === 'recurring'
          ? {
              ...common,
              payrollComponentId: Number(data.get('componentId')),
              effectiveStart: data.get('effectiveStart'),
            }
          : {
              ...common,
              payrollPeriodId: Number(data.get('periodId')),
              employmentId,
              payrollComponentId: Number(data.get('componentId')),
              idempotencyKey: crypto.randomUUID(),
            };
    mutation.mutate({ kind, employmentId, body });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {permissions.includes('employee_compensation.update') && (
        <form
          className="space-y-3 rounded-lg border border-subtle bg-surface p-5"
          onSubmit={submit('compensation')}
        >
          <h2 className="font-semibold">Monthly base salary</h2>
          <EmploymentAmountReasonFields />
          <input className={fieldClass} name="effectiveStart" required type="date" />
          <Button type="submit">Save salary</Button>
        </form>
      )}
      {permissions.includes('payroll_input.create') && (
        <>
          <form
            className="space-y-3 rounded-lg border border-subtle bg-surface p-5"
            onSubmit={submit('recurring')}
          >
            <h2 className="font-semibold">Recurring fixed input</h2>
            <EmploymentAmountReasonFields />
            <ComponentSelect components={components.data} />
            <input className={fieldClass} name="effectiveStart" required type="date" />
            <Button type="submit">Save recurring input</Button>
          </form>
          <form
            className="space-y-3 rounded-lg border border-subtle bg-surface p-5"
            onSubmit={submit('oneTime')}
          >
            <h2 className="font-semibold">One-time fixed input</h2>
            <EmploymentAmountReasonFields />
            <ComponentSelect components={components.data} />
            <select className={fieldClass} name="periodId">
              {periods.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                </option>
              ))}
            </select>
            <Button type="submit">Save one-time input</Button>
          </form>
        </>
      )}
      {message && (
        <p className="lg:col-span-3" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
