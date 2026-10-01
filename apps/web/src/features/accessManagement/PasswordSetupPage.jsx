import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { apiRequest } from '../../lib/api/client.js';

export function PasswordSetupPage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  const [error, setError] = useState('');
  useEffect(() => {
    window.history.replaceState({}, document.title, '/set-password');
  }, []);
  const validation = useQuery({
    queryKey: ['password-setup-validation', token],
    queryFn: async () =>
      (
        await apiRequest('/auth/password-setup/validate', {
          method: 'POST',
          body: { token },
          skipAuthRefresh: true,
        })
      ).data,
    enabled: Boolean(token),
    retry: false,
  });
  const completion = useMutation({
    mutationFn: (newPassword) =>
      apiRequest('/auth/password-setup/complete', {
        method: 'POST',
        body: { token, newPassword },
        skipAuthRefresh: true,
      }),
    onError: (cause) => setError(cause.message),
  });

  if (!token)
    return <ErrorState error={{ message: 'The password setup link is invalid or has expired.' }} />;
  if (validation.isPending) return <LoadingState />;
  if (validation.error || !validation.data?.valid)
    return <ErrorState error={{ message: 'The password setup link is invalid or has expired.' }} />;
  if (completion.isSuccess)
    return (
      <main className="mx-auto mt-20 max-w-md rounded-lg border border-subtle bg-surface p-8">
        <h1 className="text-2xl font-semibold">Password created</h1>
        <p className="mt-2 text-secondary">Your account is ready. Sign in normally.</p>
        <Link className="mt-5 inline-block text-accent underline" to="/login">
          Continue to sign in
        </Link>
      </main>
    );

  return (
    <main className="mx-auto mt-20 max-w-md rounded-lg border border-subtle bg-surface p-8">
      <h1 className="text-2xl font-semibold">Set your password</h1>
      <p className="mt-2 text-secondary">
        Choose a private password containing at least {validation.data.passwordMinLength}{' '}
        characters.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          const form = new FormData(event.currentTarget);
          const password = form.get('password');
          if (password !== form.get('confirmation')) {
            setError('The passwords do not match.');
            return;
          }
          completion.mutate(password);
        }}
      >
        <label className="block text-sm font-medium">
          New password
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-subtle px-3 py-2"
            minLength={validation.data.passwordMinLength}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="block text-sm font-medium">
          Confirm password
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-subtle px-3 py-2"
            minLength={validation.data.passwordMinLength}
            name="confirmation"
            required
            type="password"
          />
        </label>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button disabled={completion.isPending} type="submit">
          {completion.isPending ? 'Saving…' : 'Set password'}
        </Button>
      </form>
    </main>
  );
}
