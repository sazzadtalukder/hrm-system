import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';

const field = 'mt-1 w-full rounded-md border border-subtle bg-surface p-2';
export function LoanApplicationForm({
  types,
  employment,
  initial,
  pending,
  submitLabel,
  onSubmit,
}) {
  const [form, setForm] = useState({
    loanFacilityTypeId: String(initial?.loan_facility_type_id ?? ''),
    requestedPrincipal: String(initial?.requested_principal ?? ''),
    requestedTermMonths: String(initial?.requested_term_months ?? ''),
    purpose: initial?.purpose ?? '',
    reason: '',
  });
  const type = useMemo(
    () => types.find((value) => String(value.id) === form.loanFacilityTypeId),
    [form.loanFacilityTypeId, types],
  );
  const set = (event) =>
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          loanFacilityTypeId: Number(form.loanFacilityTypeId),
          requestedPrincipal: form.requestedPrincipal,
          requestedTermMonths: Number(form.requestedTermMonths),
          purpose: form.purpose,
          reason: form.reason,
        });
      }}
    >
      {employment && (
        <div className="rounded-md border border-subtle bg-app p-3 text-sm">
          <span className="text-secondary">Applying for</span>
          <p className="mt-1 font-medium">
            {employment.displayName} ({employment.employeeCode}) · Employment #{employment.id}
          </p>
        </div>
      )}
      <label className="block text-sm">
        Facility
        <select
          className={field}
          name="loanFacilityTypeId"
          required
          value={form.loanFacilityTypeId}
          onChange={set}
        >
          <option value="">Select facility</option>
          {types
            .filter((value) => value.record_status === 'active')
            .map((value) => (
              <option key={value.id} value={value.id}>
                {value.name} ({value.facility_kind.replaceAll('_', ' ')})
              </option>
            ))}
        </select>
      </label>
      {type && (
        <div className="rounded-md bg-app p-3 text-sm text-secondary">
          Principal: {type.minimum_principal}–{type.maximum_principal} {type.currency_code} · Term:{' '}
          {type.minimum_term_months}–{type.maximum_term_months} months · Due day:{' '}
          {type.installment_due_day}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Requested principal
          <input
            className={field}
            inputMode="decimal"
            max={type?.maximum_principal ?? undefined}
            min={type?.minimum_principal ?? '0.01'}
            name="requestedPrincipal"
            pattern="\d{1,17}(\.\d{1,2})?"
            required
            value={form.requestedPrincipal}
            onChange={set}
          />
        </label>
        <label className="text-sm">
          Repayment term (months)
          <input
            className={field}
            max={type?.maximum_term_months ?? undefined}
            min={type?.minimum_term_months ?? 1}
            name="requestedTermMonths"
            required
            type="number"
            value={form.requestedTermMonths}
            onChange={set}
          />
        </label>
      </div>
      <label className="block text-sm">
        Purpose
        <textarea
          className={field}
          maxLength={500}
          name="purpose"
          required
          value={form.purpose}
          onChange={set}
        />
      </label>
      <label className="block text-sm">
        Change reason
        <input
          className={field}
          maxLength={500}
          name="reason"
          required
          value={form.reason}
          onChange={set}
        />
      </label>
      <Button disabled={pending} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
