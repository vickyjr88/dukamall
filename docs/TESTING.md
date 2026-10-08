# Testing

Backend tests live in `backend/test`. They protect the parts where a mistake costs
money or exposes another shop's data.

| What | Where | Needs |
|---|---|---|
| **Unit tests**: roles, suspension, "view as shop", host matching, signup rules, delivery fee, phone matching, secrets, two-factor codes, CSV safety, trial timing | `test/unit/*.spec.ts` | nothing |
| **Integration tests**: customer matching in SQL, checkout and manual-order totals and stock, suspension, support sessions, signup, admin sign-in, the trial check | `test/integration/*.int-spec.ts` | a throwaway Postgres |

```bash
cd backend
npm test                 # unit tests (seconds)
npm run test:int         # integration tests (needs TEST_DATABASE_URL, below)
npm run test:all
```

## Running the integration tests locally

They write to a real database, so they **refuse to run** unless `TEST_DATABASE_URL`
names a database ending in `_test`. Create one next to your dev database and migrate it:

```bash
docker exec <your-postgres-container> psql -U postgres -c "CREATE DATABASE shops_platform_test"
export TEST_DATABASE_URL="postgresql://postgres:<password>@localhost:<port>/shops_platform_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:int
```

Each test creates its own shops and removes them afterwards, so the database can be
reused. Run after adding a migration: `prisma migrate deploy` again.

## CI

- **Deploy** (`.github/workflows/deploy.yml`): on a push to `main` the `verify` job
  builds, runs the unit and integration tests against a Postgres service, and
  typechecks/builds the web app. **A failing test stops the deploy.**
- **CI** (`.github/workflows/ci.yml`): the same checks for pull requests and other
  branches.

## Adding tests

When you fix a bug in one of these areas, add a test that fails without the fix. A
quick way to check a test is worth having: temporarily break the code it covers and
confirm the test goes red.
