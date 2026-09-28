/**
 * Creates (or promotes) a platform super-admin -- the one operator-level
 * account that can see and manage every shop on the platform.
 *
 * Deliberately NOT an HTTP endpoint. Every other account-creation path in
 * this app (onboarding/shops, customer-auth/register) is reachable over the
 * public API because the thing it creates is scoped to one shop -- a bug or
 * a compromised token there costs at most one shop's data. A super-admin
 * account has no such ceiling: it can list, suspend, or theme every shop on
 * the platform. Putting that behind a public route would mean the whole
 * platform's blast radius is one endpoint's worth of validation away from
 * total compromise. Running this script requires the same thing running
 * `prisma migrate deploy` already requires -- direct access to the server
 * and its DATABASE_URL -- which is the right bar for "can mint a
 * super-admin," not "knows an HTTP path and a password."
 *
 * Usage:
 *   npx ts-node scripts/create-super-admin.ts <email> <password> [firstName] [lastName]
 *
 * Idempotent: re-running with an existing email promotes that user to
 * isSuperAdmin (and updates the password) rather than failing on a unique
 * constraint -- useful for rotating the one admin password without a
 * separate "reset" code path that would itself need securing.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const [email, password, firstName, lastName] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npx ts-node scripts/create-super-admin.ts <email> <password> [firstName] [lastName]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      firstName: firstName || 'Admin',
      lastName: lastName || '',
      isSuperAdmin: true,
    },
    update: {
      passwordHash,
      isSuperAdmin: true,
    },
  });

  console.log(`Super-admin ready: ${user.email} (id ${user.id})`);
}

main()
  .catch((err) => {
    console.error('Failed to create super-admin:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
