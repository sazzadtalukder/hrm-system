import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getPerformanceConfig } from '../performance/api.js';
import {
  createTrainingCourse,
  createTrainingProvider,
  getTrainingCourses,
  getTrainingProviders,
} from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function TrainingSetupPage() {
  const company = useOrganizationCompany(),
    { permissions } = useAuth(),
    client = useQueryClient(),
    [message, setMessage] = useState('');
  const courses = useQuery({
      queryKey: ['training-courses', company.company?.id],
      queryFn: () => getTrainingCourses(company.company.id),
      enabled: Boolean(company.company),
    }),
    providers = useQuery({
      queryKey: ['training-providers', company.company?.id],
      queryFn: () => getTrainingProviders(company.company.id),
      enabled: Boolean(company.company),
    }),
    competencies = useQuery({
      queryKey: ['training-competencies', company.company?.id],
      queryFn: () => getPerformanceConfig('competencies', company.company.id),
      enabled: Boolean(company.company),
    }),
    mutation = useMutation({
      mutationFn: ({ kind, body }) =>
        kind === 'course' ? createTrainingCourse(body) : createTrainingProvider(body),
      onSuccess: () => {
        setMessage('Configuration created.');
        client.invalidateQueries({ queryKey: ['training-courses'] });
        client.invalidateQueries({ queryKey: ['training-providers'] });
      },
      onError: (e) => setMessage(e.message),
    });
  if (company.isPending || courses.isPending || providers.isPending || competencies.isPending)
    return <LoadingState />;
  if (company.error || courses.error || providers.error || competencies.error)
    return (
      <ErrorState error={company.error ?? courses.error ?? providers.error ?? competencies.error} />
    );
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Courses</h2>
        {courses.data.map((x) => (
          <p key={x.id}>
            {x.code} · {x.name}
          </p>
        ))}
        <form
          className="mt-4 grid gap-2 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const d = new FormData(event.currentTarget);
            mutation.mutate({
              kind: 'course',
              body: {
                companyId: company.company.id,
                code: d.get('code'),
                name: d.get('name'),
                effectiveStart: d.get('start'),
                description: d.get('description'),
                deliveryMode: d.get('mode'),
                scoringEnabled: false,
                minimumScore: null,
                maximumScore: null,
                passingScore: null,
                competencyVersionIds: d.getAll('competency').map(Number),
                reason: d.get('reason'),
              },
            });
          }}
        >
          <input className={field} name="code" placeholder="Course code" required />
          <input className={field} name="name" placeholder="Course name" required />
          <input className={field} name="start" type="date" required />
          <textarea className={field} name="description" placeholder="Description" required />
          <select className={field} name="mode">
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
            <option value="blended">Blended</option>
          </select>
          <label>
            Competencies
            <select className={`${field} min-h-24`} multiple name="competency">
              {competencies.data.map((competency) => (
                <option key={competency.version_id} value={competency.version_id}>
                  {competency.code} · {competency.name}
                </option>
              ))}
            </select>
          </label>
          <input className={field} name="reason" placeholder="Reason" required />
          <Button type="submit">Create course</Button>
        </form>
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="font-semibold">Providers</h2>
        {providers.data.map((x) => (
          <p key={x.id}>
            {x.code} · {x.name}
          </p>
        ))}
        {permissions.includes('training_provider.create') && (
          <form
            className="mt-4 grid gap-2 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const d = new FormData(event.currentTarget);
              mutation.mutate({
                kind: 'provider',
                body: {
                  companyId: company.company.id,
                  code: d.get('code'),
                  name: d.get('name'),
                  effectiveStart: d.get('start'),
                  contactName: d.get('contact') || null,
                  contactEmail: d.get('email') || null,
                  externalUrl: d.get('url') || null,
                  reason: d.get('reason'),
                },
              });
            }}
          >
            <input className={field} name="code" placeholder="Provider code" required />
            <input className={field} name="name" placeholder="Provider name" required />
            <input className={field} name="start" type="date" required />
            <input className={field} name="contact" placeholder="Contact name" />
            <input className={field} name="email" placeholder="Contact email" type="email" />
            <input className={field} name="url" placeholder="HTTPS external URL" type="url" />
            <input className={field} name="reason" placeholder="Reason" required />
            <Button type="submit">Create provider</Button>
          </form>
        )}
      </section>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
