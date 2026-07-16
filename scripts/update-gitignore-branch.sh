#!/usr/bin/env bash
set -euo pipefail

base_branch="${1:-main}"
update_branch="${2:-gitignore-in}"

if ! git diff --name-only -- .gitignore | grep -q .; then
  echo "changed=false" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 0
fi

if ! git diff -- .gitignore \
  | grep '^[+-][^+-]' \
  | grep -vq -e '^[+-][[:space:]]*#' -e '^$'; then
  echo "changed=false" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 0
fi

echo "changed=true" >> "${GITHUB_OUTPUT:-/dev/stdout}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git checkout -B "${update_branch}"
git add .gitignore
git commit -m "Update .gitignore by gitignore.in"
git push --force-with-lease origin "${update_branch}"

pr_url="$(
  gh pr list \
    --head "${update_branch}" \
    --base "${base_branch}" \
    --state open \
    --json url \
    --jq '.[0].url // ""'
)"

echo "pr_url=${pr_url}" >> "${GITHUB_OUTPUT:-/dev/stdout}"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## gitignore.in update"
    echo
    echo "- branch: \`${update_branch}\`"
    if [ -n "${pr_url}" ]; then
      echo "- pull request: ${pr_url}"
    else
      echo "- pull request: not open"
      echo "- next step: create a PR from \`${update_branch}\` to \`${base_branch}\`"
    fi
  } >> "${GITHUB_STEP_SUMMARY}"
fi
