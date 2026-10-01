import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getMyPayslips } from './api.js';
export function PayslipsPage() {
  const query = useQuery({ queryKey: ['payroll', 'my-payslips'], queryFn: getMyPayslips });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data.length) return <EmptyState message="No published payslips found." />;
  return (
    <div className="rounded-lg border border-subtle bg-surface p-6">
      <h2 className="font-semibold">Published payslips</h2>
      <ul className="mt-4 divide-y">
        {query.data.map((p) => (
          <li className="py-3" key={p.id}>
            {p.period_code}: gross {p.gross_earnings}, deductions {p.total_deductions}, net{' '}
            <strong>
              {p.net_pay} {p.currency_code}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
