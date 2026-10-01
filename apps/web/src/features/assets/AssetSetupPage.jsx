import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ErrorState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createAssetCategory } from './api.js';
export function AssetSetupPage() {
  const company = useOrganizationCompany();
  const [form, setForm] = useState({ code: '', name: '' });
  const mutation = useMutation({
    mutationFn: createAssetCategory,
    onSuccess: () => setForm({ code: '', name: '' }),
  });
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ companyId: company.company.id, ...form });
      }}
    >
      <h2 className="text-xl font-semibold">Asset category</h2>
      <label className="block">
        Code
        <input
          className="block w-full"
          required
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })}
        />
      </label>
      <label className="block">
        Name
        <input
          className="block w-full"
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      {mutation.error && <ErrorState error={mutation.error} />}
      <button
        className="rounded bg-accent px-4 py-2 text-white"
        disabled={!company.company || mutation.isPending}
      >
        Create category
      </button>
    </form>
  );
}
