import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  createBenefitEnrollment,
  createHistoricalBenefitEnrollment,
  getBenefitPlans,
} from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function BenefitEnrollmentCreatePage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const plans = useQuery({
    queryKey: ['benefits', 'plans', company.company?.id],
    queryFn: () => getBenefitPlans(company.company.id),
    enabled: Boolean(company.company),
  });
  const employees = useQuery({
    queryKey: ['employees', company.company?.id, 'benefit-selector'],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: ({ historical, body }) =>
      historical ? createHistoricalBenefitEnrollment(body) : createBenefitEnrollment(body),
    onSuccess: (data) => navigate(`/benefits/enrollments/${data.id}`),
  });
  if (company.isPending || plans.isPending || employees.isPending) return <LoadingState />;
  if (company.error || plans.error || employees.error)
    return <ErrorState error={company.error ?? plans.error ?? employees.error} />;
  const activePlans = plans.data.filter((plan) => plan.record_status === 'active');
  const eligibleEmployees = employees.data.items.filter((item) => item.employment);
  if (!eligibleEmployees.length || !activePlans.length)
    return (
      <EmptyState message="An eligible employee and an active benefit plan are required before creating an enrollment." />
    );
  return (
    <form
      className="max-w-xl space-y-4 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        create.mutate({
          historical: data.get('historical') === 'on',
          body: {
            companyId: company.company.id,
            employmentId: Number(data.get('employmentId')),
            benefitPlanId: Number(data.get('planId')),
            effectiveStart: data.get('start'),
            effectiveEnd: data.get('end') || null,
            reason: data.get('reason'),
          },
        });
      }}
    >
      <h2 className="font-semibold">New benefit enrollment</h2>
      <select className={field} name="employmentId" required>
        {eligibleEmployees.map((item) => (
          <option key={item.employment.id} value={item.employment.id}>
            {item.displayName} ({item.employment.employeeCode})
          </option>
        ))}
      </select>
      <select className={field} name="planId" required>
        {activePlans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
          </option>
        ))}
      </select>
      <input className={field} name="start" required type="date" />
      <input className={field} name="end" type="date" />
      <input className={field} name="reason" placeholder="Required reason" required />
      {permissions.includes('benefit_enrollment.create_historical') && (
        <label className="flex items-center gap-2 text-sm">
          <input name="historical" type="checkbox" />
          Create authorized historical enrollment
        </label>
      )}
      <Button disabled={create.isPending} type="submit">
        Create draft
      </Button>
      {create.error && <ErrorState error={create.error} />}
    </form>
  );
}
