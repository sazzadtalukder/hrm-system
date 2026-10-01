import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmActionDialog } from '../../components/ui/ConfirmActionDialog.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import {
  createBenefitPlanVersion,
  deactivateBenefitPlan,
  getBenefitPlan,
  updateBenefitPlan,
} from './api.js';

const field = 'w-full rounded-md border border-subtle p-2';
const types = ['permanent', 'contract', 'probationary', 'temporary', 'intern'];
const statuses = ['probation', 'confirmed'];
const values = (value) => (Array.isArray(value) ? value : JSON.parse(value ?? '[]'));

function TermsForm({ title, initial, onSubmit, pending }) {
  return (
    <form
      className="space-y-3 rounded-lg border border-subtle bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          effectiveStart: data.get('effectiveStart'),
          effectiveEnd: data.get('effectiveEnd') || null,
          employerContributionAmount: data.get('employer'),
          employeeContributionAmount: data.get('employee'),
          currencyCode: data.get('currency'),
          eligibleEmploymentTypes: data.getAll('employmentTypes'),
          eligibleEmploymentStatuses: data.getAll('employmentStatuses'),
          employeeVisible: data.get('employeeVisible') === 'on',
          sensitiveClassification: data.get('classification'),
          reason: data.get('reason'),
        });
      }}
    >
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Effective start
          <input className={field} name="effectiveStart" required type="date" />
        </label>
        <label className="text-sm">
          Effective end (optional)
          <input className={field} name="effectiveEnd" type="date" />
        </label>
      </div>
      <input
        className={field}
        defaultValue={initial?.employer_contribution_amount ?? ''}
        name="employer"
        placeholder="Employer monthly contribution"
        required
      />
      <input
        className={field}
        defaultValue={initial?.employee_contribution_amount ?? ''}
        name="employee"
        placeholder="Employee monthly contribution"
        required
      />
      <input
        className={field}
        defaultValue={initial?.currency_code ?? ''}
        maxLength="3"
        name="currency"
        placeholder="Currency"
        required
      />
      <fieldset className="rounded-md border border-subtle p-3">
        <legend className="px-1 text-sm">Eligible employment types</legend>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {types.map((value) => (
            <label className="flex items-center gap-2" key={value}>
              <input
                defaultChecked={values(initial?.eligible_employment_types).includes(value)}
                name="employmentTypes"
                type="checkbox"
                value={value}
              />
              {value}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-md border border-subtle p-3">
        <legend className="px-1 text-sm">Eligible statuses</legend>
        <div className="flex gap-4 text-sm">
          {statuses.map((value) => (
            <label className="flex items-center gap-2" key={value}>
              <input
                defaultChecked={values(initial?.eligible_employment_statuses).includes(value)}
                name="employmentStatuses"
                type="checkbox"
                value={value}
              />
              {value}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          defaultChecked={Boolean(initial?.employee_visible)}
          name="employeeVisible"
          type="checkbox"
        />
        Visible in Employee Self-Service
      </label>
      <select
        className={field}
        defaultValue={initial?.sensitive_classification}
        name="classification"
      >
        <option value="standard">Standard</option>
        <option value="sensitive">Sensitive</option>
      </select>
      <input className={field} name="reason" placeholder="Required reason" required />
      <Button disabled={pending} type="submit">
        {title}
      </Button>
    </form>
  );
}

export function BenefitPlanDetailPage() {
  const { id } = useParams();
  const { permissions } = useAuth();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [deactivationReason, setDeactivationReason] = useState('');
  const query = useQuery({ queryKey: ['benefits', 'plan', id], queryFn: () => getBenefitPlan(id) });
  const refresh = () => client.invalidateQueries({ queryKey: ['benefits', 'plan', id] });
  const mutate = useMutation({
    mutationFn: ({ kind, body }) =>
      kind === 'update'
        ? updateBenefitPlan(id, body)
        : kind === 'deactivate'
          ? deactivateBenefitPlan(id, body)
          : createBenefitPlanVersion(id, body, kind === 'correction'),
    onSuccess: (_data, variables) => {
      setMessage(
        variables.kind === 'update'
          ? 'Plan details updated.'
          : variables.kind === 'deactivate'
            ? 'Plan deactivated.'
            : variables.kind === 'correction'
              ? 'Historical correction recorded.'
              : 'Plan version created.',
      );
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const plan = query.data;
  const current = plan.versions.find((version) => version.history_status === 'current');
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="text-secondary">{plan.code}</p>
            {plan.description && <p className="mt-2">{plan.description}</p>}
          </div>
          <StatusBadge status={plan.record_status} />
        </div>
        {current && (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt>Employer contribution</dt>
              <dd>
                {current.employer_contribution_amount ?? 'Restricted'} {current.currency_code}
              </dd>
            </div>
            <div>
              <dt>Employee contribution</dt>
              <dd>
                {current.employee_contribution_amount ?? 'Restricted'} {current.currency_code}
              </dd>
            </div>
            <div>
              <dt>Classification</dt>
              <dd>{current.sensitive_classification}</dd>
            </div>
            <div>
              <dt>Employee visible</dt>
              <dd>{current.employee_visible ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h3 className="font-semibold">Version history</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Version</th>
                <th className="p-2">Effective period</th>
                <th className="p-2">Contributions</th>
                <th className="p-2">Eligibility</th>
                <th className="p-2">State</th>
              </tr>
            </thead>
            <tbody>
              {plan.versions.map((version) => (
                <tr className="border-t" key={version.id}>
                  <td className="p-2">{version.version_number}</td>
                  <td className="p-2">
                    {String(version.effective_start).slice(0, 10)} –{' '}
                    {version.effective_end ? String(version.effective_end).slice(0, 10) : 'Open'}
                  </td>
                  <td className="p-2">
                    {version.employer_contribution_amount ?? 'Restricted'} /{' '}
                    {version.employee_contribution_amount ?? 'Restricted'} {version.currency_code}
                  </td>
                  <td className="p-2">
                    {values(version.eligible_employment_types).join(', ')};{' '}
                    {values(version.eligible_employment_statuses).join(', ')}
                  </td>
                  <td className="p-2">{version.history_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {permissions.includes('benefit_plan.update') && plan.record_status === 'active' && (
          <form
            className="space-y-3 rounded-lg border border-subtle bg-surface p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutate.mutate({
                kind: 'update',
                body: {
                  version: plan.version,
                  name: data.get('name'),
                  description: data.get('description') || null,
                },
              });
            }}
          >
            <h3 className="font-semibold">Edit plan identity</h3>
            <input className={field} defaultValue={plan.name} name="name" required />
            <textarea className={field} defaultValue={plan.description ?? ''} name="description" />
            <Button disabled={mutate.isPending} type="submit">
              Save changes
            </Button>
          </form>
        )}
        {permissions.includes('benefit_plan.deactivate') && plan.record_status === 'active' && (
          <section className="space-y-3 rounded-lg border border-subtle bg-surface p-5">
            <h3 className="font-semibold">Deactivate plan</h3>
            <input
              className={field}
              onChange={(event) => setDeactivationReason(event.target.value)}
              placeholder="Required reason"
              value={deactivationReason}
            />
            <ConfirmActionDialog
              disabled={!deactivationReason || mutate.isPending}
              label="Deactivate plan"
              onConfirm={() =>
                mutate.mutate({
                  kind: 'deactivate',
                  body: { version: plan.version, reason: deactivationReason },
                })
              }
            />
          </section>
        )}
        {permissions.includes('benefit_plan.version_create') &&
          current &&
          plan.record_status === 'active' && (
            <TermsForm
              title="Create plan version"
              initial={current}
              pending={mutate.isPending}
              onSubmit={(body) => mutate.mutate({ kind: 'version', body })}
            />
          )}
        {permissions.includes('benefit_plan.correct_history') && current && (
          <TermsForm
            title="Record historical correction"
            initial={current}
            pending={mutate.isPending}
            onSubmit={(body) => mutate.mutate({ kind: 'correction', body })}
          />
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
