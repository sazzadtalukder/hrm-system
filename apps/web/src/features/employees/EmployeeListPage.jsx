import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getEmployees } from './api.js';

export function EmployeeListPage() {
  const auth = useAuth();
  const company = useOrganizationCompany();
  const [search, setSearch] = useState('');
  const employees = useQuery({
    queryKey: ['employees', company.company?.id, search],
    queryFn: () => getEmployees(company.company.id, { search }),
    enabled: Boolean(company.company),
  });
  if (company.isPending || employees.isPending) return <LoadingState />;
  if (company.error || employees.error)
    return <ErrorState error={company.error ?? employees.error} />;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm font-medium">
          Search employees
          <input
            className="ml-3 rounded-md border border-subtle px-3 py-2"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or employee code"
            value={search}
          />
        </label>
        {auth.permissions.includes('employee.create') && (
          <Link className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white" to="new">
            Add employee
          </Link>
        )}
      </div>
      {!employees.data?.items.length ? (
        <EmptyState message="No employees found." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-subtle bg-app text-secondary">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Employment</th>
                <th className="px-4 py-3">Record</th>
              </tr>
            </thead>
            <tbody>
              {employees.data.items.map((employee) => (
                <tr className="border-b border-subtle last:border-0" key={employee.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-accent hover:underline"
                      to={String(employee.id)}
                    >
                      {employee.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{employee.employment?.employeeCode ?? '—'}</td>
                  <td className="px-4 py-3">
                    {employee.employment?.employmentStatus ? (
                      <StatusBadge status={employee.employment.employmentStatus} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={employee.recordStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {employees.data?.pagination && (
        <p className="mt-3 text-sm text-secondary">{employees.data.pagination.total} employee(s)</p>
      )}
    </div>
  );
}
