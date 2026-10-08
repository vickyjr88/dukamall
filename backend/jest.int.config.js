// Integration tests: real Postgres. Needs TEST_DATABASE_URL pointing at a
// database whose name ends in "_test" (see test/integration-env.ts), already
// migrated with `prisma migrate deploy`. Run serially: tests share that database.
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  setupFiles: ['<rootDir>/test/integration-env.ts'],
  maxWorkers: 1,
  testTimeout: 30000,
};
