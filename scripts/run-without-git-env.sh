#!/bin/sh
# Unset GIT_* environment variables (e.g. GIT_INDEX_FILE, GIT_DIR set by the
# calling git hook) before running the given command, so nested or sibling
# repositories touched by that command are not affected:
# https://git-scm.com/docs/githooks
set -eu

for name in $(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  unset "$name"
done

exec "$@"
