import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth/AuthContext.jsx';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await auth.login({ email: data.get('email'), password: data.get('password') });
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (cause) {
      setError(cause.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-app px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-subtle bg-surface p-8 shadow-sm"
        onSubmit={submit}
      >
        <h1 className="text-2xl font-semibold">Sign in to HRM</h1>
        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <label className="mt-6 block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <label className="mt-4 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          className="mt-2 w-full rounded-md border border-subtle px-3 py-2"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button
          className="mt-6 w-full rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
