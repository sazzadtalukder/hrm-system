import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  createPayrollComponent,
  createPayrollPeriod,
  getPayrollComponents,
  getPayrollPeriods,
} from './api.js';

export function PayrollSetupPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
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
  const periodMutation = useMutation({
    mutationFn: createPayrollPeriod,
    onSuccess: () => {
      setMessage('Payroll period created.');
      client.invalidateQueries({ queryKey: ['payroll', 'periods'] });
    },
    onError: (e) => setMessage(e.message),
  });
  const componentMutation = useMutation({
    mutationFn: createPayrollComponent,
    onSuccess: () => {
      setMessage('Payroll component created.');
      client.invalidateQueries({ queryKey: ['payroll', 'components'] });
    },
    onError: (e) => setMessage(e.message),
  });
  if (company.isPending || periods.isPending || components.isPending) return <LoadingState />;
  if (company.error || periods.error || components.error)
    return <ErrorState error={company.error ?? periods.error ?? components.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Payroll periods</h2>
        <ul className="my-4 space-y-2">
          {periods.data.map((p) => (
            <li key={p.id}>
              {p.code}: {String(p.period_start).slice(0, 10)} – {String(p.period_end).slice(0, 10)}
            </li>
          ))}
        </ul>
        {permissions.includes('payroll_period.create') && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              periodMutation.mutate({
                companyId: company.company.id,
                code: data.get('code'),
                name: data.get('name'),
                periodStart: data.get('start'),
                periodEnd: data.get('end'),
                paymentDate: data.get('payment'),
              });
            }}
          >
            <input
              className="w-full rounded-md border p-2"
              name="code"
              placeholder="2026-08"
              required
            />
            <input
              className="w-full rounded-md border p-2"
              name="name"
              placeholder="August 2026"
              required
            />
            <input className="w-full rounded-md border p-2" name="start" required type="date" />
            <input className="w-full rounded-md border p-2" name="end" required type="date" />
            <input className="w-full rounded-md border p-2" name="payment" required type="date" />
            <Button type="submit">Create period</Button>
          </form>
        )}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Fixed components</h2>
        <ul className="my-4 space-y-2">
          {components.data.map((c) => (
            <li key={c.id}>
              {c.name} ({c.component_type})
            </li>
          ))}
        </ul>
        {permissions.includes('payroll_component.create') && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              componentMutation.mutate({
                companyId: company.company.id,
                code: data.get('code'),
                name: data.get('name'),
                componentType: data.get('type'),
                effectiveStart: data.get('start'),
                showOnPayslip: true,
                displayOrder: 0,
              });
            }}
          >
            <input
              className="w-full rounded-md border p-2"
              name="code"
              placeholder="ALLOWANCE"
              required
            />
            <input
              className="w-full rounded-md border p-2"
              name="name"
              placeholder="Allowance"
              required
            />
            <select className="w-full rounded-md border p-2" name="type">
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </select>
            <input className="w-full rounded-md border p-2" name="start" required type="date" />
            <Button type="submit">Create component</Button>
          </form>
        )}
      </section>
      {message && (
        <p className="lg:col-span-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
