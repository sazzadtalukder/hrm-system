import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getOrganizationRecords } from '../organization/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getPerformanceConfig } from '../performance/api.js';
import { createCareerPath, getCareerPaths } from './api.js';
export function CareerPathsPage() {
  const c = useOrganizationCompany(),
    { permissions } = useAuth(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ['career-paths', c.company?.id],
    queryFn: () => getCareerPaths(c.company.id),
    enabled: Boolean(c.company),
  });
  const designations = useQuery({
    queryKey: ['career-path-designations', c.company?.id],
    queryFn: () => getOrganizationRecords('designations', c.company.id),
    enabled: Boolean(c.company && permissions.includes('career_path.create')),
  });
  const competencies = useQuery({
    queryKey: ['career-path-competencies', c.company?.id],
    queryFn: () => getPerformanceConfig('competencies', c.company.id),
    enabled: Boolean(c.company && permissions.includes('career_path.create')),
  });
  const mutation = useMutation({
    mutationFn: createCareerPath,
    onSuccess: () => client.invalidateQueries({ queryKey: ['career-paths'] }),
  });
  if (
    c.isPending ||
    query.isPending ||
    (permissions.includes('career_path.create') &&
      (designations.isPending || competencies.isPending))
  )
    return <LoadingState />;
  if (c.error || query.error || designations.error || competencies.error)
    return (
      <ErrorState error={c.error ?? query.error ?? designations.error ?? competencies.error} />
    );
  return (
    <div>
      <h2 className="text-xl font-semibold">Career paths</h2>
      {permissions.includes('career_path.create') && (
        <form
          className="my-4 grid max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            mutation.mutate({
              companyId: c.company.id,
              code: d.get('code'),
              name: d.get('name'),
              effectiveStart: d.get('effectiveStart'),
              description: d.get('description'),
              steps: [
                {
                  designationId: Number(d.get('designationId')),
                  minimumTimeMonths: 0,
                  competencies: d.getAll('competencyVersionIds').map((id) => ({
                    performanceCompetencyVersionId: Number(id),
                    requiredProficiency: null,
                  })),
                },
              ],
              reason: d.get('reason'),
              idempotencyKey: crypto.randomUUID(),
            });
          }}
        >
          <input name="code" placeholder="Code" required />
          <input name="name" placeholder="Name" required />
          <input name="effectiveStart" type="date" required />
          <textarea name="description" placeholder="Description" required />
          <select name="designationId" required>
            <option value="">Select designation</option>
            {designations.data.items.map((designation) => (
              <option key={designation.id} value={designation.id}>
                {designation.code} · {designation.name}
              </option>
            ))}
          </select>
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
          <input name="reason" placeholder="Reason" required />
          <Button type="submit">Create career path</Button>
        </form>
      )}
      {!query.data.length ? (
        <p>No career paths found.</p>
      ) : (
        query.data.map((i) => (
          <Link className="block border-b py-3" key={i.id} to={`${i.id}`}>
            {i.code} · {i.name}
          </Link>
        ))
      )}
    </div>
  );
}
