import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createClaim, getClaimCategories } from './api.js';
import { ClaimForm } from './ClaimForm.jsx';

export function ClaimCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const categories = useQuery({
    queryKey: ['claim-categories', company.company?.id],
    queryFn: () => getClaimCategories(company.company.id),
    enabled: Boolean(company.company),
  });
  const employees = useQuery({
    queryKey: ['claims', 'own-employment', company.company?.id],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: createClaim,
    onSuccess: (data) => navigate(`/claims/my/${data.id}`),
  });
  if (company.isPending || categories.isPending || employees.isPending) return <LoadingState />;
  if (company.error || categories.error || employees.error)
    return <ErrorState error={company.error ?? categories.error ?? employees.error} />;
  const employee = employees.data.items.find((item) => item.employment);
  const activeCategories = categories.data.filter(
    (category) => category.record_status === 'active',
  );
  if (!employee)
    return (
      <EmptyState message="Your user is not linked to an active employment. Ask HR to complete the employee-user link and employment setup." />
    );
  if (!activeCategories.length)
    return (
      <EmptyState message="No active claim category is available. Ask an authorized administrator to configure one." />
    );
  const employment = {
    id: employee.employment.id,
    displayName: employee.displayName,
    employeeCode: employee.employment.employeeCode,
  };
  return (
    <section className="mx-auto max-w-4xl rounded-lg border border-subtle bg-surface p-6">
      <h2 className="text-xl font-semibold">New expense claim</h2>
      <p className="mb-5 mt-1 text-sm text-secondary">
        Add up to 50 expense items. Monetary values use the company currency and evidence is stored
        as a document or external reference.
      </p>
      <ClaimForm
        categories={categories.data}
        employment={employment}
        pending={create.isPending}
        submitLabel="Save draft"
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
