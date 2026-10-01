export function LoadingState() {
  return (
    <div className="rounded-lg border border-subtle bg-surface p-8 text-secondary">Loading…</div>
  );
}

export function EmptyState({ message = 'No records found.' }) {
  return (
    <div className="rounded-lg border border-dashed border-subtle bg-surface p-10 text-center text-secondary">
      {message}
    </div>
  );
}

export function ErrorState({ error }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-danger" role="alert">
      {error?.message ?? 'The data could not be loaded.'}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-8" role="alert">
      <h1 className="text-xl font-semibold text-primary">Access denied</h1>
      <p className="mt-2 text-secondary">You are not authorized to open this page.</p>
    </div>
  );
}
