import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import {
  getOrganizationRecord,
  replaceCalendarDays,
  transitionOrganizationRecord,
  updateOrganizationRecord,
} from './api.js';

function CalendarDays({ record, onSaved }) {
  const existing = new Map(record.days?.map((day) => [Number(day.weekday), day]));
  const mutation = useMutation({
    mutationFn: (body) => replaceCalendarDays(record.id, body),
    onSuccess: onSaved,
  });
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const days = Array.from({ length: 7 }, (_, index) => {
      const weekday = index + 1;
      const isWorkingDay = data.get(`working-${weekday}`) === 'on';
      return {
        weekday,
        isWorkingDay,
        startTime: isWorkingDay ? data.get(`start-${weekday}`) : null,
        endTime: isWorkingDay ? data.get(`end-${weekday}`) : null,
        breakMinutes: isWorkingDay ? Number(data.get(`break-${weekday}`) || 0) : 0,
      };
    });
    await mutation.mutateAsync({ version: record.version, days });
  }
  return (
    <form className="mt-8 rounded-lg border border-subtle bg-surface p-5" onSubmit={submit}>
      <h3 className="font-semibold">Working week</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-secondary">
              <th className="py-2">Day</th>
              <th>Working</th>
              <th>Start</th>
              <th>End</th>
              <th>Break</th>
            </tr>
          </thead>
          <tbody>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
              (label, index) => {
                const weekday = index + 1;
                const day = existing.get(weekday);
                return (
                  <tr className="border-t border-subtle" key={label}>
                    <td className="py-3 font-medium">{label}</td>
                    <td>
                      <input
                        defaultChecked={Boolean(day?.is_working_day)}
                        name={`working-${weekday}`}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <input
                        className="rounded border border-subtle px-2 py-1"
                        defaultValue={day?.start_time?.slice(0, 5) ?? '09:00'}
                        name={`start-${weekday}`}
                        type="time"
                      />
                    </td>
                    <td>
                      <input
                        className="rounded border border-subtle px-2 py-1"
                        defaultValue={day?.end_time?.slice(0, 5) ?? '17:00'}
                        name={`end-${weekday}`}
                        type="time"
                      />
                    </td>
                    <td>
                      <input
                        className="w-20 rounded border border-subtle px-2 py-1"
                        defaultValue={day?.break_minutes ?? 60}
                        min="0"
                        name={`break-${weekday}`}
                        type="number"
                      />
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
      <Button className="mt-4" disabled={mutation.isPending} type="submit">
        Save working week
      </Button>
    </form>
  );
}

export function MasterDetailPage({ title, path, permissionResource, kind = 'master' }) {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['organization', path, id],
    queryFn: () => getOrganizationRecord(path, id),
  });
  const update = useMutation({
    mutationFn: (body) => updateOrganizationRecord(path, id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization', path] }),
  });
  const transition = useMutation({
    mutationFn: ({ action, body }) => transitionOrganizationRecord(path, id, action, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization', path] }),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const record = query.data;
  const canUpdate = auth.permissions.includes(`${permissionResource}.update`);
  async function submit(event) {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    const body = {
      version: record.version,
      name: data.get('name'),
      description: data.get('description') || null,
    };
    if (kind !== 'holiday') body.code = data.get('code');
    if (kind === 'grade') body.rank = data.get('rank') ? Number(data.get('rank')) : null;
    if (kind === 'calendar') body.timezone = data.get('timezone');
    if (kind === 'holiday') body.holidayDate = data.get('holidayDate');
    try {
      await update.mutateAsync(body);
      setMessage('Changes saved.');
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function changeStatus() {
    const action =
      kind === 'holiday' ? 'cancel' : record.status === 'active' ? 'deactivate' : 'activate';
    await transition.mutateAsync({
      action,
      body: { version: record.version, reason: 'Changed from organization administration' },
    });
  }
  const canTransition =
    kind === 'holiday'
      ? auth.permissions.includes('holiday.cancel') && record.status === 'active'
      : auth.permissions.includes(
          `${permissionResource}.${record.status === 'active' ? 'deactivate' : 'update'}`,
        );
  return (
    <div className="max-w-4xl">
      <Link className="text-sm font-medium text-accent hover:underline" to="..">
        ← Back to {title.toLowerCase()}
      </Link>
      <div className="mt-5 flex items-center gap-3">
        <h2 className="text-2xl font-semibold">{record.name}</h2>
        <StatusBadge status={record.status} />
      </div>
      <form className="mt-6 rounded-lg border border-subtle bg-surface p-6" onSubmit={submit}>
        <div className="grid gap-5 sm:grid-cols-2">
          {kind !== 'holiday' && (
            <label className="text-sm font-medium">
              Code
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2 disabled:bg-app"
                defaultValue={record.code}
                disabled={!canUpdate}
                name="code"
                required
              />
            </label>
          )}
          <label className="text-sm font-medium">
            Name
            <input
              className="mt-2 w-full rounded-md border border-subtle px-3 py-2 disabled:bg-app"
              defaultValue={record.name}
              disabled={!canUpdate}
              name="name"
              required
            />
          </label>
          {kind === 'holiday' && (
            <label className="text-sm font-medium">
              Date
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue={record.holiday_date?.slice(0, 10)}
                disabled={!canUpdate}
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
                defaultValue={record.rank ?? ''}
                disabled={!canUpdate}
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
                defaultValue={record.timezone}
                disabled={!canUpdate}
                name="timezone"
                required
              />
            </label>
          )}
          <label className="text-sm font-medium sm:col-span-2">
            Description
            <textarea
              className="mt-2 w-full rounded-md border border-subtle px-3 py-2 disabled:bg-app"
              defaultValue={record.description ?? ''}
              disabled={!canUpdate}
              name="description"
              rows="3"
            />
          </label>
        </div>
        {message && (
          <p className="mt-4 text-sm text-secondary" role="status">
            {message}
          </p>
        )}
        {canUpdate && (
          <div className="mt-5 flex gap-3">
            <Button disabled={update.isPending} type="submit">
              Save changes
            </Button>
            {canTransition && (
              <Button onClick={changeStatus} type="button" variant="secondary">
                {kind === 'holiday'
                  ? 'Cancel holiday'
                  : record.status === 'active'
                    ? 'Deactivate'
                    : 'Activate'}
              </Button>
            )}
          </div>
        )}
      </form>
      {kind === 'calendar' && canUpdate && (
        <CalendarDays
          record={record}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['organization', path, id] })}
        />
      )}
    </div>
  );
}
