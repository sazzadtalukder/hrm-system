import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createBenefitPlan, getBenefitPlans } from './api.js';

const field = 'w-full rounded-md border border-subtle p-2';
const pageSize = 20;
const employmentTypes = ['permanent', 'contract', 'probationary', 'temporary', 'intern'];
const employmentStatuses = ['probation', 'confirmed'];

export function BenefitPlansPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const plans = useQuery({
    queryKey: ['benefits', 'plans', company.company?.id, page, status, asOfDate],
    queryFn: () =>
      getBenefitPlans(company.company.id, {
        page,
        pageSize,
        status: status || undefined,
        asOfDate: asOfDate || undefined,
      }),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: createBenefitPlan,
    onSuccess: () => {
      setMessage('Benefit plan created.');
      client.invalidateQueries({ queryKey: ['benefits', 'plans'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || plans.isPending) return <LoadingState />;
  if (company.error || plans.error) return <ErrorState error={company.error ?? plans.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Benefit plans</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            className={field}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <input
            className={field}
            onChange={(event) => {
              setPage(1);
              setAsOfDate(event.target.value);
            }}
            type="date"
            value={asOfDate}
          />
        </div>
        {plans.data.length === 0 ? (
          <EmptyState message="No benefit plans found." />
        ) : (
          <ul className="mt-4 divide-y">
            {plans.data.map((plan) => (
              <li className="py-3" key={plan.id}>
                <Link className="text-accent" to={`/benefits/plans/${plan.id}`}>
                  {plan.name} ({plan.code})
                </Link>{' '}
                · {plan.record_status}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between">
          <Button
            disabled={page === 1}
            variant="secondary"
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-secondary">Page {page}</span>
          <Button
            disabled={plans.data.length < pageSize}
            variant="secondary"
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </section>
      {permissions.includes('benefit_plan.create') && (
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
              effectiveStart: data.get('start'),
              effectiveEnd: data.get('end') || null,
              employerContributionAmount: data.get('employer'),
              employeeContributionAmount: data.get('employee'),
              currencyCode: company.company.currency_code,
              eligibleEmploymentTypes: data.getAll('employmentTypes'),
              eligibleEmploymentStatuses: data.getAll('employmentStatuses'),
              employeeVisible: data.get('employeeVisible') === 'on',
              sensitiveClassification: data.get('sensitive'),
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="font-semibold">Create plan</h2>
          <input className={field} name="code" placeholder="PLAN-CODE" required />
          <input className={field} name="name" placeholder="Plan name" required />
          <textarea className={field} name="description" placeholder="Description (optional)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Effective start
              <input className={field} name="start" required type="date" />
            </label>
            <label className="text-sm">
              Effective end (optional)
              <input className={field} name="end" type="date" />
            </label>
          </div>
          <input className={field} name="employer" placeholder="Employer monthly amount" required />
          <input className={field} name="employee" placeholder="Employee monthly amount" required />
          <select className={field} name="sensitive">
            <option value="standard">Standard</option>
            <option value="sensitive">Sensitive</option>
          </select>
          <fieldset className="rounded-md border border-subtle p-3">
            <legend className="px-1 text-sm font-medium">Eligible employment types</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {employmentTypes.map((value) => (
                <label className="flex items-center gap-2" key={value}>
                  <input defaultChecked name="employmentTypes" type="checkbox" value={value} />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-md border border-subtle p-3">
            <legend className="px-1 text-sm font-medium">Eligible employment statuses</legend>
            <div className="mt-2 flex gap-4 text-sm">
              {employmentStatuses.map((value) => (
                <label className="flex items-center gap-2" key={value}>
                  <input defaultChecked name="employmentStatuses" type="checkbox" value={value} />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input defaultChecked name="employeeVisible" type="checkbox" />
            Show eligible enrollments in Employee Self-Service
          </label>
          <input className={field} name="reason" placeholder="Required reason" required />
          <Button disabled={create.isPending} type="submit">
            Create plan
          </Button>
          {create.error && <ErrorState error={create.error} />}
        </form>
      )}
      {message && (
        <p className="lg:col-span-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
