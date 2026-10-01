import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getOrganizationRecords } from '../organization/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createEmployee, getEmployees } from './api.js';

const fieldClass = 'mt-2 w-full rounded-md border border-subtle px-3 py-2';
export function EmployeeCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const organization = useQuery({
    queryKey: ['employee-form-organization', company.company?.id],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          [
            'branches',
            'departments',
            'designations',
            'grades',
            'cost-centers',
            'work-calendars',
          ].map(async (path) => [
            path,
            (await getOrganizationRecords(path, company.company.id)).items,
          ]),
        ),
      ),
    enabled: Boolean(company.company),
  });
  const managers = useQuery({
    queryKey: ['employee-form-managers', company.company?.id],
    queryFn: () =>
      getEmployees(company.company.id, {
        page: 1,
        pageSize: 100,
        recordStatus: 'active',
        sort: 'display_name',
        direction: 'asc',
      }),
    enabled: Boolean(company.company),
  });
  const mutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: (result) => navigate(`/employees/${result.id}`),
  });
  if (company.isPending || organization.isPending || managers.isPending) return <LoadingState />;
  if (company.error || organization.error || managers.error)
    return <ErrorState error={company.error ?? organization.error ?? managers.error} />;
  async function submit(event) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const optionalId = (name) => (data.get(name) ? Number(data.get(name)) : null);
    try {
      await mutation.mutateAsync({
        companyId: company.company.id,
        firstName: data.get('firstName'),
        middleName: data.get('middleName') || null,
        lastName: data.get('lastName'),
        preferredName: data.get('preferredName') || null,
        employeeCode: data.get('employeeCode'),
        employmentType: data.get('employmentType'),
        joiningDate: data.get('joiningDate'),
        initialStatus: data.get('initialStatus'),
        statusReason: data.get('reason'),
        assignment: {
          branchId: Number(data.get('branchId')),
          departmentId: Number(data.get('departmentId')),
          designationId: Number(data.get('designationId')),
          gradeId: optionalId('gradeId'),
          costCenterId: optionalId('costCenterId'),
          workCalendarId: optionalId('workCalendarId'),
          managerEmploymentId: optionalId('managerEmploymentId'),
          effectiveStart: data.get('joiningDate'),
          effectiveEnd: null,
          reason: data.get('reason'),
        },
      });
    } catch (cause) {
      setError(cause.message);
    }
  }
  const select = (name, label, items, required = false) => (
    <label className="text-sm font-medium">
      {label}
      <select className={fieldClass} name={name} required={required}>
        <option value="">{required ? 'Select…' : 'Not assigned'}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form className="rounded-lg border border-subtle bg-surface p-6" onSubmit={submit}>
      <h2 className="mb-5 text-xl font-semibold">Create employee</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">
          First name
          <input className={fieldClass} name="firstName" required />
        </label>
        <label className="text-sm font-medium">
          Middle name
          <input className={fieldClass} name="middleName" />
        </label>
        <label className="text-sm font-medium">
          Last name
          <input className={fieldClass} name="lastName" required />
        </label>
        <label className="text-sm font-medium">
          Preferred name
          <input className={fieldClass} name="preferredName" />
        </label>
        <label className="text-sm font-medium">
          Employee code
          <input className={fieldClass} name="employeeCode" pattern="[A-Za-z0-9_/-]+" required />
        </label>
        <label className="text-sm font-medium">
          Employment type
          <select className={fieldClass} name="employmentType" required>
            {['permanent', 'probationary', 'contractual', 'temporary', 'intern', 'part_time'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label className="text-sm font-medium">
          Joining date
          <input className={fieldClass} name="joiningDate" required type="date" />
        </label>
        <label className="text-sm font-medium">
          Initial status
          <select className={fieldClass} name="initialStatus">
            <option value="probation">Probation</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </label>
        {select('branchId', 'Branch', organization.data.branches, true)}
        {select('departmentId', 'Department', organization.data.departments, true)}
        {select('designationId', 'Designation', organization.data.designations, true)}
        {select('gradeId', 'Grade', organization.data.grades)}
        {select('costCenterId', 'Cost center', organization.data['cost-centers'])}
        {select('workCalendarId', 'Work calendar', organization.data['work-calendars'])}
        <label className="text-sm font-medium">
          Reporting manager
          <select className={fieldClass} name="managerEmploymentId">
            <option value="">No manager (top-level employee)</option>
            {managers.data.items
              .filter((employee) => employee.employment)
              .map((employee) => (
                <option key={employee.employment.id} value={employee.employment.id}>
                  {employee.displayName} ({employee.employment.employeeCode})
                </option>
              ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-secondary">
            Select the manager's active employment, or leave empty for the organization head.
          </span>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Reason
          <input className={fieldClass} name="reason" required />
        </label>
      </div>
      {error && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <Button className="mt-6" disabled={mutation.isPending} type="submit">
        {mutation.isPending ? 'Creating…' : 'Create employee'}
      </Button>
    </form>
  );
}
