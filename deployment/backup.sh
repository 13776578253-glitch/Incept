#!/bin/sh
# A short maintenance window keeps PostgreSQL, SQLite and media in one consistent backup.
set -eu
deploy_root=${INCEPT_DEPLOY_ROOT:-/srv/incept}
project=${INCEPT_COMPOSE_PROJECT:-incept}
operator_user=${INCEPT_OPERATOR_USER:-incept}
operator_group=${INCEPT_OPERATOR_GROUP:-incept}
case "$deploy_root" in /*) ;; *) exit 1 ;; esac
test "$deploy_root" != /
cd "$deploy_root/current"
exec 9>"$deploy_root/backup.lock"
flock -n 9
compose() { sh deployment/compose.sh --project "$project" --env-file "$deploy_root/.env.production" "$@"; }
test -n "$(compose ps --status running --quiet app)"
trap 'compose up -d --wait app proxy' EXIT
compose stop app
proxy=$(awk -F= '/^INCEPT_PROXY=/{sub(/\r$/, "", $2); print $2}' "$deploy_root/.env.production")
if test "$proxy" = caddy; then compose stop proxy; fi
node scripts/production-backup.mjs --env-file "$deploy_root/.env.production" --project "$project" --output "$deploy_root/backups"
# Publish the newest completed manifest for the backup-age probe.
find "$deploy_root/backups" -mindepth 2 -maxdepth 2 -name manifest.json -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2- > "$deploy_root/latest-backup-path"
latest=$(cat "$deploy_root/latest-backup-path")
test -n "$latest"
install -m 0640 -o "$operator_user" -g "$operator_group" "$latest" "$deploy_root/latest-backup-manifest.json"
