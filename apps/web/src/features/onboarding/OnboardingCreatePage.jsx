import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState } from '../../components/ui/PageState.jsx';
import { apiRequest } from '../../lib/api/client.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';

export function OnboardingCreatePage({ template = false }) {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const [values, setValues] = useState({});
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(template ? '/onboarding/templates' : '/onboarding/cases', {
        method: 'POST',
        body: template
          ? {
              companyId: company.company.id,
              code: values.code,
              name: values.name,
              description: values.description || null,
              idempotencyKey: crypto.randomUUID(),
            }
          : {
              companyId: company.company.id,
              recruitmentHireConversionId: Number(values.recruitmentHireConversionId),
              onboardingTemplateVersionId: Number(values.onboardingTemplateVersionId),
              idempotencyKey: crypto.randomUUID(),
            },
      }),
    onSuccess: (response) =>
      navigate(template ? '/onboarding/templates' : `/onboarding/cases/${response.data.id}`),
  });
  if (company.isPending) return null;
  return (
    <section className="max-w-xl">
      <h2 className="text-xl font-semibold">
        {template ? 'Create onboarding template' : 'Create onboarding case'}
      </h2>
      <form
        className="mt-5 grid gap-4 rounded border bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {template ? (
          <>
            <label className="text-sm">
              Code
              <input
                required
                className="mt-1 w-full rounded border p-2"
                value={values.code ?? ''}
                onChange={(event) => setValues({ ...values, code: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Name
              <input
                required
                className="mt-1 w-full rounded border p-2"
                value={values.name ?? ''}
                onChange={(event) => setValues({ ...values, name: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Description
              <textarea
                className="mt-1 w-full rounded border p-2"
                value={values.description ?? ''}
                onChange={(event) => setValues({ ...values, description: event.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <label className="text-sm">
              Recruitment conversion ID
              <input
                required
                min="1"
                type="number"
                className="mt-1 w-full rounded border p-2"
                value={values.recruitmentHireConversionId ?? ''}
                onChange={(event) =>
                  setValues({ ...values, recruitmentHireConversionId: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Active template version ID
              <input
                required
                min="1"
                type="number"
                className="mt-1 w-full rounded border p-2"
                value={values.onboardingTemplateVersionId ?? ''}
                onChange={(event) =>
                  setValues({ ...values, onboardingTemplateVersionId: event.target.value })
                }
              />
            </label>
          </>
        )}
        <Button disabled={mutation.isPending}>
          {template ? 'Create template' : 'Create case'}
        </Button>
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
      </form>
    </section>
  );
}
