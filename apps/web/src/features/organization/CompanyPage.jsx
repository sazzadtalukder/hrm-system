import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getCompany, updateCompany } from './api.js';
import { useOrganizationCompany } from './useOrganizationCompany.js';

export function CompanyPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const companies = useOrganizationCompany();
  const companyQuery = useQuery({
    queryKey: ['organization', 'company', companies.company?.id],
    queryFn: () => getCompany(companies.company.id),
    enabled: Boolean(companies.company),
  });
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: ({ id, body }) => updateCompany(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization', 'company'] }),
  });
  if (companies.isPending || companyQuery.isPending) return <LoadingState />;
  if (companies.error || companyQuery.error)
    return <ErrorState error={companies.error ?? companyQuery.error} />;
  const company = companyQuery.data;
  if (!company) return <ErrorState error={{ message: 'No company has been configured.' }} />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await mutation.mutateAsync({
        id: company.id,
        body: {
          version: company.version,
          name: data.get('name'),
          legalName: data.get('legalName') || null,
          countryCode: data.get('countryCode'),
          currencyCode: data.get('currencyCode'),
          timezone: data.get('timezone'),
          locale: data.get('locale'),
          email: data.get('email') || null,
          phone: data.get('phone') || null,
          addressLine1: data.get('addressLine1') || null,
          addressLine2: null,
          city: data.get('city') || null,
          postalCode: data.get('postalCode') || null,
        },
      });
    } catch (cause) {
      setError(cause.message);
    }
  }

  const editable = auth.permissions.includes('company.update');
  return (
    <form
      className="max-w-3xl rounded-lg border border-subtle bg-surface p-6 shadow-sm"
      onSubmit={submit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          ['Company name', 'name', company.name],
          ['Legal name', 'legalName', company.legal_name],
          ['Country', 'countryCode', company.country_code],
          ['Currency', 'currencyCode', company.currency_code],
          ['Timezone', 'timezone', company.timezone],
          ['Locale', 'locale', company.locale],
          ['Email', 'email', company.email],
          ['Phone', 'phone', company.phone],
          ['Address', 'addressLine1', company.address_line_1],
          ['City', 'city', company.city],
          ['Postal code', 'postalCode', company.postal_code],
        ].map(([label, field, value]) => (
          <label className="block text-sm font-medium" key={field}>
            {label}
            <input
              className="mt-2 w-full rounded-md border border-subtle px-3 py-2 disabled:bg-app"
              defaultValue={value ?? ''}
              disabled={!editable}
              name={field}
              required={['name', 'countryCode', 'currencyCode', 'timezone', 'locale'].includes(
                field,
              )}
            />
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {editable && (
        <Button className="mt-6" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Saving…' : 'Save company'}
        </Button>
      )}
    </form>
  );
}
