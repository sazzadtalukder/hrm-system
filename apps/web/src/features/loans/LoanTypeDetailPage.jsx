import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createLoanTypeVersion, deactivateLoanType, getLoanType, updateLoanType } from './api.js';

const field = 'mt-1 w-full rounded-md border border-subtle p-2';
export function LoanTypeDetailPage() {
  const { id } = useParams();
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const q = useQuery({ queryKey: ['loan-type', id], queryFn: () => getLoanType(id) });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['loan-type', id] });
    client.invalidateQueries({ queryKey: ['loan-types'] });
  };
  const mutation = useMutation({
    mutationFn: ({ kind, body }) => {
      if (kind === 'update') return updateLoanType(id, body);
      if (kind === 'deactivate') return deactivateLoanType(id, body);
      return createLoanTypeVersion(id, body, kind === 'correction');
    },
    onSuccess: (_, variables) => {
      setMessage(
        variables.kind === 'update'
          ? 'Facility details updated.'
          : variables.kind === 'deactivate'
            ? 'Facility deactivated.'
            : 'Facility terms version created.',
      );
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  if (q.isPending || company.isPending) return <LoadingState />;
  if (q.error || company.error) return <ErrorState error={q.error ?? company.error} />;
  const type = q.data;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{type.name}</h2>
            <p className="text-secondary">
              {type.code} · {type.facility_kind.replaceAll('_', ' ')}
            </p>
            {type.description && <p className="mt-2">{type.description}</p>}
          </div>
          <StatusBadge status={type.record_status} />
        </div>
      </section>
      <section className="overflow-x-auto rounded-lg border border-subtle bg-surface p-6">
        <h3 className="font-semibold">Terms history</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Version</th>
              <th className="p-2">Effective</th>
              <th className="p-2">Principal</th>
              <th className="p-2">Term</th>
              <th className="p-2">Due day</th>
              <th className="p-2">Service</th>
              <th className="p-2">Active limit</th>
              <th className="p-2">History</th>
            </tr>
          </thead>
          <tbody>
            {type.versions.map((version) => (
              <tr className="border-t" key={version.id}>
                <td className="p-2">{version.version_number}</td>
                <td className="p-2">
                  {String(version.effective_start).slice(0, 10)} –{' '}
                  {version.effective_end ? String(version.effective_end).slice(0, 10) : 'open'}
                </td>
                <td className="p-2">
                  {version.minimum_principal}–{version.maximum_principal} {version.currency_code}
                </td>
                <td className="p-2">
                  {version.minimum_term_months}–{version.maximum_term_months} months
                </td>
                <td className="p-2">{version.installment_due_day}</td>
                <td className="p-2">{version.minimum_service_days ?? 0} days</td>
                <td className="p-2">{version.maximum_active_facilities}</td>
                <td className="p-2">{version.history_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        {permissions.includes('loan_type.update') && type.record_status === 'active' && (
          <form
            className="space-y-3 rounded-lg border border-subtle bg-surface p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.mutate({
                kind: 'update',
                body: {
                  name: data.get('name'),
                  description: data.get('description') || null,
                  version: type.version,
                },
              });
            }}
          >
            <h3 className="font-semibold">Update facility details</h3>
            <input className={field} defaultValue={type.name} name="name" required />
            <textarea className={field} defaultValue={type.description ?? ''} name="description" />
            <Button disabled={mutation.isPending} type="submit">
              Save details
            </Button>
          </form>
        )}
        {(permissions.includes('loan_type.version_create') ||
          permissions.includes('loan_type.correct_history')) &&
          type.record_status === 'active' && (
            <form
              className="space-y-3 rounded-lg border border-subtle bg-surface p-6"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const correction = data.get('correction') === 'on';
                mutation.mutate({
                  kind: correction ? 'correction' : 'version',
                  body: {
                    effectiveStart: data.get('start'),
                    effectiveEnd: data.get('end') || null,
                    currencyCode: company.company.currency_code,
                    minimumPrincipal: data.get('minimum'),
                    maximumPrincipal: data.get('maximum'),
                    minimumTermMonths: Number(data.get('minTerm')),
                    maximumTermMonths: Number(data.get('maxTerm')),
                    installmentDueDay: Number(data.get('dueDay')),
                    minimumServiceDays: data.get('service') ? Number(data.get('service')) : null,
                    maximumActiveFacilities: Number(data.get('active')),
                    sensitiveClassification: data.get('sensitive'),
                    reason: data.get('reason'),
                  },
                });
              }}
            >
              <h3 className="font-semibold">Create terms version</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={field} name="start" type="date" required />
                <input className={field} name="end" type="date" />
                <input className={field} name="minimum" placeholder="Minimum principal" required />
                <input className={field} name="maximum" placeholder="Maximum principal" required />
                <input
                  className={field}
                  name="minTerm"
                  min="1"
                  placeholder="Minimum months"
                  type="number"
                  required
                />
                <input
                  className={field}
                  name="maxTerm"
                  min="1"
                  placeholder="Maximum months"
                  type="number"
                  required
                />
                <input
                  className={field}
                  name="dueDay"
                  min="1"
                  max="31"
                  placeholder="Due day"
                  type="number"
                  required
                />
                <input
                  className={field}
                  name="service"
                  min="0"
                  placeholder="Minimum service days"
                  type="number"
                />
                <input
                  className={field}
                  name="active"
                  min="1"
                  placeholder="Maximum active facilities"
                  type="number"
                  required
                />
                <select className={field} name="sensitive">
                  <option value="sensitive">Sensitive</option>
                  <option value="standard">Standard</option>
                </select>
              </div>
              <input className={field} name="reason" placeholder="Required reason" required />
              {permissions.includes('loan_type.correct_history') && (
                <label className="flex gap-2 text-sm">
                  <input name="correction" type="checkbox" /> Authorized historical correction
                </label>
              )}
              <Button disabled={mutation.isPending} type="submit">
                Create version
              </Button>
            </form>
          )}
      </div>
      {permissions.includes('loan_type.deactivate') && type.record_status === 'active' && (
        <form
          className="space-y-3 rounded-lg border border-subtle bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = new FormData(event.currentTarget).get('reason');
            if (globalThis.confirm('Deactivate this facility for new applications?'))
              mutation.mutate({ kind: 'deactivate', body: { version: type.version, reason } });
          }}
        >
          <h3 className="font-semibold">Deactivate facility</h3>
          <input className={field} name="reason" placeholder="Required reason" required />
          <Button disabled={mutation.isPending} type="submit" variant="secondary">
            Deactivate
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
