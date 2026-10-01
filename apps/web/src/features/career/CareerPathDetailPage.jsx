import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { careerPathStatus, getCareerPath, getCareerPathHistory, versionCareerPath } from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function CareerPathDetailPage() {
  const { id } = useParams(),
    { permissions } = useAuth(),
    client = useQueryClient();
  const path = useQuery({ queryKey: ['career-path', id], queryFn: () => getCareerPath(id) });
  const history = useQuery({
    queryKey: ['career-path-history', id],
    queryFn: () => getCareerPathHistory(id),
  });
  const mutation = useMutation({
    mutationFn: ({ action, body }) =>
      action === 'version' ? versionCareerPath(id, body) : careerPathStatus(id, action, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['career-path'] }),
  });
  if (path.isPending || history.isPending) return <LoadingState />;
  if (path.error || history.error) return <ErrorState error={path.error ?? history.error} />;
  const p = path.data;
  const stepsById = new Map();
  for (const step of p.steps) {
    if (!stepsById.has(step.id))
      stepsById.set(step.id, {
        designationId: step.designation_id,
        minimumTimeMonths: step.minimum_time_months,
        competencies: [],
      });
    if (step.performance_competency_version_id)
      stepsById.get(step.id).competencies.push({
        performanceCompetencyVersionId: step.performance_competency_version_id,
        requiredProficiency: step.required_proficiency,
      });
  }
  const currentSteps = [...stepsById.values()];
  const statusPermission = `career_path.${p.record_status === 'active' ? 'deactivate' : 'activate'}`;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="text-xl font-semibold">
          {p.code} · {p.name}
        </h2>
        <p>{p.description}</p>
        <p>Status: {p.record_status}</p>
        {permissions.includes(statusPermission) && (
          <Button
            type="button"
            onClick={() =>
              mutation.mutate({
                action: p.record_status === 'active' ? 'deactivate' : 'activate',
                body: {
                  version: p.version,
                  reason: 'Authorized lifecycle change',
                  idempotencyKey: crypto.randomUUID(),
                },
              })
            }
          >
            {p.record_status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </section>
      {permissions.includes('career_path.version_create') && (
        <form
          className="grid gap-2 rounded-lg border border-subtle p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            mutation.mutate({
              action: 'version',
              body: {
                version: p.version,
                name: d.get('name'),
                effectiveStart: d.get('effectiveStart'),
                description: d.get('description'),
                steps: currentSteps,
                reason: d.get('reason'),
                idempotencyKey: crypto.randomUUID(),
              },
            });
          }}
        >
          <h3 className="font-semibold">Create version</h3>
          <input className={field} name="name" defaultValue={p.name} required />
          <input className={field} name="effectiveStart" type="date" required />
          <textarea className={field} name="description" defaultValue={p.description} required />
          <p className="text-sm text-secondary">
            The current {currentSteps.length} path step(s) and competency mappings will be preserved
            in the new immutable version.
          </p>
          <input className={field} name="reason" placeholder="Reason" required />
          <Button type="submit">Create version</Button>
        </form>
      )}
      <section>
        <h3 className="font-semibold">Version history</h3>
        {history.data.map((v) => (
          <p className="border-b py-2" key={v.id}>
            Version {v.version_number} · {String(v.effective_start).slice(0, 10)} ·{' '}
            {v.history_status}
          </p>
        ))}
      </section>
    </div>
  );
}
