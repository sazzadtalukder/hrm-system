import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { calculateAttendance } from './api.js';
import { AttendanceEmploymentPicker } from './AttendanceEmploymentPicker.jsx';

export function AttendanceCalculatePage() {
  const company = useOrganizationCompany();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employmentIds, setEmploymentIds] = useState([]);
  const [message, setMessage] = useState('');
  const calculation = useMutation({
    mutationFn: calculateAttendance,
    onSuccess: (result) => setMessage(`${result.calculatedRecords} record(s) calculated.`),
    onError: (error) => setMessage(error.message),
  });
  const submit = (event) => {
    event.preventDefault();
    calculation.mutate({ companyId: company.company.id, dateFrom, dateTo, employmentIds });
  };
  return (
    <form
      className="max-w-xl space-y-4 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={submit}
    >
      <div>
        <h2 className="text-lg font-semibold">Calculate attendance</h2>
        <p className="mt-1 text-sm text-secondary">
          Maximum 31 days and 500 explicit employment IDs.
        </p>
      </div>
      <label className="block text-sm font-medium">
        From
        <input
          className="mt-1 block w-full rounded-md border border-subtle px-3 py-2"
          onChange={(event) => setDateFrom(event.target.value)}
          required
          type="date"
          value={dateFrom}
        />
      </label>
      <label className="block text-sm font-medium">
        To
        <input
          className="mt-1 block w-full rounded-md border border-subtle px-3 py-2"
          onChange={(event) => setDateTo(event.target.value)}
          required
          type="date"
          value={dateTo}
        />
      </label>
      <AttendanceEmploymentPicker
        companyId={company.company?.id}
        label="Employees to calculate"
        multiple
        onChange={setEmploymentIds}
        value={employmentIds}
      />
      <Button
        disabled={!company.company || !employmentIds.length || calculation.isPending}
        type="submit"
      >
        Calculate
      </Button>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
