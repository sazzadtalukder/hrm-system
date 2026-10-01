import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createClaimCategory, getClaimCategories } from './api.js';
const field = 'w-full rounded-md border border-subtle p-2';
export function ClaimCategoriesPage() {
  const { permissions } = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const q = useQuery({
    queryKey: ['claim-categories', company.company?.id],
    queryFn: () => getClaimCategories(company.company.id),
    enabled: Boolean(company.company),
  });
  const create = useMutation({
    mutationFn: createClaimCategory,
    onSuccess: () => {
      setMessage('Claim category created.');
      client.invalidateQueries({ queryKey: ['claim-categories'] });
    },
    onError: (error) => setMessage(error.message),
  });
  if (company.isPending || q.isPending) return <LoadingState />;
  if (company.error || q.error) return <ErrorState error={company.error ?? q.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="font-semibold">Claim categories</h2>
        <ul className="mt-3 divide-y">
          {q.data.map((category) => (
            <li className="py-3" key={category.id}>
              <Link className="font-medium text-accent" to={`/claims/categories/${category.id}`}>
                {category.name} ({category.code})
              </Link>
              <p className="text-sm text-secondary">
                {category.record_status} ·{' '}
                {category.receipt_required ? 'receipt required' : 'receipt optional'}
                {category.maximum_item_amount
                  ? ` · maximum ${category.maximum_item_amount} ${category.currency_code}`
                  : ''}
              </p>
            </li>
          ))}
          {!q.data.length && <li className="py-3 text-secondary">No categories found.</li>}
        </ul>
      </section>
      {permissions.includes('claim_category.create') && (
        <form
          className="space-y-3 rounded-lg border border-subtle bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            create.mutate({
              companyId: company.company.id,
              code: data.get('code'),
              name: data.get('name'),
              description: data.get('description') || null,
              effectiveStart: data.get('start'),
              effectiveEnd: data.get('end') || null,
              receiptRequired: data.get('receipt') === 'on',
              maximumItemAmount: data.get('maximum') || null,
              currencyCode: company.company.currency_code,
              sensitiveClassification: data.get('sensitive'),
              reason: data.get('reason'),
            });
          }}
        >
          <h2 className="font-semibold">Create category</h2>
          <input className={field} name="code" placeholder="CATEGORY-CODE" required />
          <input className={field} name="name" placeholder="Category name" required />
          <textarea className={field} name="description" placeholder="Description (optional)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Effective from
              <input className={field} name="start" type="date" required />
            </label>
            <label className="text-sm">
              Effective through (optional)
              <input className={field} name="end" type="date" />
            </label>
          </div>
          <input className={field} name="maximum" placeholder="Maximum per item (optional)" />
          <label className="flex gap-2 text-sm">
            <input name="receipt" type="checkbox" />
            Receipt metadata required
          </label>
          <select className={field} name="sensitive">
            <option value="standard">Standard</option>
            <option value="sensitive">Sensitive</option>
          </select>
          <input className={field} name="reason" placeholder="Required reason" required />
          <Button disabled={create.isPending} type="submit">
            Create category
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
