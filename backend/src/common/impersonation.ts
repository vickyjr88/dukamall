import { ForbiddenException } from '@nestjs/common';

/** How long a platform admin's "view as shop" session lasts. Short on purpose: it is the owner's real login. */
export const IMPERSONATION_TTL_SECONDS = 60 * 60;

/**
 * Support can look around a merchant's portal and fix things for them, but
 * not change who the account is or who else has access -- those would outlive
 * the support session. Call this at the top of such an action.
 */
export function assertNotImpersonating(user: { impersonatedBy?: string | null } | undefined, what: string) {
  if (user?.impersonatedBy) {
    throw new ForbiddenException(`You can't ${what} while viewing this shop as platform support.`);
  }
}
