#!/bin/sh
# Certbot deploy hook: copy the renewed certificate before validating and reloading Nginx.
set -eu
test -n "${RENEWED_LINEAGE:-}"
deploy_root=${INCEPT_DEPLOY_ROOT:-/srv/incept}
project=${INCEPT_COMPOSE_PROJECT:-incept}
cert_dir=${INCEPT_CERT_DIR:-$deploy_root/certificates}
case "$deploy_root:$cert_dir" in /*:/*) ;; *) exit 1 ;; esac
test "$deploy_root" != / && test "$cert_dir" != /
cd "$deploy_root/current"
domain=$(sed -n 's/^INCEPT_DOMAIN=//p' "$deploy_root/.env.production" | head -1 | tr -d '"\r')
test -n "$domain"
openssl x509 -in "$RENEWED_LINEAGE/fullchain.pem" -checkend 86400 -checkhost "$domain" -noout
openssl verify -trusted "$RENEWED_LINEAGE/fullchain.pem" -partial_chain -verify_hostname "$domain" "$RENEWED_LINEAGE/fullchain.pem"
certificate_key=$(openssl x509 -in "$RENEWED_LINEAGE/fullchain.pem" -pubkey -noout | openssl sha256)
private_key=$(openssl pkey -in "$RENEWED_LINEAGE/privkey.pem" -pubout | openssl sha256)
test "$certificate_key" = "$private_key"
previous_dir=$(mktemp -d "$cert_dir/.previous-XXXXXXXX")
cp -p "$cert_dir/fullchain.pem" "$previous_dir/fullchain.pem"
cp -p "$cert_dir/privkey.pem" "$previous_dir/privkey.pem"
install -m 0600 "$RENEWED_LINEAGE/fullchain.pem" "$cert_dir/fullchain.pem.next"
install -m 0600 "$RENEWED_LINEAGE/privkey.pem" "$cert_dir/privkey.pem.next"
mv "$cert_dir/fullchain.pem.next" "$cert_dir/fullchain.pem"
mv "$cert_dir/privkey.pem.next" "$cert_dir/privkey.pem"
compose() { docker compose --project-name "$project" --env-file "$deploy_root/.env.production" -f deployment/compose.production.yml "$@"; }
if ! compose exec -T proxy nginx -t || ! compose exec -T proxy nginx -s reload; then
  cp -p "$previous_dir/fullchain.pem" "$cert_dir/fullchain.pem"
  cp -p "$previous_dir/privkey.pem" "$cert_dir/privkey.pem"
  compose exec -T proxy nginx -t && compose exec -T proxy nginx -s reload || true
  exit 1
fi
rm -f "$previous_dir/fullchain.pem" "$previous_dir/privkey.pem"
rmdir "$previous_dir"
