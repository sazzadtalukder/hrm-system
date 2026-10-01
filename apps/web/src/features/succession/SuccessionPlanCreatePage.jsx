import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createSuccessionPlan, getCriticalPositions } from './api.js';
export function SuccessionPlanCreatePage() {
  const c = useOrganizationCompany(),
    nav = useNavigate(),
    positions = useQuery({
      queryKey: ['critical-positions', c.company?.id],
      queryFn: () => getCriticalPositions(c.company.id),
      enabled: Boolean(c.company),
    }),
    employees = useQuery({
      queryKey: ['succession-plan-employees', c.company?.id],
      queryFn: () => getEmployees(c.company.id, { pageSize: 100 }),
      enabled: Boolean(c.company),
    }),
    m = useMutation({ mutationFn: createSuccessionPlan, onSuccess: (x) => nav(`../${x.id}`) });
  if (c.isPending || positions.isPending || employees.isPending) return <LoadingState />;
  if (c.error || positions.error || employees.error)
    return <ErrorState error={c.error ?? positions.error ?? employees.error} />;
  return (
    <form
      className="grid max-w-2xl gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        m.mutate({
          companyId: c.company.id,
          criticalPositionVersionId: Number(d.get('positionVersionId')),
          anchorDate: d.get('anchorDate'),
          planningHorizonDate: d.get('horizonDate'),
          incumbentEmploymentId: d.get('incumbent') ? Number(d.get('incumbent')) : null,
          riskRationale: d.get('risk') || null,
          reason: d.get('reason'),
          idempotencyKey: crypto.randomUUID(),
        });
      }}
    >
      <h2 className="text-xl font-semibold">Create succession plan</h2>
      <select name="positionVersionId" required>
        <option value="">Select critical position</option>
        {positions.data
          .filter((position) => position.record_status === 'active')
          .map((position) => (
            <option key={position.id} value={position.current_version_id}>
              {position.code} · {position.name}
            </option>
          ))}
      </select>
      <input name="anchorDate" type="date" required />
      <input name="horizonDate" type="date" required />
      <select name="incumbent">
        <option value="">No incumbent</option>
        {employees.data.items
          .filter((employee) => employee.employment)
          .map((employee) => (
            <option key={employee.employment.id} value={employee.employment.id}>
              {employee.displayName} · {employee.employment.employeeCode} · Employment #
              {employee.employment.id}
            </option>
          ))}
      </select>
      <textarea name="risk" placeholder="Risk rationale" />
      <input name="reason" placeholder="Reason" required />
      <Button type="submit">Create plan</Button>
      {m.error && <p role="alert">{m.error.message}</p>}
    </form>
  );
}
