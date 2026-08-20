#!/bin/sh
# One image, two roles. SERVICE_ROLE picks which. `exec` matters: the shell is replaced by
# the process, so SIGTERM from a redeploy reaches the worker's shutdown handler directly
# rather than dying at an npm wrapper and stranding a claimed job.
set -e

case "${SERVICE_ROLE:-web}" in
  worker)
    exec node --import tsx scripts/worker.ts
    ;;
  web)
    node --import tsx scripts/migrate.ts
    exec ./node_modules/.bin/next start
    ;;
  *)
    echo "Unknown SERVICE_ROLE '${SERVICE_ROLE}'. Expected 'web' or 'worker'." >&2
    exit 1
    ;;
esac
