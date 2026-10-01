import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import {
  createClaimCategoryVersion,
  deactivateClaimCategory,
  getClaimCategory,
  updateClaimCategory,
} from './api.js';

const field = 'mt-1 w-full rounded-md border border-subtle p-2';
export function ClaimCategoryDetailPage() {
  const { id } = useParams();
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const q = useQuery({
    queryKey: ['claim-category', id],
    queryFn: () => getClaimCategory(id),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['claim-category', id] });
    client.invalidateQueries({ queryKey: ['claim-categories'] });
  };
  const mutation = useMutation({
    mutationFn: ({ kind, body }) => {
      if (kind === 'update') return updateClaimCategory(id, body);
      if (kind === 'deactivate') return deactivateClaimCategory(id, body);
      return createClaimCategoryVersion(id, body, kind === 'correction');
    },
    onSuccess: (_, variables) => {
      setMessage(
        variables.kind === 'deactivate'
          ? 'Category deactivated.'
          : variables.kind === 'update'
            ? 'Category details updated.'
            : 'Category version created.',
      );
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  if (q.isPending || company.isPending) return <LoadingState />;
  if (q.error || company.error) return <ErrorState error={q.error ?? company.error} />;
  const category = q.data;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{category.name}</h2>
            <p className="text-secondary">{category.code}</p>
            {category.description && <p className="mt-2">{category.description}</p>}
          </div>
          <StatusBadge status={category.record_status} />
        </div>
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h3 className="font-semibold">Version history</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Version</th>
                <th className="p-2">Effective period</th>
                <th className="p-2">Receipt</th>
                <th className="p-2">Maximum</th>
                <th className="p-2">Classification</th>
                <th className="p-2">History</th>
              </tr>
            </thead>
            <tbody>
              {category.versions.map((version) => (
                <tr className="border-t" key={version.id}>
                  <td className="p-2">{version.version_number}</td>
                  <td className="p-2">
                    {String(version.effective_start).slice(0, 10)} –{' '}
                    {version.effective_end ? String(version.effective_end).slice(0, 10) : 'open'}
                  </td>
                  <td className="p-2">{version.receipt_required ? 'Required' : 'Optional'}</td>
                  <td className="p-2">
                    {version.maximum_item_amount ?? 'No category maximum'} {version.currency_code}
                  </td>
                  <td className="p-2">{version.sensitive_classification}</td>
                  <td className="p-2">{version.history_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        {permissions.includes('claim_category.update') && category.record_status === 'active' && (
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
                  version: category.version,
                },
              });
            }}
          >
            <h3 className="font-semibold">Update category details</h3>
            <input className={field} defaultValue={category.name} name="name" required />
            <textarea
              className={field}
              defaultValue={category.description ?? ''}
              name="description"
            />
            <Button disabled={mutation.isPending} type="submit">
              Save details
            </Button>
          </form>
        )}
        {(permissions.includes('claim_category.version_create') ||
          permissions.includes('claim_category.correct_history')) &&
          category.record_status === 'active' && (
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
                    receiptRequired: data.get('receipt') === 'on',
                    maximumItemAmount: data.get('maximum') || null,
                    currencyCode: company.company.currency_code,
                    sensitiveClassification: data.get('sensitive'),
                    reason: data.get('reason'),
                  },
                });
              }}
            >
              <h3 className="font-semibold">Create terms version</h3>
              <input className={field} name="start" type="date" required />
              <input className={field} name="end" type="date" />
              <input className={field} name="maximum" placeholder="Maximum per item (optional)" />
              <label className="flex gap-2 text-sm">
                <input name="receipt" type="checkbox" /> Receipt required
              </label>
              <select className={field} name="sensitive">
                <option value="standard">Standard</option>
                <option value="sensitive">Sensitive</option>
              </select>
              <input className={field} name="reason" placeholder="Required reason" required />
              {permissions.includes('claim_category.correct_history') && (
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
      {permissions.includes('claim_category.deactivate') && category.record_status === 'active' && (
        <form
          className="space-y-3 rounded-lg border border-subtle bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = new FormData(event.currentTarget).get('reason');
            if (globalThis.confirm('Deactivate this category for future claim items?'))
              mutation.mutate({ kind: 'deactivate', body: { version: category.version, reason } });
          }}
        >
          <h3 className="font-semibold">Deactivate category</h3>
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
