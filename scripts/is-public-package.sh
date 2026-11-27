#!/usr/bin/env bash
set -euo pipefail

# Publish only packages explicitly marked public; missing and null are private.
jq -e '.private == false' "${1:?package.json path required}" >/dev/null
