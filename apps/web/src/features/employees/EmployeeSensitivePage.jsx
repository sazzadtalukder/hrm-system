import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployeeContact, getEmployeePersonal } from './api.js';
import { updateEmployeeContact, updateEmployeePersonal } from './api.js';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';

function Value({ label, value }) {
  return (
    <div>
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="mt-1 font-medium">{value || '—'}</dd>
    </div>
  );
}
export function EmployeeSensitivePage({ kind }) {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['employee', id, kind],
    queryFn: () => (kind === 'personal' ? getEmployeePersonal(id) : getEmployeeContact(id)),
  });
  const permission = kind === 'personal' ? 'employee_personal.update' : 'employee_contact.update';
  const mutation = useMutation({
    mutationFn: (body) =>
      kind === 'personal' ? updateEmployeePersonal(id, body) : updateEmployeeContact(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee', id, kind] }),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return <EmptyState message={`No ${kind} information.`} />;
  const fields =
    kind === 'personal'
      ? [
          ['Date of birth', query.data.dateOfBirth],
          ['Gender', query.data.gender],
          ['Marital status', query.data.maritalStatus],
          ['Nationality', query.data.nationalityCountryCode],
        ]
      : [
          ['Personal email', query.data.personalEmail],
          ['Personal phone', query.data.personalPhone],
          ['Alternate phone', query.data.alternatePhone],
          ['Present city', query.data.presentCity],
          ['Permanent city', query.data.permanentCity],
        ];
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = { version: query.data.version };
    if (kind === 'personal') {
      body.dateOfBirth = data.get('dateOfBirth') || null;
      body.gender = data.get('gender') || null;
      body.maritalStatus = data.get('maritalStatus') || null;
      body.nationalityCountryCode = data.get('nationalityCountryCode') || null;
    } else {
      body.personalEmail = data.get('personalEmail') || null;
      body.personalPhone = data.get('personalPhone') || null;
      body.alternatePhone = data.get('alternatePhone') || null;
    }
    await mutation.mutateAsync(body);
  }
  return (
    <div className="space-y-5">
      <dl className="grid gap-5 rounded-lg border border-subtle bg-surface p-5 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <Value key={label} label={label} value={value} />
        ))}
      </dl>
      {auth.permissions.includes(permission) &&
        (kind === 'personal' ||
          auth.permissions.includes('employee_contact.verify_sensitive_change')) && (
          <form className="rounded-lg border border-subtle bg-surface p-5" onSubmit={submit}>
            <h3 className="mb-4 font-semibold">Update {kind} information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {kind === 'personal' ? (
                <>
                  <label className="text-sm font-medium">
                    Date of birth
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.dateOfBirth ?? ''}
                      name="dateOfBirth"
                      type="date"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Gender
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.gender ?? ''}
                      name="gender"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Marital status
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.maritalStatus ?? ''}
                      name="maritalStatus"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Nationality country code
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.nationalityCountryCode ?? ''}
                      maxLength="2"
                      name="nationalityCountryCode"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="text-sm font-medium">
                    Personal email
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.personalEmail ?? ''}
                      name="personalEmail"
                      type="email"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Personal phone
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.personalPhone ?? ''}
                      name="personalPhone"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Alternate phone
                    <input
                      className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                      defaultValue={query.data.alternatePhone ?? ''}
                      name="alternatePhone"
                    />
                  </label>
                </>
              )}
            </div>
            {mutation.error && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {mutation.error.message}
              </p>
            )}
            <Button className="mt-4" disabled={mutation.isPending} type="submit">
              Save changes
            </Button>
          </form>
        )}
    </div>
  );
}
