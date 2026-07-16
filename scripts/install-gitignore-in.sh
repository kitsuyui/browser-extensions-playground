#!/usr/bin/env bash
set -euo pipefail

version="${1:-v0.2.0}"
archive="gitignore-in-x86_64-unknown-linux-gnu-${version}.tar.gz"
url="https://github.com/gitignore-in/gitignore-in/releases/download/${version}/${archive}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

cd "${tmpdir}"
wget "${url}"
tar -xzf "${archive}"
install -m 0755 gitignore.in /usr/local/bin/gitignore.in
