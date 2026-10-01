import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="max-w-xl" aria-labelledby="not-found-title">
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 id="not-found-title" className="mt-2 text-3xl font-semibold">
        Page not found
      </h1>
      <p className="mt-3 text-secondary">The requested page does not exist.</p>
      <Link className="mt-6 inline-flex font-medium text-accent hover:underline" to="/">
        Return to the foundation page
      </Link>
    </section>
  );
}
