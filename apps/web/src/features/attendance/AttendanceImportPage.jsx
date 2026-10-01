import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { importAttendanceJson } from './api.js';

export function AttendanceImportPage() {
  const company = useOrganizationCompany();
  const [rows, setRows] = useState(
    '[\n  {"employee_code":"", "event_type":"check_in", "occurred_at":"", "source_event_key":null}\n]',
  );
  const [message, setMessage] = useState('');
  const importer = useMutation({
    mutationFn: importAttendanceJson,
    onSuccess: (result) => setMessage(`Batch ${result.id}: ${result.status}`),
    onError: (error) => setMessage(error.message),
  });
  const submit = (event) => {
    event.preventDefault();
    try {
      const parsed = JSON.parse(rows);
      importer.mutate({
        companyId: company.company.id,
        idempotencyKey: globalThis.crypto.randomUUID(),
        sourceReference: 'web-import',
        rows: parsed,
      });
    } catch {
      setMessage('Enter a valid JSON array.');
    }
  };
  return (
    <form
      className="max-w-3xl space-y-4 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={submit}
    >
      <div>
        <h2 className="text-lg font-semibold">Import attendance events</h2>
        <p className="mt-1 text-sm text-secondary">
          Up to 10,000 bounded JSON rows. Timestamps require an explicit UTC offset or Z.
        </p>
      </div>
      <textarea
        aria-label="Attendance import rows"
        className="min-h-64 w-full rounded-md border border-subtle p-3 font-mono text-sm"
        onChange={(event) => setRows(event.target.value)}
        value={rows}
      />
      <Button disabled={!company.company || importer.isPending} type="submit">
        Import JSON
      </Button>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
