export function StatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}
    >
      {status}
    </span>
  );
}
