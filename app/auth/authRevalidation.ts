export const AUTH_REVALIDATION_LEEWAY_MS = 5 * 60 * 1000;
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Schedules a server revalidation shortly before the browser access token
 * expires. The server owns refresh credentials; this timer only asks protected
 * loaders to rotate the session in time.
 */
export function getAuthRevalidationDelay(
  expiresAt: string,
  now = Date.now(),
  leewayMs = AUTH_REVALIDATION_LEEWAY_MS
) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;

  return Math.min(
    MAX_BROWSER_TIMER_DELAY_MS,
    Math.max(0, expiry - now - leewayMs)
  );
}
