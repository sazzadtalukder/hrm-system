import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { createCorrection, getAttendanceRecord } from './api.js';

function formatDateTime(value, timezone) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || undefined,
  }).format(new Date(value));
}

function formatMinutes(value) {
  const minutes = Number(value ?? 0);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m (${minutes} minutes)`;
}

function readableCode(value) {
  return value ? value.toLowerCase().replaceAll('_', ' ') : 'None';
}

export function AttendanceRecordPage() {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const record = useQuery({
    queryKey: ['attendance', 'record', id],
    queryFn: () => getAttendanceRecord(id),
  });
  const correction = useMutation({
    mutationFn: (body) => createCorrection(id, body),
    onSuccess: async (row) => {
      setMessage(`Correction #${row.id} created as a draft. Open Corrections to submit it.`);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'corrections'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (record.isPending) return <LoadingState />;
  if (record.error) return <ErrorState error={record.error} />;
  const currentVersion = record.data.versions[0];
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Attendance record</h2>
          <StatusBadge status={record.data.status} />
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-secondary">Date</dt>
            <dd>{String(record.data.attendance_date).slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Current version</dt>
            <dd>{record.data.current_version_number}</dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Scheduled time</dt>
            <dd>
              {formatDateTime(
                currentVersion?.scheduled_start_utc,
                currentVersion?.schedule_timezone,
              )}{' '}
              –{' '}
              {formatDateTime(currentVersion?.scheduled_end_utc, currentVersion?.schedule_timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Actual check-in</dt>
            <dd>
              {formatDateTime(
                currentVersion?.first_check_in_utc,
                currentVersion?.schedule_timezone,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Actual check-out</dt>
            <dd>
              {formatDateTime(
                currentVersion?.last_check_out_utc,
                currentVersion?.schedule_timezone,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Worked time</dt>
            <dd>{formatMinutes(currentVersion?.worked_minutes)}</dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Exception</dt>
            <dd className="capitalize">{readableCode(currentVersion?.exception_code)}</dd>
          </div>
          <div>
            <dt className="text-sm text-secondary">Schedule timezone</dt>
            <dd>{currentVersion?.schedule_timezone ?? 'Not configured'}</dd>
          </div>
        </dl>
        <h3 className="mt-6 font-semibold">Calculation history</h3>
        <ul className="mt-2 space-y-2">
          {record.data.versions.map((version) => (
            <li className="rounded border border-subtle p-4 text-sm" key={version.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>Version {version.version_number}</strong>
                <StatusBadge status={version.status} />
              </div>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-secondary">Check-in</dt>
                  <dd>{formatDateTime(version.first_check_in_utc, version.schedule_timezone)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Check-out</dt>
                  <dd>{formatDateTime(version.last_check_out_utc, version.schedule_timezone)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Worked</dt>
                  <dd>{formatMinutes(version.worked_minutes)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Late</dt>
                  <dd>{formatMinutes(version.late_minutes)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Early departure</dt>
                  <dd>{formatMinutes(version.early_departure_minutes)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Exception</dt>
                  <dd className="capitalize">{readableCode(version.exception_code)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>
      {auth.permissions.includes('attendance_correction.create') ? (
        <form
          className="rounded-lg border border-subtle bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('');
            const data = new FormData(event.currentTarget);
            const checkIn = data.get('requestedCheckInUtc');
            const checkOut = data.get('requestedCheckOutUtc');
            if (!checkIn && !checkOut) {
              setMessage('Enter a corrected check-in or check-out time.');
              return;
            }
            correction.mutate({
              requestedCheckInUtc: checkIn ? new Date(checkIn).toISOString() : null,
              requestedCheckOutUtc: checkOut ? new Date(checkOut).toISOString() : null,
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="text-lg font-semibold">Request attendance correction</h2>
          <p className="mt-1 text-sm text-secondary">
            Enter at least one corrected time. The request is created as a draft and must be
            submitted from Attendance Corrections.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Corrected check-in
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="requestedCheckInUtc"
                type="datetime-local"
              />
            </label>
            <label className="text-sm font-medium">
              Corrected check-out
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="requestedCheckOutUtc"
                type="datetime-local"
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Reason
              <textarea
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                maxLength="500"
                name="reason"
                required
                rows="3"
              />
            </label>
          </div>
          <Button className="mt-4" disabled={correction.isPending} type="submit">
            Create correction draft
          </Button>
          {message ? (
            <p className="mt-3 text-sm" role="status">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
