import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getPayrollResult } from './api.js';
export function PayrollResultPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['payroll', 'result', id],
    queryFn: () => getPayrollResult(id),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const r = query.data;
  return (
    <div className="rounded-lg border border-subtle bg-surface p-6">
      <h2 className="text-lg font-semibold">
        {r.employee_name_snapshot} · {r.period_code}
      </h2>
      <p className="mt-2">
        Gross {r.gross_earnings} · Deductions {r.total_deductions} · Net{' '}
        <strong>
          {r.net_pay} {r.currency_code}
        </strong>
      </p>
      <table className="mt-5 w-full text-left text-sm">
        <thead>
          <tr>
            <th>Component</th>
            <th>Type</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((item) => (
            <tr className="border-t" key={item.id}>
              <td className="py-2">{item.component_name_snapshot}</td>
              <td>{item.component_type}</td>
              <td>{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
