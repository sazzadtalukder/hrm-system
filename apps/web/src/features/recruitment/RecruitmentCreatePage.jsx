import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, ForbiddenState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { recruitmentCreate } from './api.js';

const configs = {
  'manpower-plans': {
    title: 'Create manpower plan',
    createPermission: 'manpower_plan.create',
    fields: [
      ['code', 'Code'],
      ['name', 'Name'],
      ['periodStart', 'Period start', 'date'],
      ['periodEnd', 'Period end', 'date'],
      ['notes', 'Notes', 'textarea'],
    ],
  },
  requisitions: {
    title: 'Create requisition',
    createPermission: 'job_requisition.create',
    fields: [
      ['code', 'Code'],
      ['title', 'Title'],
      ['branchId', 'Branch ID', 'number'],
      ['departmentId', 'Department ID', 'number'],
      ['designationId', 'Designation ID', 'number'],
      ['requestedHeadcount', 'Headcount', 'number'],
      ['reason', 'Reason', 'textarea'],
    ],
  },
  postings: {
    title: 'Create job posting',
    createPermission: 'job_posting.create',
    fields: [
      ['jobRequisitionId', 'Requisition ID', 'number'],
      ['code', 'Code'],
      ['title', 'Title'],
      ['closesOn', 'Closing date', 'date'],
      ['channel', 'Channel'],
      ['description', 'Description', 'textarea'],
    ],
  },
  candidates: {
    title: 'Create candidate',
    createPermission: 'candidate.create',
    fields: [
      ['candidateNumber', 'Candidate number'],
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['email', 'Email', 'email'],
      ['phone', 'Phone'],
      ['profileSummary', 'Profile summary', 'textarea'],
    ],
  },
  applications: {
    title: 'Create application',
    createPermission: 'recruitment_application.create',
    fields: [
      ['candidateId', 'Candidate ID', 'number'],
      ['jobRequisitionId', 'Requisition ID', 'number'],
      ['jobPostingId', 'Posting ID', 'number'],
    ],
  },
  interviews: {
    title: 'Schedule interview',
    createPermission: 'recruitment_interview.create',
    fields: [
      ['candidateApplicationId', 'Application ID', 'number'],
      ['scheduledAt', 'Scheduled at', 'datetime-local'],
      ['durationMinutes', 'Duration minutes', 'number'],
    ],
  },
  assessments: {
    title: 'Assign assessment',
    createPermission: 'recruitment_assessment.create',
    fields: [
      ['candidateApplicationId', 'Application ID', 'number'],
      ['assessmentType', 'Assessment type'],
    ],
  },
  offers: {
    title: 'Create offer',
    createPermission: 'recruitment_offer.create',
    fields: [
      ['candidateApplicationId', 'Application ID', 'number'],
      ['offerNumber', 'Offer number'],
      ['employmentType', 'Employment type'],
      ['proposedJoiningDate', 'Joining date', 'date'],
      ['monthlyAmount', 'Monthly amount', 'number'],
      ['currencyCode', 'Currency'],
      ['branchId', 'Branch ID', 'number'],
      ['departmentId', 'Department ID', 'number'],
      ['designationId', 'Designation ID', 'number'],
      ['terms', 'Terms', 'textarea'],
    ],
  },
};
export function RecruitmentCreatePage({ resource }) {
  const company = useOrganizationCompany(),
    auth = useAuth(),
    nav = useNavigate(),
    config = configs[resource];
  const [values, setValues] = useState({ currencyCode: 'BDT', employmentType: 'probationary' });
  const mutation = useMutation({
    mutationFn: (body) => recruitmentCreate(resource, body),
    onSuccess: (data) => nav(`/recruitment/${resource}/${data.id}`),
  });
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const body = { companyId: company.company.id, idempotencyKey: crypto.randomUUID(), ...values };
    for (const key of Object.keys(body))
      if (/Id$/.test(key) && body[key] !== '' && body[key] != null) body[key] = Number(body[key]);
    if (body.requestedHeadcount) body.requestedHeadcount = Number(body.requestedHeadcount);
    if (body.durationMinutes) body.durationMinutes = Number(body.durationMinutes);
    if (body.scheduledAt) body.scheduledAt = new Date(body.scheduledAt).toISOString();
    mutation.mutate(body);
  };
  if (!config || company.isPending) return null;
  if (!auth.permissions.includes(config.createPermission)) return <ForbiddenState />;
  return (
    <section className="max-w-3xl">
      <h2 className="text-xl font-semibold">{config.title}</h2>
      <form
        className="mt-5 grid gap-4 rounded border bg-white p-5 sm:grid-cols-2"
        onSubmit={submit}
      >
        {config.fields.map(([key, label, type = 'text']) => (
          <label className={type === 'textarea' ? 'sm:col-span-2' : 'text-sm'} key={key}>
            {label}
            <>
              {type === 'textarea' ? (
                <textarea
                  className="mt-1 w-full rounded border p-2"
                  value={values[key] ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              ) : (
                <input
                  className="mt-1 w-full rounded border p-2"
                  type={type}
                  required={[
                    'code',
                    'name',
                    'title',
                    'firstName',
                    'lastName',
                    'candidateNumber',
                    'offerNumber',
                  ].includes(key)}
                  value={values[key] ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
            </>
          </label>
        ))}
        <div className="sm:col-span-2">
          <Button disabled={mutation.isPending}>Save draft</Button>
        </div>
        {mutation.error ? (
          <div className="sm:col-span-2">
            <ErrorState error={mutation.error} />
          </div>
        ) : null}
      </form>
    </section>
  );
}
