#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf '{"private":false}\n' > "$tmp/public.json"
printf '{"private":true}\n' > "$tmp/private.json"
printf '{"private":null}\n' > "$tmp/null.json"
printf '{}\n' > "$tmp/missing.json"
bash "$root/scripts/is-public-package.sh" "$tmp/public.json"
for value in private null missing; do
  if bash "$root/scripts/is-public-package.sh" "$tmp/$value.json"; then
    echo "Expected $value package to be excluded" >&2
    exit 1
  fi
done
