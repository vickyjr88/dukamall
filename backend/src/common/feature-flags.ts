/**
 * Switches that are set in the server's environment (and so changed by editing
 * the .env and restarting), not from the admin console.
 *
 * ADMIN_2FA_ENABLED -- the whole two-factor sign-in feature for platform admins.
 *   Off (the default): admins log in with email and password only, the Security
 *   page and the setup routes are unavailable, and nothing is enforced -- even for
 *   an admin who had already enrolled. Their enrolment is kept, and applies again
 *   when this is turned on.
 *   On: admins can enrol; an enrolled admin must give a code at every login.
 *
 * ADMIN_REQUIRE_2FA -- only meaningful when the above is on: every admin must
 *   enrol, and one who hasn't can reach nothing but the setup screen.
 */
const on = (name: string) => process.env[name]?.trim().toLowerCase() === 'true';

export const adminTwoFactorEnabled = (): boolean => on('ADMIN_2FA_ENABLED');
export const adminTwoFactorRequired = (): boolean => adminTwoFactorEnabled() && on('ADMIN_REQUIRE_2FA');
