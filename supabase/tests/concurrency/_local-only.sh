# Sourced by every script here (Phase 15, brief §10): they create and delete fictional rows,
# so they refuse any database that is not on this machine (the CI's local stack is 127.0.0.1).
# Never point them at a hosted project, development or production.
case "${DB:-}" in
  *@localhost:*|*@localhost/*|*@127.0.0.1:*|*@127.0.0.1/*|*@\[::1\]:*|postgresql:///*|postgres:///*) ;;
  *) echo "refusing: $0 runs only against a local database (got a non-local URL)" >&2; exit 2 ;;
esac
