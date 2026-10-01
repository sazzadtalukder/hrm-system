import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ErrorState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createDocumentType } from './api.js';
export function DocumentSetupPage() {
  const company = useOrganizationCompany();
  const [form, setForm] = useState({
    code: '',
    name: '',
    isSensitive: false,
    acknowledgmentRequired: false,
  });
  const mutation = useMutation({
    mutationFn: createDocumentType,
    onSuccess: () =>
      setForm({ code: '', name: '', isSensitive: false, acknowledgmentRequired: false }),
  });
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ companyId: company.company.id, ...form });
      }}
    >
      <h2 className="text-xl font-semibold">Document type</h2>
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
      <label>
        <input
          type="checkbox"
          checked={form.isSensitive}
          onChange={(event) => setForm({ ...form, isSensitive: event.target.checked })}
        />{' '}
        Sensitive
      </label>
      <label>
        <input
          type="checkbox"
          checked={form.acknowledgmentRequired}
          onChange={(event) => setForm({ ...form, acknowledgmentRequired: event.target.checked })}
        />{' '}
        Requires acknowledgment
      </label>
      {mutation.error && <ErrorState error={mutation.error} />}
      <button
        className="rounded bg-accent px-4 py-2 text-white"
        disabled={!company.company || mutation.isPending}
      >
        Create type
      </button>
    </form>
  );
}
