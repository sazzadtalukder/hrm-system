import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createPerformanceConfig, getPerformanceConfig } from './api.js';

const field = 'mt-1 w-full rounded-md border border-subtle bg-surface p-2';

function RatingScaleForm({ companyId, pending, submit }) {
  const [count, setCount] = useState(5);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        submit({
          kind: 'rating-scales',
          body: {
            companyId,
            code: data.get('code'),
            name: data.get('name'),
            description: data.get('description') || null,
            levels: Array.from({ length: count }, (_, index) => ({
              value: index + 1,
              code: data.get(`levelCode${index + 1}`),
              label: data.get(`levelLabel${index + 1}`),
              description: null,
            })),
            reason: data.get('reason'),
          },
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Code
          <input className={field} name="code" required />
        </label>
        <label>
          Name
          <input className={field} name="name" required />
        </label>
        <label>
          Description
          <input className={field} name="description" />
        </label>
        <label>
          Number of levels
          <select
            className={field}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          >
            {[3, 4, 5, 6, 7].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: count }, (_, index) => (
          <div className="rounded border border-subtle p-3" key={index}>
            <p className="text-sm font-medium">Level {index + 1}</p>
            <input
              className={field}
              defaultValue={`R${index + 1}`}
              name={`levelCode${index + 1}`}
              placeholder="Code"
              required
            />
            <input
              className={field}
              defaultValue={
                [
                  'Needs improvement',
                  'Developing',
                  'Meets expectations',
                  'Exceeds expectations',
                  'Outstanding',
                ][index] ?? `Level ${index + 1}`
              }
              name={`levelLabel${index + 1}`}
              placeholder="Label"
              required
            />
          </div>
        ))}
      </div>
      <label>
        Reason
        <input className={field} name="reason" required />
      </label>
      <Button disabled={pending} type="submit">
        Create rating scale
      </Button>
    </form>
  );
}

export function PerformanceSetupPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const scales = useQuery({
    queryKey: ['performance-scales', company.company?.id],
    queryFn: () => getPerformanceConfig('rating-scales', company.company.id),
    enabled: Boolean(company.company),
  });
  const competencies = useQuery({
    queryKey: ['performance-competencies', company.company?.id],
    queryFn: () => getPerformanceConfig('competencies', company.company.id),
    enabled: Boolean(company.company),
  });
  const templates = useQuery({
    queryKey: ['performance-templates', company.company?.id],
    queryFn: () => getPerformanceConfig('templates', company.company.id),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: ({ kind, body }) => createPerformanceConfig(kind, body),
    onSuccess: () => {
      setMessage('Configuration created.');
      client.invalidateQueries({ queryKey: ['performance-scales'] });
      client.invalidateQueries({ queryKey: ['performance-competencies'] });
      client.invalidateQueries({ queryKey: ['performance-templates'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || scales.isPending || competencies.isPending || templates.isPending)
    return <LoadingState />;
  if (company.error || scales.error || competencies.error || templates.error)
    return (
      <ErrorState error={company.error ?? scales.error ?? competencies.error ?? templates.error} />
    );
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Rating scales</h2>
        {!scales.data.length ? (
          <EmptyState message="No rating scales configured." />
        ) : (
          <div className="mt-2 space-y-1">
            {scales.data.map((scale) => (
              <p key={scale.id}>
                {scale.code} · {scale.name}
              </p>
            ))}
          </div>
        )}
        {permissions.includes('performance_rating_scale.create') && (
          <RatingScaleForm
            companyId={company.company.id}
            pending={create.isPending}
            submit={(variables) => create.mutate(variables)}
          />
        )}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Competency catalog</h2>
        {!competencies.data.length ? (
          <EmptyState message="No competencies configured." />
        ) : (
          <div className="mt-2 space-y-2">
            {competencies.data.map((competency) => (
              <div className="rounded border border-subtle p-3" key={competency.id}>
                <p className="font-medium">
                  {competency.code} · {competency.name}
                </p>
                <p className="text-sm text-secondary">
                  {competency.description} · Version #{competency.version_id}
                </p>
              </div>
            ))}
          </div>
        )}
        {permissions.includes('performance_competency.create') && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              create.mutate({
                kind: 'competencies',
                body: {
                  companyId: company.company.id,
                  code: data.get('code'),
                  name: data.get('name'),
                  description: data.get('description'),
                  effectiveStart: data.get('start'),
                  reason: data.get('reason'),
                },
              });
            }}
          >
            <label>
              Code
              <input className={field} name="code" required />
            </label>
            <label>
              Name
              <input className={field} name="name" required />
            </label>
            <label className="sm:col-span-2">
              Description
              <textarea className={field} name="description" required />
            </label>
            <label>
              Effective start
              <input className={field} name="start" type="date" required />
            </label>
            <label>
              Reason
              <input className={field} name="reason" required />
            </label>
            <Button disabled={create.isPending} type="submit">
              Create competency
            </Button>
          </form>
        )}
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Review templates</h2>
        {!templates.data.length ? (
          <EmptyState message="No templates configured." />
        ) : (
          <div className="mt-2 space-y-1">
            {templates.data.map((template) => (
              <p key={template.id}>
                {template.code} · {template.name} · {template.minimum_goal_count}–
                {template.maximum_goal_count} goals
                {template.goal_weights_enabled ? ' · weights required' : ''}
              </p>
            ))}
          </div>
        )}
        {permissions.includes('performance_template.create') && scales.data.length > 0 && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const competencyVersionIds = data.getAll('competencyVersionIds').map(Number);
              create.mutate({
                kind: 'templates',
                body: {
                  companyId: company.company.id,
                  code: data.get('code'),
                  name: data.get('name'),
                  effectiveStart: data.get('start'),
                  ratingScaleId: Number(data.get('scale')),
                  goalsEnabled: true,
                  goalWeightsEnabled: data.get('weighted') === 'on',
                  competenciesEnabled: competencyVersionIds.length > 0,
                  minimumGoalCount: Number(data.get('minimum')),
                  maximumGoalCount: Number(data.get('maximum')),
                  competencyVersionIds,
                  reason: data.get('reason'),
                },
              });
            }}
          >
            <label>
              Code
              <input className={field} name="code" required />
            </label>
            <label>
              Name
              <input className={field} name="name" required />
            </label>
            <label>
              Effective start
              <input className={field} name="start" type="date" required />
            </label>
            <label>
              Rating scale
              <select className={field} name="scale" required>
                {scales.data.map((scale) => (
                  <option key={scale.id} value={scale.id}>
                    {scale.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Minimum goals
              <input className={field} max="20" min="1" name="minimum" type="number" required />
            </label>
            <label>
              Maximum goals
              <input className={field} max="20" min="1" name="maximum" type="number" required />
            </label>
            <label className="sm:col-span-2 flex items-center gap-2">
              <input name="weighted" type="checkbox" /> Goal weights must total exactly 100
            </label>
            {competencies.data.length > 0 && (
              <label className="sm:col-span-2">
                Competencies
                <select className={`${field} min-h-28`} multiple name="competencyVersionIds">
                  {competencies.data.map((competency) => (
                    <option key={competency.version_id} value={competency.version_id}>
                      {competency.code} · {competency.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sm:col-span-2">
              Reason
              <input className={field} name="reason" required />
            </label>
            <Button disabled={create.isPending} type="submit">
              Create template
            </Button>
          </form>
        )}
      </section>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
