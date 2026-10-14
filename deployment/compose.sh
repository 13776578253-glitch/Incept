#!/bin/sh
# All production operations select the same proxy overlay and Compose project.
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
env_file=${INCEPT_ENV_FILE:-/srv/incept/.env.production}
project=${INCEPT_COMPOSE_PROJECT:-incept}
while test "$#" -gt 0; do
  case "$1" in
    --env-file) env_file=$2; shift 2 ;;
    --project) project=$2; shift 2 ;;
    *) break ;;
  esac
done
case "$env_file" in /*) ;; *) echo 'Use an absolute env file path.' >&2; exit 2 ;; esac
test -f "$env_file"
proxy=$(awk -F= '/^INCEPT_PROXY=/{sub(/\r$/, "", $2); print $2}' "$env_file")
proxy=${proxy:-nginx}
override=$(awk -F= '/^INCEPT_COMPOSE_OVERRIDE=/{sub(/\r$/, "", $2); print $2}' "$env_file")
if test -n "$override"; then
  case "$override" in /*) ;; *) echo 'Use an absolute override path.' >&2; exit 2 ;; esac
  test -f "$override"
  set -- -f "$override" "$@"
fi
case "$proxy" in
  caddy) set -- -f "$repo/deployment/compose.caddy.yml" "$@" ;;
  nginx) ;;
  *) echo 'INCEPT_PROXY must be caddy or nginx.' >&2; exit 2 ;;
esac
exec docker compose --project-name "$project" --env-file "$env_file" -f "$repo/deployment/compose.production.yml" "$@"
