#!/bin/sh
#
# Container entrypoint. Applies pending migrations before the app is allowed
# to listen, same reasoning as drip-crm's own entrypoint: a container can
# start outside the deploy script (host reboot, crash restart), and this
# makes "the process is up" mean "the schema is current" regardless of how it
# started.

set -eu

echo "==> Applying database migrations"

attempt=1
max_attempts="${MIGRATE_RETRIES:-10}"
delay="${MIGRATE_RETRY_DELAY:-3}"

until npx prisma migrate deploy; do
  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "Migrations failed after ${max_attempts} attempts; refusing to start." >&2
    exit 1
  fi
  echo "migrate deploy failed (attempt ${attempt}/${max_attempts}); retrying in ${delay}s" >&2
  attempt=$((attempt + 1))
  sleep "${delay}"
done

echo "==> Migrations up to date"
echo "==> Starting backend"

exec "$@"
