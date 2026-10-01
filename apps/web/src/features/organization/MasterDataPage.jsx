import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { createOrganizationRecord, getOrganizationRecords } from './api.js';
import { useOrganizationCompany } from './useOrganizationCompany.js';

export function MasterDataPage({ title, path, permissionResource, kind = 'master' }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const companies = useOrganizationCompany();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const records = useQuery({
    queryKey: ['organization', path, companies.company?.id],
    queryFn: () => getOrganizationRecords(path, companies.company.id),
    enabled: Boolean(companies.company),
  });
  const mutation = useMutation({
    mutationFn: (body) => createOrganizationRecord(path, body),
    onSuccess: async () => {
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ['organization', path] });
    },
  });
  if (companies.isPending || records.isPending) return <LoadingState />;
  if (companies.error || records.error)
    return <ErrorState error={companies.error ?? records.error} />;
  if (!companies.company)
    return <ErrorState error={{ message: 'No company has been configured.' }} />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const body = {
      companyId: companies.company.id,
      name: data.get('name'),
      description: data.get('description') || null,
    };
    if (kind === 'holiday') {
      body.holidayDate = data.get('holidayDate');
      body.branchId = null;
      body.workCalendarId = null;
    } else {
      body.code = data.get('code');
      if (kind === 'grade') body.rank = data.get('rank') ? Number(data.get('rank')) : null;
      if (kind === 'calendar') body.timezone = data.get('timezone') || companies.company.timezone;
    }
    try {
      await mutation.mutateAsync(body);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause.message);
    }
  }

  const canCreate = auth.permissions.includes(`${permissionResource}.create`);
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-secondary">{companies.company.name}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm((visible) => !visible)} type="button">
            {showForm ? 'Close form' : `Add ${title.toLowerCase().replace(/s$/, '')}`}
          </Button>
        )}
      </div>
      {showForm && (
        <form className="mb-6 rounded-lg border border-subtle bg-surface p-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kind !== 'holiday' && (
              <label className="text-sm font-medium">
                Code
                <input
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  name="code"
                  required
                />
              </label>
            )}
            <label className="text-sm font-medium">
              Name
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="name"
                required
              />
            </label>
            {kind === 'holiday' && (
              <label className="text-sm font-medium">
                Date
                <input
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  name="holidayDate"
                  type="date"
                  required
                />
              </label>
            )}
            {kind === 'grade' && (
              <label className="text-sm font-medium">
                Rank
                <input
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  min="1"
                  name="rank"
                  type="number"
                />
              </label>
            )}
            {kind === 'calendar' && (
              <label className="text-sm font-medium">
                Timezone
                <input
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  defaultValue={companies.company.timezone}
                  name="timezone"
                  required
                />
              </label>
            )}
            <label className="text-sm font-medium">
              Description
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="description"
              />
            </label>
          </div>
          {error && (
            <p className="mt-4 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button className="mt-5" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}
      {!records.data?.items.length ? (
        <EmptyState message={`No ${title.toLowerCase()} configured.`} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-subtle bg-app text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">{kind === 'holiday' ? 'Date' : 'Code'}</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.data.items.map((record) => (
                <tr className="border-b border-subtle last:border-0" key={record.id}>
                  <td className="px-4 py-3 font-medium">
                    {kind === 'holiday' ? record.holiday_date : record.code}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-accent hover:underline"
                      to={String(record.id)}
                    >
                      {record.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
