#!/usr/bin/env bash

set -euo pipefail

[[ "$#" -eq 1 ]] || { printf '%s\n' "usage: munjib-deploy <40-char-sha>" >&2; exit 64; }
deploy_sha=$1
[[ "$deploy_sha" =~ ^[a-f0-9]{40}$ ]] || { printf '%s\n' "invalid deploy sha" >&2; exit 64; }

IFS= read -r deploy_token
[[ -n "$deploy_token" ]] || { printf '%s\n' "deploy token required on stdin" >&2; exit 64; }

repo_dir=/home/deployer/munjib
env_file=/etc/munjib/env
secret_dir=/etc/munjib/secrets
state_dir=/var/lib/munjib/deploy
state_file=/var/lib/munjib/deploy/current-sha
lock_file=/run/lock/munjib-deploy.lock
health_url=http://127.0.0.1:3000
health_host=munjib.example.invalid
public_health_url=https://munjib.example.invalid

exec 9>"$lock_file"
flock -n 9 || { printf '%s\n' "deployment already in progress" >&2; exit 75; }

[[ -d "$repo_dir/.git" ]] || { printf '%s\n' "production checkout missing" >&2; exit 69; }
[[ -r "$env_file" ]] || { printf '%s\n' "production env missing" >&2; exit 69; }
[[ -r "$secret_dir/nextauth-current" ]] || { printf '%s\n' "NextAuth secret missing" >&2; exit 69; }

install -d -o root -g root -m 0755 "$state_dir"
[[ -s "$state_file" ]] || { printf '%s\n' "current deployment state not bootstrapped" >&2; exit 69; }

git_auth_header="$(printf 'x-access-token:%s' "$deploy_token" | base64 | tr -d '\n')"
deploy_token=

sudo -u ubuntu git -C "$repo_dir" \
  -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $git_auth_header" \
  fetch --force "https://github.com/dschoi30/munjib.git" "main:refs/remotes/origin/main"
git_auth_header=

sudo -u ubuntu git -C "$repo_dir" merge-base --is-ancestor "$deploy_sha" origin/main
sudo -u ubuntu git -C "$repo_dir" checkout --detach "$deploy_sha"
[[ "$(sudo -u ubuntu git -C "$repo_dir" rev-parse HEAD)" == "$deploy_sha" ]]

compose_files=(-f docker-compose.yml)
google_client_id="$({
  awk -v key=GOOGLE_CLIENT_ID '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      value=$0
      sub("^[[:space:]]*" key "[[:space:]]*=[[:space:]]*", "", value)
      sub("[[:space:]]*(#.*)?$", "", value)
      single=sprintf("%c", 39)
      if ((substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") ||
          (substr(value, 1, 1) == single && substr(value, length(value), 1) == single)) {
        value=substr(value, 2, length(value)-2)
      }
      sub("^[[:space:]]*", "", value)
      sub("[[:space:]]*$", "", value)
      print value
      exit
    }
  ' "$env_file"
} 2>/dev/null)"

if [[ -n "$google_client_id" ]]; then
  [[ -r "$secret_dir/google-client-current" ]] || {
    printf '%s\n' "Google OAuth configured but secret missing" >&2
    exit 69
  }
  compose_files+=(-f docker-compose.google.yml)
fi
google_client_id=

cd "$repo_dir"
web_image="munjib-web:$deploy_sha"

env WEB_IMAGE="$web_image" SENTRY_RELEASE="$deploy_sha" NEXT_PUBLIC_SENTRY_RELEASE="$deploy_sha" \
  docker compose "${compose_files[@]}" --env-file "$env_file" build web tools

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  --profile auth-preflight run --rm --no-deps auth-preflight pnpm security:auth-preflight

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  --profile auth-preflight rm --force --stop auth-preflight

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  run --rm tools pnpm exec prisma migrate deploy

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  run --rm tools pnpm run db:rag:index

env WEB_IMAGE="$web_image" SENTRY_RELEASE="$deploy_sha" NEXT_PUBLIC_SENTRY_RELEASE="$deploy_sha" \
  docker compose "${compose_files[@]}" --env-file "$env_file" up -d web

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error --location --max-time 20 \
    --header "Host: $health_host" "$health_url" >/dev/null; then
    break
  fi
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 3
done

curl --fail --silent --show-error --location --max-time 20 \
  "$public_health_url" >/dev/null

state_tmp="$(mktemp "$state_dir/.current-sha.XXXXXX")"
trap 'rm -f "${state_tmp:-}"' EXIT
printf '%s\n' "$deploy_sha" >"$state_tmp"
chown root:root "$state_tmp"
chmod 0444 "$state_tmp"
mv -f "$state_tmp" "$state_file"
state_tmp=

docker image prune -f
printf 'deployed_sha=%s\n' "$deploy_sha"
