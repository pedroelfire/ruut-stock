/**
 * Clears the session cookie and lands on /login?expired=1. Server Components cannot delete cookies
 * and client code cannot see the httpOnly cookie, so both redirect here on a 401.
 */
export const EXPIRED_SESSION_PATH = '/api/auth/expired';
