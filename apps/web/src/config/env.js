const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error('VITE_API_BASE_URL is required.');
}

let parsedApiBaseUrl;
try {
  parsedApiBaseUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('VITE_API_BASE_URL must be a valid absolute URL.');
}

if (
  !['http:', 'https:'].includes(parsedApiBaseUrl.protocol) ||
  parsedApiBaseUrl.username ||
  parsedApiBaseUrl.password ||
  parsedApiBaseUrl.search ||
  parsedApiBaseUrl.hash
) {
  throw new Error(
    'VITE_API_BASE_URL must use HTTP or HTTPS and must not contain credentials, a query, or a fragment.',
  );
}

const normalizedPath = parsedApiBaseUrl.pathname.replace(/\/+$/, '');
export const env = Object.freeze({
  apiBaseUrl: `${parsedApiBaseUrl.origin}${normalizedPath}`,
});
