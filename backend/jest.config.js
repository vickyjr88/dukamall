// Unit tests: pure logic and guards with the database mocked. Fast, no services needed.
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  setupFiles: ['<rootDir>/test/unit-env.ts'],
};
