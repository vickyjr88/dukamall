import { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Emails are stored lowercase from now on. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

/**
 * Finds a user whatever case the email was typed or stored in. User.email is
 * unique, but only exactly -- so "Bob@x.com" and "bob@x.com" used to be two
 * different accounts, and an invite or signup typed in a different case created
 * a duplicate. Lookups are case-insensitive so older mixed-case rows still work.
 */
export function findUserByEmail(db: Db, email: string) {
  return db.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } } });
}
