import { isRouteErrorResponse, useRouteError } from 'react-router';

export function UnexpectedErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'The page could not be loaded.'
    : 'An unexpected error occurred.';

  return (
    <main className="mx-auto max-w-2xl px-4 py-16" role="alert">
      <p className="text-sm font-semibold text-danger">Application error</p>
      <h1 className="mt-2 text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-secondary">{message}</p>
      <a className="mt-6 inline-flex font-medium text-accent hover:underline" href="/">
        Reload the application
      </a>
    </main>
  );
}
