// Shared auth stubbing for the test suite.
//
// The app is gated behind a login screen (v4.8.0+). These helpers put a fake
// session in place before the app boots and answer the auth endpoints, so each
// suite can go on testing the behavior it actually cares about. Nothing here
// contacts the real auth service.

const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const FAKE_SESSION = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  // Far future so nothing tries to refresh mid-test.
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  user: { id: uuid(7), email: 'test-coach@example.com', aud: 'authenticated', role: 'authenticated' },
};

/**
 * Seed a signed-in session before any page script runs. Must be called before
 * the first goto; it re-applies on every navigation and reload.
 */
export async function stubAuth(page) {
  await page.addInitScript((session) => {
    try {
      localStorage.setItem('hpd_auth', JSON.stringify(session));
      localStorage.setItem('hpd_signed_in_before', '1');
    } catch (e) { /* private mode */ }
  }, FAKE_SESSION);
}

/** True when the request is an auth endpoint the stub should answer. */
export const isAuthRoute = (url) => url.includes('/auth/v1/');

/** Fulfill an auth request. Pass the same headers object the suite uses. */
export function fulfillAuth(route, url, headers) {
  if (url.includes('/auth/v1/logout')) {
    return route.fulfill({ status: 204, headers, body: '' });
  }
  if (url.includes('/auth/v1/user')) {
    return route.fulfill({ status: 200, headers, body: JSON.stringify(FAKE_SESSION.user) });
  }
  // token, refresh, everything else
  return route.fulfill({ status: 200, headers, body: JSON.stringify(FAKE_SESSION) });
}
