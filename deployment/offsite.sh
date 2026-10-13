#!/bin/sh
# A receipt is published for monitoring only after encrypted remote verification succeeds.
set -eu
deploy_root=${INCEPT_DEPLOY_ROOT:-/srv/incept}
operator_user=${INCEPT_OPERATOR_USER:-incept}
operator_group=${INCEPT_OPERATOR_GROUP:-incept}
case "$deploy_root" in /*) ;; *) exit 1 ;; esac
test "$deploy_root" != /
cd "$deploy_root/current"
manifest=$(cat "$deploy_root/latest-backup-path")
test -n "$manifest"
backup=${manifest%/manifest.json}
node scripts/production-offsite.mjs --env-file "$deploy_root/.env.backup" --backup "$backup" --apply-retention
install -m 0640 -o "$operator_user" -g "$operator_group" "$backup/offsite-receipt.json" "$deploy_root/latest-offsite-receipt.json"
