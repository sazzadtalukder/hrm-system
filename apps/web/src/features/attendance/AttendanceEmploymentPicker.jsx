import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getAttendanceEmploymentOptions } from './api.js';

export function AttendanceEmploymentPicker({
  companyId,
  label = 'Employee',
  multiple = false,
  onChange,
  value,
}) {
  const [search, setSearch] = useState('');
  const options = useQuery({
    queryKey: ['attendance', 'employment-options', companyId, search],
    queryFn: () => getAttendanceEmploymentOptions({ companyId, search, pageSize: 100 }),
    enabled: Boolean(companyId),
  });
  const selectedValues = multiple ? value.map(String) : String(value ?? '');

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        Find {label.toLowerCase()}
        <input
          className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by employee name, code, or employment ID"
          type="search"
          value={search}
        />
      </label>
      <label className="block text-sm font-medium">
        {label}
        <select
          className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
          disabled={options.isPending || Boolean(options.error)}
          multiple={multiple}
          onChange={(event) => {
            const ids = [...event.target.selectedOptions]
              .map((option) => Number(option.value))
              .filter(Number.isInteger);
            const selectedRows = options.data?.filter((row) => ids.includes(Number(row.id))) ?? [];
            onChange(multiple ? ids : (ids[0] ?? ''), multiple ? selectedRows : selectedRows[0]);
          }}
          required
          size={multiple ? 6 : undefined}
          value={selectedValues}
        >
          {!multiple ? <option value="">Select an employee</option> : null}
          {options.data?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.display_name} ({option.employee_code}) — Employment #{option.id}
            </option>
          ))}
        </select>
      </label>
      {multiple ? (
        <p className="text-xs text-secondary">Use Ctrl/Command to select more than one employee.</p>
      ) : null}
      {options.error ? (
        <p className="text-sm text-danger" role="alert">
          {options.error.message}
        </p>
      ) : null}
    </div>
  );
}
