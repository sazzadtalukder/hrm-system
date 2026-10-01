export function parseCookies(request) {
  const header = request.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const separator = part.indexOf('=');
      const key = part.slice(0, separator).trim();
      const value = separator >= 0 ? part.slice(separator + 1).trim() : '';
      return [key, decodeURIComponent(value)];
    }),
  );
}

export function refreshCookieOptions(env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

export function clearRefreshCookieOptions(env) {
  const options = refreshCookieOptions(env);
  delete options.maxAge;
  return options;
}
