import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';

const field = 'mt-1 w-full rounded-md border border-subtle bg-surface p-2';
const emptyEvidence = () => ({
  referenceType: 'external_reference',
  referenceValue: '',
  displayName: '',
});
const emptyItem = () => ({
  claimCategoryId: '',
  expenseDate: '',
  description: '',
  amount: '',
  merchantReference: '',
  evidence: [],
});

export function ClaimForm({ categories, employment, initial, submitLabel, pending, onSubmit }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title ?? '',
    businessPurpose: initial?.business_purpose ?? '',
    reason: '',
    items: initial?.items?.map((item) => ({
      claimCategoryId: String(item.claim_category_id),
      expenseDate: String(item.expense_date).slice(0, 10),
      description: item.description ?? '',
      amount: String(item.amount ?? ''),
      merchantReference: item.merchant_reference ?? '',
      evidence: (item.evidence ?? []).map((evidence) => ({
        referenceType: evidence.reference_type,
        referenceValue: evidence.reference_value,
        displayName: evidence.display_name,
      })),
    })) ?? [emptyItem()],
  }));
  const [validationError, setValidationError] = useState('');
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [String(category.id), category])),
    [categories],
  );
  const setValue = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const setItem = (index, name, value) =>
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [name]: value } : item,
      ),
    }));
  const setEvidence = (itemIndex, evidenceIndex, name, value) =>
    setForm((current) => ({
      ...current,
      items: current.items.map((item, index) =>
        index !== itemIndex
          ? item
          : {
              ...item,
              evidence: item.evidence.map((evidence, currentEvidenceIndex) =>
                currentEvidenceIndex === evidenceIndex ? { ...evidence, [name]: value } : evidence,
              ),
            },
      ),
    }));
  const total = form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const invalidEvidence = form.items.some(
          (item) =>
            categoryById.get(item.claimCategoryId)?.receipt_required && item.evidence.length === 0,
        );
        if (invalidEvidence) {
          setValidationError('Evidence is required for every receipt-required expense item.');
          return;
        }
        setValidationError('');
        onSubmit({
          title: form.title,
          businessPurpose: form.businessPurpose,
          reason: form.reason,
          items: form.items.map((item) => ({
            claimCategoryId: Number(item.claimCategoryId),
            expenseDate: item.expenseDate,
            description: item.description,
            amount: item.amount,
            merchantReference: item.merchantReference || null,
            evidence: item.evidence,
          })),
        });
      }}
    >
      {employment && (
        <div className="rounded-md border border-subtle bg-app p-3 text-sm">
          <span className="text-secondary">Claiming for</span>
          <p className="mt-1 font-medium">
            {employment.displayName} ({employment.employeeCode}) · Employment #{employment.id}
          </p>
        </div>
      )}
      <label className="block text-sm">
        Claim title
        <input
          className={field}
          maxLength={150}
          required
          value={form.title}
          onChange={(event) => setValue('title', event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Business purpose
        <textarea
          className={field}
          maxLength={500}
          required
          value={form.businessPurpose}
          onChange={(event) => setValue('businessPurpose', event.target.value)}
        />
      </label>
      <div className="space-y-4">
        {form.items.map((item, index) => {
          const category = categoryById.get(item.claimCategoryId);
          return (
            <fieldset className="space-y-3 rounded-lg border border-subtle p-4" key={index}>
              <div className="flex items-center justify-between gap-3">
                <legend className="font-medium">Expense item {index + 1}</legend>
                {form.items.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  Category
                  <select
                    className={field}
                    required
                    value={item.claimCategoryId}
                    onChange={(event) => setItem(index, 'claimCategoryId', event.target.value)}
                  >
                    <option value="">Select category</option>
                    {categories
                      .filter((value) => value.record_status === 'active')
                      .map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.name} ({value.code})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm">
                  Expense date
                  <input
                    className={field}
                    max={new Date().toISOString().slice(0, 10)}
                    required
                    type="date"
                    value={item.expenseDate}
                    onChange={(event) => setItem(index, 'expenseDate', event.target.value)}
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  Description
                  <input
                    className={field}
                    maxLength={500}
                    required
                    value={item.description}
                    onChange={(event) => setItem(index, 'description', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Amount
                  <input
                    className={field}
                    inputMode="decimal"
                    max={category?.maximum_item_amount ?? undefined}
                    min="0.01"
                    pattern="\d{1,17}(\.\d{1,2})?"
                    required
                    value={item.amount}
                    onChange={(event) => setItem(index, 'amount', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Merchant/reference (optional)
                  <input
                    className={field}
                    maxLength={150}
                    value={item.merchantReference}
                    onChange={(event) => setItem(index, 'merchantReference', event.target.value)}
                  />
                </label>
              </div>
              {category && (
                <p className="text-xs text-secondary">
                  {category.receipt_required ? 'Evidence is required.' : 'Evidence is optional.'}
                  {category.maximum_item_amount
                    ? ` Maximum ${category.maximum_item_amount} ${category.currency_code} per item.`
                    : ''}
                  {category.sensitive_classification === 'sensitive'
                    ? ' Sensitive details are permission-protected.'
                    : ''}
                </p>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Evidence references</p>
                  {item.evidence.length < 10 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setItem(index, 'evidence', [...item.evidence, emptyEvidence()])
                      }
                    >
                      Add evidence
                    </Button>
                  )}
                </div>
                {item.evidence.map((evidence, evidenceIndex) => (
                  <div
                    className="grid gap-2 rounded-md bg-app p-3 md:grid-cols-3"
                    key={evidenceIndex}
                  >
                    <select
                      className={field}
                      value={evidence.referenceType}
                      onChange={(event) =>
                        setEvidence(index, evidenceIndex, 'referenceType', event.target.value)
                      }
                    >
                      <option value="external_reference">External reference</option>
                      <option value="document_reference">Document reference</option>
                    </select>
                    <input
                      className={field}
                      maxLength={255}
                      placeholder="Reference value"
                      required
                      value={evidence.referenceValue}
                      onChange={(event) =>
                        setEvidence(index, evidenceIndex, 'referenceValue', event.target.value)
                      }
                    />
                    <div className="flex gap-2">
                      <input
                        className={field}
                        maxLength={150}
                        placeholder="Display name"
                        required
                        value={evidence.displayName}
                        onChange={(event) =>
                          setEvidence(index, evidenceIndex, 'displayName', event.target.value)
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setItem(
                            index,
                            'evidence',
                            item.evidence.filter((_, valueIndex) => valueIndex !== evidenceIndex),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {category?.receipt_required && item.evidence.length === 0 && (
                <p className="text-sm text-danger" role="alert">
                  Add evidence before saving this item.
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          disabled={form.items.length >= 50}
          type="button"
          variant="secondary"
          onClick={() =>
            setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))
          }
        >
          Add expense item
        </Button>
        <p className="font-medium">Draft total: {total.toFixed(2)}</p>
      </div>
      <label className="block text-sm">
        Change reason
        <input
          className={field}
          maxLength={500}
          required
          value={form.reason}
          onChange={(event) => setValue('reason', event.target.value)}
        />
      </label>
      {validationError && (
        <p className="text-sm text-danger" role="alert">
          {validationError}
        </p>
      )}
      <Button disabled={pending} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
