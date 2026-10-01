export function Button({ variant = 'primary', className = '', ...props }) {
  const style =
    variant === 'secondary'
      ? 'border border-subtle bg-surface text-primary hover:bg-app'
      : 'bg-accent text-white hover:opacity-90';
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${style} ${className}`}
      {...props}
    />
  );
}
