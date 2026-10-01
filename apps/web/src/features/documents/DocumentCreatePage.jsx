import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ErrorState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createDocument } from './api.js';
export function DocumentCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    documentTypeId: '',
    documentCode: '',
    title: '',
    audience: 'company',
    referenceType: 'external_reference',
    referenceValue: '',
    effectiveOn: new Date().toISOString().slice(0, 10),
    reason: '',
  });
  const mutation = useMutation({
    mutationFn: createDocument,
    onSuccess: ({ id }) => navigate(`/documents/all/${id}`),
  });
  const field = (name) => ({
    value: form[name],
    onChange: (event) => setForm({ ...form, [name]: event.target.value }),
  });
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({
          companyId: company.company.id,
          ...form,
          documentTypeId: Number(form.documentTypeId),
          branchId: null,
          departmentId: null,
          employmentId: null,
          fileName: null,
          mimeType: null,
          checksumSha256: null,
          expiresOn: null,
          idempotencyKey: crypto.randomUUID(),
        });
      }}
    >
      <h2 className="text-xl font-semibold">New document</h2>
      <label className="block">
        Document type ID
        <input className="block w-full" required type="number" {...field('documentTypeId')} />
      </label>
      <label className="block">
        Code
        <input className="block w-full" required {...field('documentCode')} />
      </label>
      <label className="block">
        Title
        <input className="block w-full" required {...field('title')} />
      </label>
      <label className="block">
        Reference
        <input className="block w-full" required {...field('referenceValue')} />
      </label>
      <label className="block">
        Reason
        <input className="block w-full" required {...field('reason')} />
      </label>
      {mutation.error && <ErrorState error={mutation.error} />}
      <button
        className="rounded bg-accent px-4 py-2 text-white"
        disabled={!company.company || mutation.isPending}
      >
        Create
      </button>
    </form>
  );
}
