import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActionDialog } from '../../components/ui/ActionDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  assignAttendanceShift,
  createAttendanceShift,
  decideCorrection,
  getAttendanceCorrections,
  getAttendanceLocks,
  getAttendanceShiftAssignments,
  getAttendanceShifts,
  transitionCorrection,
} from './api.js';
import { AttendanceEmploymentPicker } from './AttendanceEmploymentPicker.jsx';

const loaders = {
  corrections: getAttendanceCorrections,
  locks: getAttendanceLocks,
  shifts: getAttendanceShifts,
};

const titles = {
  corrections: 'Attendance corrections',
  locks: 'Attendance locks',
  shifts: 'Attendance shifts',
};

const fields = {
  corrections: [
    ['Status', 'status'],
    ['Reason', 'reason'],
    ['Requested check-in', 'requested_check_in_utc'],
    ['Requested check-out', 'requested_check_out_utc'],
  ],
  locks: [
    ['Status', 'status'],
    ['Period start', 'period_start'],
    ['Period end', 'period_end'],
    ['Branch', 'branch_id'],
    ['Reason', 'reason'],
  ],
  shifts: [
    ['Code', 'code'],
    ['Status', 'status'],
    ['Description', 'description'],
  ],
};

const display = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

export function AttendanceAdminPage({ kind }) {
  const company = useOrganizationCompany();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [action, setAction] = useState(null);
  const [assignmentEmploymentId, setAssignmentEmploymentId] = useState('');
  const result = useQuery({
    queryKey: ['attendance', kind, company.company?.id],
    queryFn: () => loaders[kind](company.company.id),
    enabled: Boolean(company.company),
  });
  const existingAssignments = useQuery({
    queryKey: ['attendance', 'shift-assignments', assignmentEmploymentId],
    queryFn: () => getAttendanceShiftAssignments(assignmentEmploymentId),
    enabled: kind === 'shifts' && Boolean(assignmentEmploymentId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance', kind] });
  const createShift = useMutation({
    mutationFn: createAttendanceShift,
    onSuccess: async (row) => {
      setMessage(`Shift #${row.id} created.`);
      await refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const assignShift = useMutation({
    mutationFn: ({ employmentId, body }) => assignAttendanceShift(employmentId, body),
    onSuccess: async (row) => {
      setMessage(`Shift assignment #${row.id} created.`);
      await refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const correctionAction = useMutation({
    mutationFn: ({ row, type, reason }) =>
      ['approve', 'reject'].includes(type)
        ? decideCorrection(row.id, type, {
            workflowVersion: row.workflow_version,
            idempotencyKey: globalThis.crypto.randomUUID(),
            reason,
          })
        : transitionCorrection(row.id, type, {
            workflowVersion: row.workflow_version,
            reason,
          }),
    onSuccess: async (_row, variables) => {
      setMessage(`Correction ${variables.type} action completed.`);
      setAction(null);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'records'] }),
      ]);
    },
  });
  if (company.isPending || result.isPending) return <LoadingState />;
  if (company.error || result.error) return <ErrorState error={company.error ?? result.error} />;
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{titles[kind]}</h1>
        <p className="mt-1 text-sm text-secondary">
          Company-scoped attendance configuration and workflow records.
        </p>
      </header>
      {kind === 'shifts' && auth.permissions.includes('attendance_shift.create') ? (
        <form
          className="rounded-lg border border-subtle bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('');
            const data = new FormData(event.currentTarget);
            createShift.mutate({
              companyId: company.company.id,
              code: data.get('code'),
              name: data.get('name'),
              description: data.get('description') || null,
              effectiveStart: data.get('effectiveStart'),
              effectiveEnd: null,
              timezone: data.get('timezone'),
              startTime: data.get('startTime'),
              endTime: data.get('endTime'),
              crossesMidnight: data.get('crossesMidnight') === 'on',
              unpaidBreakMinutes: Number(data.get('unpaidBreakMinutes')),
              graceInMinutes: Number(data.get('graceInMinutes')),
              graceOutMinutes: Number(data.get('graceOutMinutes')),
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="text-lg font-semibold">Create attendance shift</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Code', 'code', 'GENERAL'],
              ['Name', 'name', 'General Shift'],
              ['Effective start', 'effectiveStart', new Date().toISOString().slice(0, 10), 'date'],
              ['Timezone', 'timezone', 'Asia/Dhaka'],
              ['Start time', 'startTime', '09:00', 'time'],
              ['End time', 'endTime', '18:00', 'time'],
              ['Unpaid break minutes', 'unpaidBreakMinutes', '60', 'number'],
              ['Grace-in minutes', 'graceInMinutes', '15', 'number'],
              ['Grace-out minutes', 'graceOutMinutes', '15', 'number'],
            ].map(([label, name, defaultValue, type = 'text']) => (
              <label className="text-sm font-medium" key={name}>
                {label}
                <input
                  className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                  defaultValue={defaultValue}
                  min={type === 'number' ? 0 : undefined}
                  name={name}
                  required
                  type={type}
                />
              </label>
            ))}
            <label className="flex items-center gap-2 self-end py-2 text-sm font-medium">
              <input name="crossesMidnight" type="checkbox" /> Crosses midnight
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Description
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue="Standard office working hours"
                name="description"
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Reason
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue="Initial UAT general shift configuration"
                name="reason"
                required
              />
            </label>
          </div>
          <Button className="mt-4" disabled={createShift.isPending} type="submit">
            Create shift
          </Button>
        </form>
      ) : null}
      {kind === 'shifts' && auth.permissions.includes('attendance_shift.assign') ? (
        <form
          className="rounded-lg border border-subtle bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('');
            const data = new FormData(event.currentTarget);
            assignShift.mutate({
              employmentId: Number(assignmentEmploymentId),
              body: {
                attendanceShiftId: Number(data.get('attendanceShiftId')),
                effectiveStart: data.get('effectiveStart'),
                effectiveEnd: null,
                supersedesShiftAssignmentId: null,
                reason: data.get('reason'),
              },
            });
          }}
        >
          <h2 className="text-lg font-semibold">Assign shift to employment</h2>
          <p className="mt-1 text-sm text-secondary">
            Select the employee and review existing periods before creating another assignment.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AttendanceEmploymentPicker
              companyId={company.company.id}
              onChange={setAssignmentEmploymentId}
              value={assignmentEmploymentId}
            />
            <label className="text-sm font-medium">
              Shift
              <select
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="attendanceShiftId"
                required
              >
                <option value="">Select a shift</option>
                {result.data?.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name} ({shift.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Effective start
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="effectiveStart"
                required
                type="date"
              />
            </label>
            <label className="text-sm font-medium">
              Reason
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                defaultValue="Assign General Shift for UAT"
                name="reason"
                required
              />
            </label>
          </div>
          {existingAssignments.data?.length ? (
            <div className="mt-4 rounded-md border border-subtle bg-app p-4">
              <h3 className="text-sm font-semibold">Existing shift assignment periods</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {existingAssignments.data.map((assignment) => {
                  const shift = result.data?.find(
                    (item) => Number(item.id) === Number(assignment.attendance_shift_id),
                  );
                  return (
                    <li key={assignment.id}>
                      {shift
                        ? `${shift.name} (${shift.code})`
                        : `Shift #${assignment.attendance_shift_id}`}
                      {' — '}
                      {String(assignment.effective_start).slice(0, 10)} to{' '}
                      {assignment.effective_end
                        ? String(assignment.effective_end).slice(0, 10)
                        : 'ongoing'}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-secondary">
                Overlapping assignment periods are intentionally prohibited. Close or correct the
                existing period before assigning a replacement.
              </p>
            </div>
          ) : null}
          {existingAssignments.error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {existingAssignments.error.message}
            </p>
          ) : null}
          <Button
            className="mt-4"
            disabled={!result.data?.length || !assignmentEmploymentId || assignShift.isPending}
            type="submit"
          >
            Assign shift
          </Button>
        </form>
      ) : null}
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
      {!result.data?.length ? (
        <EmptyState message={`No ${kind} found.`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((item) => (
            <article
              className="rounded-lg border border-subtle bg-surface p-4 text-sm"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">
                  {item.name ?? `${titles[kind].replace('Attendance ', '')} #${item.id}`}
                </h2>
                {item.status ? (
                  <span className="rounded-full bg-app px-2 py-1 text-xs font-medium text-secondary">
                    {item.status.replaceAll('_', ' ')}
                  </span>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-3">
                {fields[kind]
                  .filter(([, key]) => key !== 'status')
                  .map(([label, key]) => (
                    <div className="grid grid-cols-[8rem_1fr] gap-2" key={key}>
                      <dt className="text-secondary">{label}</dt>
                      <dd className="break-words">{display(item[key])}</dd>
                    </div>
                  ))}
              </dl>
              {kind === 'corrections' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.status === 'draft' &&
                  auth.permissions.includes('attendance_correction.submit') ? (
                    <Button onClick={() => setAction({ row: item, type: 'submit' })} type="button">
                      Submit
                    </Button>
                  ) : null}
                  {item.status === 'draft' &&
                  auth.permissions.includes('attendance_correction.cancel') ? (
                    <Button
                      onClick={() => setAction({ row: item, type: 'cancel' })}
                      type="button"
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {item.status === 'submitted' &&
                  auth.permissions.includes('attendance_correction.approve') ? (
                    <Button onClick={() => setAction({ row: item, type: 'approve' })} type="button">
                      Approve
                    </Button>
                  ) : null}
                  {item.status === 'submitted' &&
                  auth.permissions.includes('attendance_correction.reject') ? (
                    <Button
                      onClick={() => setAction({ row: item, type: 'reject' })}
                      type="button"
                      variant="secondary"
                    >
                      Reject
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {action ? (
        <ActionDialog
          busy={correctionAction.isPending}
          confirmLabel={action.type.charAt(0).toUpperCase() + action.type.slice(1)}
          description={`Confirm the ${action.type} action for correction #${action.row.id}.`}
          onCancel={() => setAction(null)}
          onConfirm={({ reason }) => correctionAction.mutate({ ...action, reason })}
          title={`${action.type.charAt(0).toUpperCase() + action.type.slice(1)} correction`}
        />
      ) : null}
      {correctionAction.error ? <ErrorState error={correctionAction.error} /> : null}
    </section>
  );
}
