import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { useOwnLeaveEmployment } from './useOwnLeaveEmployment.js';
import { createLeaveRequest, getLeaveTypes } from './api.js';

export function LeaveRequestForm() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const ownEmployment = useOwnLeaveEmployment(company.company?.id);
  const [form, setForm] = useState({
    leaveTypeId: '',
    dateFrom: '',
    dateTo: '',
    dayPart: 'full_day',
    reason: '',
  });
  const types = useQuery({
    queryKey: ['leave', 'types', company.company?.id],
    queryFn: () => getLeaveTypes(company.company.id),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: (data) => navigate(`/leave/my/${data.id}`),
  });
  if (company.isPending || types.isPending || ownEmployment.isPending) return <LoadingState />;
  if (company.error || types.error || ownEmployment.error)
    return <ErrorState error={company.error ?? types.error ?? ownEmployment.error} />;
  const set = (event) =>
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({
          ...form,
          companyId: company.company.id,
          employmentId: ownEmployment.data.id,
          leaveTypeId: Number(form.leaveTypeId),
        });
      }}
    >
      <h2 className="text-lg font-semibold">New leave request</h2>
      <div className="rounded-md border border-subtle bg-app p-3 text-sm">
        <span className="text-secondary">Applying for</span>
        <p className="mt-1 font-medium">
          {ownEmployment.data.displayName} ({ownEmployment.data.employeeCode}) · Employment #
          {ownEmployment.data.id}
        </p>
      </div>
      <label className="block text-sm">
        Leave type
        <select
          className="mt-1 w-full rounded-md border border-subtle p-2"
          name="leaveTypeId"
          required
          value={form.leaveTypeId}
          onChange={set}
        >
          <option value="">Select</option>
          {types.data?.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          From
          <input
            className="mt-1 w-full rounded-md border border-subtle p-2"
            name="dateFrom"
            type="date"
            required
            value={form.dateFrom}
            onChange={set}
          />
        </label>
        <label className="text-sm">
          To
          <input
            className="mt-1 w-full rounded-md border border-subtle p-2"
            name="dateTo"
            type="date"
            required
            value={form.dateTo}
            onChange={set}
          />
        </label>
      </div>
      <label className="block text-sm">
        Day part
        <select
          className="mt-1 w-full rounded-md border border-subtle p-2"
          name="dayPart"
          value={form.dayPart}
          onChange={set}
        >
          <option value="full_day">Full day</option>
          <option value="first_half">First half</option>
          <option value="second_half">Second half</option>
        </select>
      </label>
      <label className="block text-sm">
        Reason
        <textarea
          className="mt-1 w-full rounded-md border border-subtle p-2"
          name="reason"
          required
          maxLength={500}
          value={form.reason}
          onChange={set}
        />
      </label>
      {create.error && <ErrorState error={create.error} />}
      <Button disabled={create.isPending} type="submit">
        Save draft
      </Button>
    </form>
  );
}
