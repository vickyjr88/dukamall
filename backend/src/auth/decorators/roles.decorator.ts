import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'requiredRoles';

/**
 * Restricts a route (or a whole controller) to staff holding one of these
 * shop roles -- enforced by RolesGuard. A route with no @Roles() is open to
 * every member of the shop, so the default for a new route is "any staff
 * member"; anything that touches money, payment keys, the shop's identity,
 * pricing rules or bulk data has to opt in to OWNER explicitly.
 *
 * Before this existed the only OWNER-only actions were adding and removing
 * staff (checked by hand in PortalStaffService), so a cashier could change
 * the shop's Paystack keys -- redirecting its payments to another account --
 * delete products, connect a domain or read the revenue figures.
 */
export const Roles = (...roles: Array<'OWNER' | 'STAFF'>) => SetMetadata(ROLES_KEY, roles);
