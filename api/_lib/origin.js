// Files in /api that start with "_" are not exposed as Vercel functions.

// Reduce a value to "scheme://host[:port]". Returns null for anything that is not a
// plain http(s) origin (paths, query strings, credentials, other schemes, junk).
export function normalizeOrigin(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || /[?#\s]/.test(raw)) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.pathname !== '/') return null;
  return url.origin;
}

export function allowedOrigins(env = process.env) {
  return (env.APP_ORIGINS || '').split(',').map(normalizeOrigin).filter(Boolean);
}

// Origin to build links from, or null when nothing trustworthy is available.
// The request Origin is used only if it is in APP_ORIGINS or is same-origin with the Host header.
// Otherwise fall back to the first APP_ORIGINS entry, then (only when APP_ORIGINS is unset)
// to the Vercel production URL. The untrusted header value is never returned.
export function resolveTrustedOrigin(req, env = process.env) {
  const allowed = allowedOrigins(env);
  const requested = normalizeOrigin(req.headers?.origin);
  if (requested) {
    const host = String(req.headers?.host || '').trim().toLowerCase();
    if (allowed.includes(requested) || (host && new URL(requested).host === host)) return requested;
  }
  if (allowed.length) return allowed[0];
  if (!(env.APP_ORIGINS || '').trim() && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return normalizeOrigin(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return null;
}
