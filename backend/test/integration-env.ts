// Integration tests write to a real database, so refuse to run against anything
// that isn't clearly a throwaway one -- a typo here must never reach real data.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Point it at a dedicated, migrated database whose name ends in "_test".');
}
const dbName = new URL(url).pathname.replace(/^\//, '');
if (!dbName.endsWith('_test')) {
  throw new Error(`Refusing to run integration tests against "${dbName}": the database name must end in "_test".`);
}
process.env.DATABASE_URL = url;
process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.JWT_SECRET = 'integration-test-secret';
process.env.PLATFORM_DOMAIN = 'shops.test';
delete process.env.ADMIN_REQUIRE_2FA;
