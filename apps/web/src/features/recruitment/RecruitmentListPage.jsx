import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { recruitmentList } from './api.js';
const labels = {
  'manpower-plans': 'Manpower plans',
  requisitions: 'Requisitions',
  postings: 'Job postings',
  candidates: 'Candidates',
  applications: 'Applications',
  interviews: 'Interviews',
  assessments: 'Assessments',
  offers: 'Offers',
};
const createPermissions = {
  'manpower-plans': 'manpower_plan.create',
  requisitions: 'job_requisition.create',
  postings: 'job_posting.create',
  candidates: 'candidate.create',
  applications: 'recruitment_application.create',
  interviews: 'recruitment_interview.create',
  assessments: 'recruitment_assessment.create',
  offers: 'recruitment_offer.create',
};
export function RecruitmentListPage({ resource }) {
  const company = useOrganizationCompany(),
    auth = useAuth();
  const result = useQuery({
    queryKey: ['recruitment', resource, company.company?.id],
    queryFn: () => recruitmentList(resource, company.company.id),
    enabled: Boolean(company.company),
  });
  if (company.isPending || result.isPending) return <LoadingState />;
  if (company.error || result.error) return <ErrorState error={company.error ?? result.error} />;
  const title = labels[resource];
  return (
    <section>
      <header className="mb-5">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-slate-600">
          Track {title.toLowerCase()} and their current workflow status.
        </p>
        {auth.permissions.includes(createPermissions[resource]) ? (
          <Link
            className="mt-3 inline-block rounded bg-blue-700 px-3 py-2 text-sm text-white"
            to={`/recruitment/${resource}/new`}
          >
            Create {title.slice(0, -1)}
          </Link>
        ) : null}
      </header>
      {result.data.length ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Reference</th>
                <th className="p-3">Status</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr className="border-b" key={row.id}>
                  <td className="p-3">
                    <Link
                      className="text-blue-700 hover:underline"
                      to={`/recruitment/${resource}/${row.id}`}
                    >
                      {row.code ?? row.offer_number ?? row.candidate_number ?? `#${row.id}`}
                    </Link>
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-slate-100 px-2 py-1">{row.status}</span>
                  </td>
                  <td className="p-3">
                    {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded border border-dashed p-8 text-slate-600">
          No {title.toLowerCase()} found.
        </div>
      )}
    </section>
  );
}
