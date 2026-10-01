import { useState } from 'react';
import { Button } from './Button.jsx';

const fieldClass = 'mt-1 w-full rounded-md border border-subtle bg-surface px-3 py-2';

export function ActionDialog({
  title,
  description = 'This action will be recorded in history.',
  confirmLabel = 'Confirm',
  fields = [{ name: 'reason', label: 'Reason', type: 'textarea', maxLength: 500 }],
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ''])),
  );
  return (
    <div
      aria-labelledby="action-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-lg border border-subtle bg-surface p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(values);
        }}
      >
        <h2 className="text-lg font-semibold" id="action-dialog-title">
          {title}
        </h2>
        <p className="mt-2 text-sm text-secondary">{description}</p>
        <div className="mt-4 space-y-3">
          {fields.map((field) => {
            const shared = {
              className: fieldClass,
              maxLength: field.maxLength,
              minLength: field.minLength,
              name: field.name,
              onChange: (event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value })),
              required: field.required !== false,
              value: values[field.name],
            };
            return (
              <label className="block text-sm font-medium" key={field.name}>
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea {...shared} rows={3} />
                ) : (
                  <input {...shared} type={field.type ?? 'text'} />
                )}
              </label>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={busy} onClick={onCancel} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            {busy ? 'Saving…' : confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
