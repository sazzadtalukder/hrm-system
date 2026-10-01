import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ErrorState } from '../../components/ui/PageState.jsx';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createAsset } from './api.js';
export function AssetCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    assetCategoryId: '',
    assetCode: '',
    name: '',
    serialNumber: '',
    currencyCode: 'BDT',
  });
  const mutation = useMutation({
    mutationFn: createAsset,
    onSuccess: ({ id }) => navigate(`/assets/all/${id}`),
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
          assetCategoryId: Number(form.assetCategoryId),
          serialNumber: form.serialNumber || null,
          acquiredOn: null,
          acquisitionCost: null,
        });
      }}
    >
      <h2 className="text-xl font-semibold">Register asset</h2>
      <label className="block">
        Category ID
        <input className="block w-full" required type="number" {...field('assetCategoryId')} />
      </label>
      <label className="block">
        Asset code
        <input className="block w-full" required {...field('assetCode')} />
      </label>
      <label className="block">
        Name
        <input className="block w-full" required {...field('name')} />
      </label>
      <label className="block">
        Serial number
        <input className="block w-full" {...field('serialNumber')} />
      </label>
      <label className="block">
        Currency
        <input className="block w-full" maxLength="3" required {...field('currencyCode')} />
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
