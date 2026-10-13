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
compose() { docker compose --project-name "$project" --env-file "$deploy_root/.env.production" -f deployment/compose.production.yml "$@"; }
test -n "$(compose ps --status running --quiet app)"
trap 'compose up -d --wait app' EXIT
compose stop app
node scripts/production-backup.mjs --env-file "$deploy_root/.env.production" --project "$project" --output "$deploy_root/backups"
# Publish the newest completed manifest for the backup-age probe.
find "$deploy_root/backups" -mindepth 2 -maxdepth 2 -name manifest.json -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2- > "$deploy_root/latest-backup-path"
latest=$(cat "$deploy_root/latest-backup-path")
test -n "$latest"
install -m 0640 -o "$operator_user" -g "$operator_group" "$latest" "$deploy_root/latest-backup-manifest.json"
