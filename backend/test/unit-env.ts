// A fixed key so encryption tests are deterministic; never a real one.
process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.JWT_SECRET = 'unit-test-secret';
delete process.env.ADMIN_REQUIRE_2FA;
