import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createManualAttendanceEvent, getAttendanceEvents } from './api.js';
import { AttendanceEmploymentPicker } from './AttendanceEmploymentPicker.jsx';

export function AttendanceEventsPage() {
  const company = useOrganizationCompany();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [selectedEmploymentId, setSelectedEmploymentId] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const events = useQuery({
    queryKey: ['attendance', 'events', company.company?.id],
    queryFn: () => getAttendanceEvents({ companyId: company.company.id, page: 1, pageSize: 50 }),
    enabled: Boolean(company.company),
  });
  const createEvent = useMutation({
    mutationFn: createManualAttendanceEvent,
    onSuccess: async (result) => {
      setMessage(`Attendance event #${result.id} recorded (${result.disposition}).`);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'events'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || events.isPending) return <LoadingState />;
  if (company.error || events.error) return <ErrorState error={company.error ?? events.error} />;
  return (
    <div className="space-y-6">
      {auth.permissions.includes('attendance_event.create') ? (
        <form
          className="rounded-lg border border-subtle bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('');
            const data = new FormData(event.currentTarget);
            createEvent.mutate({
              companyId: company.company.id,
              employeeCode: selectedEmployee.employee_code,
              eventType: data.get('eventType'),
              occurredAt: new Date(data.get('occurredAt')).toISOString(),
              sourceEventKey: data.get('sourceEventKey') || null,
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="text-lg font-semibold">Record manual punch</h2>
          <p className="mt-1 text-sm text-secondary">
            Record an authorized check-in or check-out. Calculation remains a separate action.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AttendanceEmploymentPicker
              companyId={company.company.id}
              onChange={(employmentId, employee) => {
                setSelectedEmploymentId(employmentId);
                setSelectedEmployee(employee);
              }}
              value={selectedEmploymentId}
            />
            <label className="text-sm font-medium">
              Event type
              <select
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="eventType"
              >
                <option value="check_in">Check in</option>
                <option value="check_out">Check out</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Occurred at
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="occurredAt"
                required
                type="datetime-local"
              />
            </label>
            <label className="text-sm font-medium">
              Source event key
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="sourceEventKey"
                placeholder="UAT-IN-001"
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Reason
              <input
                className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
                name="reason"
                required
              />
            </label>
          </div>
          <Button
            className="mt-4"
            disabled={!selectedEmployee || createEvent.isPending}
            type="submit"
          >
            Record punch
          </Button>
          {message ? (
            <p className="mt-3 text-sm" role="status">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
      {!events.data?.items.length ? (
        <EmptyState message="No raw attendance events found." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-subtle bg-app text-secondary">
              <tr>
                <th className="px-4 py-3">Occurred</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Disposition</th>
              </tr>
            </thead>
            <tbody>
              {events.data.items.map((event) => (
                <tr className="border-b border-subtle last:border-0" key={event.id}>
                  <td className="px-4 py-3">{new Date(event.occurred_at_utc).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {event.display_name} ({event.employee_code})
                  </td>
                  <td className="px-4 py-3">{event.event_type}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.disposition} />
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
