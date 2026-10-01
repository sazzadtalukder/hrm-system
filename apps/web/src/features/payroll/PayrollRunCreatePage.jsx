import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createPayrollRun, getPayrollPeriods } from './api.js';

export function PayrollRunCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const [error, setError] = useState();
  const periods = useQuery({
    queryKey: ['payroll', 'periods', company.company?.id],
    queryFn: () => getPayrollPeriods(company.company.id),
    enabled: Boolean(company.company),
  });
  const mutation = useMutation({
    mutationFn: createPayrollRun,
    onSuccess: (data) => navigate(`/payroll/runs/${data.id}`),
    onError: setError,
  });
  if (company.isPending || periods.isPending) return <LoadingState />;
  if (company.error || periods.error) return <ErrorState error={company.error ?? periods.error} />;
  return (
    <form
      className="max-w-xl space-y-4 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const ids = String(data.get('employmentIds'))
          .split(',')
          .map((x) => Number(x.trim()))
          .filter(Number.isInteger);
        mutation.mutate({
          companyId: company.company.id,
          payrollPeriodId: Number(data.get('period')),
          code: data.get('code'),
          employmentIds: ids,
        });
      }}
    >
      <h2 className="text-lg font-semibold">Create regular payroll run</h2>
      <p className="text-sm text-secondary">Explicit population only; maximum 500 employments.</p>
      <select className="w-full rounded-md border p-2" name="period" required>
        {periods.data.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code}
          </option>
        ))}
      </select>
      <input
        className="w-full rounded-md border p-2"
        name="code"
        placeholder="PAY-2026-08"
        required
      />
      <input
        className="w-full rounded-md border p-2"
        name="employmentIds"
        placeholder="1, 2, 3"
        required
      />
      <Button type="submit">Create run</Button>
      {error && <ErrorState error={error} />}
    </form>
  );
}
