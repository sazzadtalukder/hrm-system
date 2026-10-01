import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createTrainingEnrollment, getTrainingSessions } from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function TrainingEnrollmentFormPage({ source = 'self' }) {
  const company = useOrganizationCompany(),
    navigate = useNavigate(),
    [message, setMessage] = useState('');
  const sessions = useQuery({
    queryKey: ['training-sessions', company.company?.id],
    queryFn: () => getTrainingSessions(company.company.id),
    enabled: Boolean(company.company),
  });
  const employees = useQuery({
    queryKey: ['training-eligible-employees', company.company?.id, source],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company),
  });
  const mutation = useMutation({
    mutationFn: (body) => createTrainingEnrollment(body, source),
    onSuccess: (x) =>
      navigate(source === 'self' ? `/training/my/${x.id}` : `/training/enrollments/${x.id}`),
    onError: (e) => setMessage(e.message),
  });
  if (company.isPending || sessions.isPending || employees.isPending) return <LoadingState />;
  if (company.error || sessions.error || employees.error)
    return <ErrorState error={company.error ?? sessions.error ?? employees.error} />;
  return (
    <form
      className="mx-auto max-w-2xl space-y-3 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        mutation.mutate({
          companyId: company.company.id,
          trainingSessionId: Number(data.get('session')),
          employmentId: Number(data.get('employment')),
          requestNarrative: data.get('narrative'),
          isMandatory: data.get('mandatory') === 'on',
          reason: data.get('reason'),
        });
      }}
    >
      <h2 className="text-xl font-semibold">
        {source === 'self'
          ? 'Request training'
          : source === 'nomination'
            ? 'Nominate employee'
            : 'Assign training'}
      </h2>
      <select className={field} name="session" required>
        <option value="">Select session</option>
        {sessions.data
          .filter((x) => x.status === 'published')
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} · {x.title_snapshot}
            </option>
          ))}
      </select>
      <select className={field} name="employment" required>
        <option value="">Select employee</option>
        {employees.data.items
          .filter((employee) => employee.employment)
          .map((employee) => (
            <option key={employee.employment.id} value={employee.employment.id}>
              {employee.displayName} · {employee.employment.employeeCode} · Employment #
              {employee.employment.id}
            </option>
          ))}
      </select>
      <textarea className={field} name="narrative" placeholder="Training purpose" required />
      {source === 'assignment' && (
        <label>
          <input name="mandatory" type="checkbox" /> Mandatory assignment
        </label>
      )}
      <input className={field} name="reason" placeholder="Required reason" required />
      <Button type="submit">Save</Button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
