import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getOrganizationRecords } from '../organization/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getPerformanceConfig } from '../performance/api.js';
import { createCriticalPosition, getCriticalPositions } from './api.js';
export function CriticalPositionsPage() {
  const c = useOrganizationCompany(),
    { permissions } = useAuth(),
    client = useQueryClient(),
    q = useQuery({
      queryKey: ['critical-positions', c.company?.id],
      queryFn: () => getCriticalPositions(c.company.id),
      enabled: Boolean(c.company),
    }),
    designations = useQuery({
      queryKey: ['critical-position-designations', c.company?.id],
      queryFn: () => getOrganizationRecords('designations', c.company.id),
      enabled: Boolean(c.company && permissions.includes('critical_position.create')),
    }),
    competencies = useQuery({
      queryKey: ['critical-position-competencies', c.company?.id],
      queryFn: () => getPerformanceConfig('competencies', c.company.id),
      enabled: Boolean(c.company && permissions.includes('critical_position.create')),
    }),
    m = useMutation({
      mutationFn: createCriticalPosition,
      onSuccess: () => client.invalidateQueries({ queryKey: ['critical-positions'] }),
    });
  if (
    c.isPending ||
    q.isPending ||
    (permissions.includes('critical_position.create') &&
      (designations.isPending || competencies.isPending))
  )
    return <LoadingState />;
  if (c.error || q.error || designations.error || competencies.error)
    return <ErrorState error={c.error ?? q.error ?? designations.error ?? competencies.error} />;
  return (
    <div>
      <h2 className="text-xl font-semibold">Critical positions</h2>
      {permissions.includes('critical_position.create') && (
        <form
          className="my-4 grid max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            m.mutate({
              companyId: c.company.id,
              code: d.get('code'),
              name: d.get('name'),
              designationId: Number(d.get('designationId')),
              branchId: null,
              departmentId: null,
              criticality: d.get('criticality'),
              description: d.get('description'),
              effectiveStart: d.get('effectiveStart'),
              competencies: d.getAll('competencyVersionIds').map((id) => ({
                performanceCompetencyVersionId: Number(id),
                requiredProficiency: null,
              })),
              reason: d.get('reason'),
              idempotencyKey: crypto.randomUUID(),
            });
          }}
        >
          <input name="code" placeholder="Code" required />
          <input name="name" placeholder="Name" required />
          <select name="designationId" required>
            <option value="">Select designation</option>
            {designations.data.items.map((designation) => (
              <option key={designation.id} value={designation.id}>
                {designation.code} · {designation.name}
              </option>
            ))}
          </select>
          <select name="criticality">
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <textarea name="description" placeholder="Description" required />
          <label>
            Competencies
            <select className="min-h-24 w-full" multiple name="competencyVersionIds">
              {competencies.data.map((competency) => (
                <option key={competency.version_id} value={competency.version_id}>
                  {competency.code} · {competency.name}
                </option>
              ))}
            </select>
          </label>
          <input name="effectiveStart" type="date" required />
          <input name="reason" placeholder="Reason" required />
          <Button type="submit">Create critical position</Button>
        </form>
      )}
      {!q.data.length ? (
        <p>No critical positions found.</p>
      ) : (
        q.data.map((i) => (
          <Link className="block border-b py-3" key={i.id} to={`${i.id}`}>
            {i.code} · {i.name}
          </Link>
        ))
      )}
    </div>
  );
}
