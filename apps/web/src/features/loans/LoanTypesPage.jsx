import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createLoanType, getLoanTypes } from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function LoanTypesPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const q = useQuery({
    queryKey: ['loan-types', company.company?.id],
    queryFn: () => getLoanTypes(company.company.id),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: createLoanType,
    onSuccess: () => {
      setMessage('Facility type created.');
      client.invalidateQueries({ queryKey: ['loan-types'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || q.isPending) return <LoadingState />;
  if (company.error || q.error) return <ErrorState error={company.error ?? q.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Facility types</h2>
        <ul className="mt-3 divide-y">
          {q.data.map((type) => (
            <li className="py-3" key={type.id}>
              <Link className="font-medium text-accent" to={`/loans/types/${type.id}`}>
                {type.name} ({type.code})
              </Link>
              <p className="text-sm text-secondary">
                {type.facility_kind.replaceAll('_', ' ')} · {type.minimum_principal}–
                {type.maximum_principal} {type.currency_code} · {type.minimum_term_months}–
                {type.maximum_term_months} months · {type.record_status}
              </p>
            </li>
          ))}
          {!q.data.length && <li className="py-3 text-secondary">No facility types found.</li>}
        </ul>
      </section>
      {permissions.includes('loan_type.create') && (
        <form
          className="space-y-3 rounded-lg border border-subtle bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            create.mutate({
              companyId: company.company.id,
              code: data.get('code'),
              name: data.get('name'),
              description: data.get('description') || null,
              facilityKind: data.get('kind'),
              effectiveStart: data.get('start'),
              effectiveEnd: data.get('end') || null,
              currencyCode: company.company.currency_code,
              minimumPrincipal: data.get('minimum'),
              maximumPrincipal: data.get('maximum'),
              minimumTermMonths: Number(data.get('minTerm')),
              maximumTermMonths: Number(data.get('maxTerm')),
              installmentDueDay: Number(data.get('dueDay')),
              minimumServiceDays: data.get('service') ? Number(data.get('service')) : null,
              maximumActiveFacilities: Number(data.get('active')),
              sensitiveClassification: data.get('sensitive'),
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="font-semibold">Create facility type</h2>
          <input className={field} name="code" placeholder="TYPE-CODE" required />
          <input className={field} name="name" placeholder="Name" required />
          <textarea className={field} name="description" placeholder="Description (optional)" />
          <select className={field} name="kind">
            <option value="loan">Loan</option>
            <option value="salary_advance">Salary advance</option>
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={field} name="start" type="date" required />
            <input className={field} name="end" type="date" />
            <input className={field} name="minimum" placeholder="Minimum principal" required />
            <input className={field} name="maximum" placeholder="Maximum principal" required />
            <input
              className={field}
              name="minTerm"
              type="number"
              min="1"
              placeholder="Minimum months"
              required
            />
            <input
              className={field}
              name="maxTerm"
              type="number"
              min="1"
              placeholder="Maximum months"
              required
            />
            <input
              className={field}
              name="dueDay"
              type="number"
              min="1"
              max="31"
              placeholder="Due day"
              required
            />
            <input
              className={field}
              name="service"
              type="number"
              min="0"
              placeholder="Minimum service days (optional)"
            />
            <input
              className={field}
              name="active"
              type="number"
              min="1"
              placeholder="Maximum active facilities"
              required
            />
            <select className={field} name="sensitive">
              <option value="sensitive">Sensitive</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <input className={field} name="reason" placeholder="Required reason" required />
          <Button disabled={create.isPending} type="submit">
            Create type
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
