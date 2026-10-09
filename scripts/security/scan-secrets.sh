#!/usr/bin/env bash
set -euo pipefail
umask 077

mode="${1:-history}"
if [[ "$#" -gt 1 || ( "$mode" != history && "$mode" != staged ) ]]; then
  printf 'Usage: bash scripts/security/scan-secrets.sh [history|staged]\n' >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
scanner="${GITLEAKS_BIN:-gitleaks}"
if ! command -v "$scanner" >/dev/null 2>&1; then
  printf 'Install Gitleaks 8.30.1 or set GITLEAKS_BIN to its executable path.\n' >&2
  exit 2
fi
if [[ "$("$scanner" version)" != 8.30.1 ]]; then
  printf 'This scan requires Gitleaks 8.30.1 for reproducible results.\n' >&2
  exit 2
fi

report_dir="$(mktemp -d "${TMPDIR:-/tmp}/munjib-secret-scan.XXXXXX")"
args=(git --redact=100 --no-banner --no-color --report-format=json
  "--report-path=$report_dir/findings.json"
  "--gitleaks-ignore-path=$repo_root/.gitleaksignore")
if [[ "$mode" == history ]]; then
  args+=(--log-opts=--all)
else
  args+=(--pre-commit --staged)
fi

result=0
"$scanner" "${args[@]}" "$repo_root" || result=$?
printf 'Redacted secret-scan report: %s/findings.json\n' "$report_dir"
exit "$result"
