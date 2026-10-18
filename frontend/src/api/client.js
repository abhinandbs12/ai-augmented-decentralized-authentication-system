// All server calls go through here: same-origin cookies, JSON, the CSRF header on POST, and errors
// normalized to ApiError.

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = details.retryAfter ?? null;
    this.errorId = details.errorId ?? null;
    this.fieldErrors = details.fieldErrors ?? [];
  }
}

const handlers = { onSessionEnded: () => {}, onAccessDenied: () => {} };

/** AuthContext registers what happens when a protected call answers 401 or 403. */
export function configureApi(next) {
  Object.assign(handlers, next);
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchCsrfToken() {
  await fetch('/api/auth/csrf', { credentials: 'same-origin' });
}

/** Makes sure the browser holds a CSRF token cookie. The server rotates it at login and logout. */
export async function ensureCsrfToken() {
  if (!csrfToken()) await fetchCsrfToken();
}

async function request(method, path, body, { quiet = false, retried = false } = {}) {
  const headers = {};
  if (method === 'POST') {
    await ensureCsrfToken();
    headers['X-XSRF-TOKEN'] = csrfToken() ?? '';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
  }

  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }

  // A proxy or gateway may answer with a non-JSON body when the backend is down.
  const error = await response.json().catch(() => ({}));
  if (error.code === 'CSRF_INVALID' && !retried) {
    await fetchCsrfToken();
    return request(method, path, body, { quiet, retried: true });
  }
  // A 401 from the sign-in endpoints means "these credentials were refused", not "your session ended".
  // The step-up endpoint is the exception: it needs a session, so a 401 there means the session ended.
  const signInEndpoint = path.startsWith('/api/auth/') && path !== '/api/auth/step-up';
  if (response.status === 401 && !quiet && !signInEndpoint) {
    handlers.onSessionEnded();
  }
  if (error.code === 'ACCESS_DENIED') {
    handlers.onAccessDenied();
  }
  throw new ApiError(response.status, error.code ?? 'UNKNOWN', error.message ?? 'Something went wrong.', {
    retryAfter: Number(response.headers.get('Retry-After')) || null,
    errorId: error.errorId,
    fieldErrors: error.fieldErrors,
  });
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body) => request('POST', path, body),
};
