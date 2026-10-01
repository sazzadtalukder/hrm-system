import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createLoan, getLoanTypes } from './api.js';
import { LoanApplicationForm } from './LoanApplicationForm.jsx';

export function LoanCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const types = useQuery({
    queryKey: ['loan-types', company.company?.id],
    queryFn: () => getLoanTypes(company.company.id),
    enabled: Boolean(company.company),
  });
  const employees = useQuery({
    queryKey: ['loans', 'own-employment', company.company?.id],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: createLoan,
    onSuccess: (result) => navigate(`/loans/my/${result.id}`),
  });
  if (company.isPending || types.isPending || employees.isPending) return <LoadingState />;
  if (company.error || types.error || employees.error)
    return <ErrorState error={company.error ?? types.error ?? employees.error} />;
  const employee = employees.data.items.find((item) => item.employment);
  if (!employee)
    return (
      <EmptyState message="Your user is not linked to an active employment. Ask HR to complete the employee-user and employment setup." />
    );
  if (!types.data.some((type) => type.record_status === 'active'))
    return <EmptyState message="No active loan or salary-advance facility is available." />;
  const employment = {
    id: employee.employment.id,
    displayName: employee.displayName,
    employeeCode: employee.employment.employeeCode,
  };
  return (
    <section className="mx-auto max-w-2xl rounded-lg border border-subtle bg-surface p-6">
      <h2 className="text-xl font-semibold">Apply for a loan or salary advance</h2>
      <p className="mb-5 mt-1 text-sm text-secondary">
        Phase 9 facilities are interest-free and use the company currency.
      </p>
      <LoanApplicationForm
        employment={employment}
        pending={create.isPending}
        submitLabel="Save draft"
        types={types.data}
        onSubmit={(payload) =>
          create.mutate({
            ...payload,
            companyId: company.company.id,
            employmentId: employment.id,
            currencyCode: company.company.currency_code,
          })
        }
      />
      {create.error && <ErrorState error={create.error} />}
    </section>
  );
}
