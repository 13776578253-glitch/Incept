#!/bin/sh
# Exercise temporary user units and synthetic TLS alerts without installing production services.
set -eu
test "${INCEPT_TEST_DEPLOYMENT:-}" = 1
test "$(id -u)" != 0
node_bin=${INCEPT_VALIDATION_NODE:-$(command -v node)}
repo=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
fixture_root=$(mktemp -d /var/tmp/incept-readiness-systemd-XXXXXXXX)
units=$(basename "$fixture_root")
export INCEPT_VALIDATION_ROOT="$fixture_root"
umask 077
mkdir "$fixture_root/data" "$fixture_root/monitor"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1 -keyout "$fixture_root/receiver.key" -out "$fixture_root/receiver.pem" >/dev/null 2>&1
openssl rand -hex 32 > "$fixture_root/receiver-token"
printf '%s' '{"healthy":true}' > "$fixture_root/receiver-state.json"
"$node_bin" -e 'const fs=require("fs"),r=process.env.INCEPT_VALIDATION_ROOT,at=new Date().toISOString();fs.writeFileSync(r+"/manifest.json",JSON.stringify({createdAt:at}));fs.writeFileSync(r+"/offsite.json",JSON.stringify({version:1,snapshotId:"a".repeat(64),verifiedAt:at,backupCreatedAt:at}));'
cat > "$fixture_root/.env.monitor" <<EOF
INCEPT_HEALTH_URL=https://localhost:30344/api/health/ready
INCEPT_DATA_DIR=$fixture_root/data
INCEPT_LAST_BACKUP_MANIFEST=$fixture_root/manifest.json
INCEPT_LAST_OFFSITE_RECEIPT=$fixture_root/offsite.json
INCEPT_MONITOR_STATE_FILE=$fixture_root/monitor/state.json
INCEPT_ALERT_WEBHOOK_URL=https://localhost:30344/alerts
INCEPT_ALERT_BEARER_FILE=$fixture_root/receiver-token
NODE_EXTRA_CA_CERTS=$fixture_root/receiver.pem
EOF
trap 'systemctl --user stop "$units-monitor.timer" "$units-monitor.service" "$units-receiver.service" || true' EXIT
systemd-run --user --unit="$units-receiver" --property=Restart=on-failure --property=RestartSec=1s --setenv=INCEPT_TEST_DEPLOYMENT=1 --setenv=INCEPT_VALIDATION_ROOT="$fixture_root" "$node_bin" "$repo/deployment/validation/https-receiver.mjs"
systemd-run --user --unit="$units-monitor" --on-active=2s --on-unit-active=5s --timer-property=AccuracySec=100ms --property=Type=oneshot --property=EnvironmentFile="$fixture_root/.env.monitor" "$node_bin" "$repo/scripts/production-monitor.mjs"
sleep 4
systemctl --user is-active "$units-receiver.service"
printf '%s' '{"healthy":false}' > "$fixture_root/receiver-state.json"
sleep 12
"$node_bin" -e 'const e=JSON.parse(require("fs").readFileSync(process.env.INCEPT_VALIDATION_ROOT+"/received-events.json"));if(e.length!==1||e[0].check!=="health")throw Error("Failure deduplication failed");console.log("https_failure_delivered_once");'
printf '%s' '{"healthy":true}' > "$fixture_root/receiver-state.json"
sleep 7
"$node_bin" -e 'const e=JSON.parse(require("fs").readFileSync(process.env.INCEPT_VALIDATION_ROOT+"/received-events.json"));if(e.length!==2||e[1].status!=="recovered")throw Error("Recovery missing");console.log("https_recovery_delivered");'
"$node_bin" -e 'require("fs").writeFileSync(process.env.INCEPT_VALIDATION_ROOT+"/manifest.json",JSON.stringify({createdAt:new Date(Date.now()-48*3600000).toISOString()}));'
sleep 7
"$node_bin" -e 'const e=JSON.parse(require("fs").readFileSync(process.env.INCEPT_VALIDATION_ROOT+"/received-events.json"));if(e.at(-1).check!=="backup")throw Error("Stale backup not detected");console.log("stale_backup_delivered");'
"$node_bin" -e 'require("fs").writeFileSync(process.env.INCEPT_VALIDATION_ROOT+"/manifest.json",JSON.stringify({createdAt:new Date().toISOString()}));'
printf '\nINCEPT_DISK_MIN_FREE_PERCENT=99.99\n' >> "$fixture_root/.env.monitor"
sleep 7
"$node_bin" -e 'const e=JSON.parse(require("fs").readFileSync(process.env.INCEPT_VALIDATION_ROOT+"/received-events.json"));if(e.at(-1).check!=="disk")throw Error("Disk threshold not detected");console.log("disk_threshold_delivered_without_filling_disk");'
pid=$(systemctl --user show "$units-receiver.service" --property=MainPID --value)
test "$pid" -gt 1
kill -9 "$pid"
sleep 3
test "$(systemctl --user show "$units-receiver.service" --property=NRestarts --value)" -ge 1
systemctl --user restart "$units-receiver.service"
systemctl --user is-active "$units-receiver.service"
journalctl --user -u "$units-monitor.service" -u "$units-receiver.service" --no-pager > "$fixture_root/systemd-journal.log"
printf 'real_systemd_timer_restart_and_https_delivery_passed\nEvidence: %s\n' "$fixture_root"
