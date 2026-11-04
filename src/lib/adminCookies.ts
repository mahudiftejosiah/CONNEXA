// Pure helpers, safe for both the edge bundle and server actions.
//
// Both cookies are tagged with the signed-in user id so they expire the moment
// somebody else signs in: a stale "admin" or "I'm browsing the site" marker can
// never leak across accounts.

export const ROLE_COOKIE = "cx_admin_role";
export const VIEW_COOKIE = "cx_admin_view";

const ADMIN = "admin";
const USER = "user";
const SITE = "site";

export const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24,
  sameSite: "lax",
  httpOnly: true,
} as const;

export function roleCookieValue(userId: string, isAdmin: boolean) {
  return `${userId.slice(0, 8)}:${isAdmin ? ADMIN : USER}`;
}

/** "1" only when this cookie was written for the current user and says admin. */
export function cookieSaysAdmin(value: string | undefined, userId: string) {
  return value === roleCookieValue(userId, true);
}

export function viewCookieValue(userId: string) {
  return `${userId.slice(0, 8)}:${SITE}`;
}

/** True when the admin explicitly asked to look at the public site. */
export function cookieSaysSite(value: string | undefined, userId: string) {
  return value === viewCookieValue(userId);
}
