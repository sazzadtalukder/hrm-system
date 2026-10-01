import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { onboardingList } from './api.js';
export function OnboardingListPage({ templates = false, own = false }) {
  const company = useOrganizationCompany();
  const result = useQuery({
    queryKey: ['onboarding', templates, own, company.company?.id],
    queryFn: () =>
      onboardingList(templates ? 'templates' : own ? 'cases/my' : 'cases', company.company.id),
    enabled: Boolean(company.company),
  });
  if (company.isPending || result.isPending) return <LoadingState />;
  if (company.error || result.error) return <ErrorState error={company.error ?? result.error} />;
  const title = templates ? 'Onboarding templates' : own ? 'My onboarding' : 'Onboarding cases';
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      {!own ? (
        <Link
          className="mt-3 inline-block rounded bg-blue-700 px-3 py-2 text-sm text-white"
          to={templates ? '/onboarding/templates/new' : '/onboarding/cases/new'}
        >
          {templates ? 'Create template' : 'Create case'}
        </Link>
      ) : null}
      {result.data.length ? (
        <div className="mt-4 divide-y rounded border bg-white">
          {result.data.map((row) => (
            <Link
              className="block p-3 hover:bg-slate-50"
              key={row.id}
              to={
                templates
                  ? `/onboarding/templates/${row.id}`
                  : own
                    ? `/onboarding/my/${row.id}`
                    : `/onboarding/cases/${row.id}`
              }
            >
              {row.code ?? `Case #${row.id}`}{' '}
              <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs">{row.status}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded border border-dashed p-8 text-slate-600">
          No {title.toLowerCase()} found.
        </p>
      )}
    </section>
  );
}
