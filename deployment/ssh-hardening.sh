#!/bin/bash
# Run prepare only through a verified public-key SSH connection; confirm from a new connection.
set -euo pipefail
umask 077
test "$(id -u)" = 0
test -n "${SSH_CONNECTION:-}"
target=/etc/ssh/sshd_config.d/000-incept-hardening.conf
mode=${1:-}

verify() {
  local client server client_port server_port effective
  read -r client client_port server server_port <<< "$SSH_CONNECTION"
  /usr/sbin/sshd -t
  effective=$(/usr/sbin/sshd -T -C "user=root,host=$client,addr=$client,laddr=$server,lport=$server_port")
  grep -qx 'passwordauthentication no' <<< "$effective"
  grep -qx 'kbdinteractiveauthentication no' <<< "$effective"
  grep -Eq '^permitrootlogin (prohibit-password|without-password)$' <<< "$effective"
  grep -qx 'pubkeyauthentication yes' <<< "$effective"
}

case "$mode" in
  prepare)
    /usr/sbin/sshd -t
    systemctl is-active --quiet ssh
    test -d /etc/ssh/sshd_config.d
    test ! -L "$target"
    state=$(mktemp -d /root/incept-ssh-hardening.XXXXXXXX)
    cp -a /etc/ssh/sshd_config "$state/sshd_config.reference"
    if test -e "$target"; then cp -a "$target" "$state/previous.conf"; fi
    unit="incept-ssh-rollback-${state##*.}"
    printf '%s\n' "$unit" > "$state/unit"
    cat > "$state/rollback.sh" <<'ROLLBACK'
#!/bin/bash
# Restore only this transaction's drop-in; keep the original main config and keys intact.
set -euo pipefail
state=$(dirname "$(readlink -f "$0")")
target=/etc/ssh/sshd_config.d/000-incept-hardening.conf
if test -e "$state/confirmed"; then exit 0; fi
if test -e "$state/previous.conf"; then
  cp -a "$state/previous.conf" "${target}.rollback"
  mv -f "${target}.rollback" "$target"
else
  rm -f -- "$target"
fi
/usr/sbin/sshd -t
systemctl reload ssh
date -Is > "$state/rolled-back"
ROLLBACK
    chmod 0700 "$state/rollback.sh"
    systemd-run --unit="$unit" --on-active=5m --timer-property=AccuracySec=1s "$state/rollback.sh"
    systemctl is-active --quiet "$unit.timer"
    trap '"$state/rollback.sh"; systemctl stop "$unit.timer"' ERR
    cat > "$state/new.conf" <<'CONFIG'
# Incept: root public-key login, with both password authentication paths disabled.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
CONFIG
    install -m 0600 -o root -g root "$state/new.conf" "${target}.pending"
    mv -f "${target}.pending" "$target"
    verify
    systemctl reload ssh
    systemctl is-active --quiet ssh
    trap - ERR
    printf 'STATE=%s\nROLLBACK_TIMER=%s.timer\n' "$state" "$unit"
    ;;
  confirm)
    state=${2:-}
    [[ "$state" =~ ^/root/incept-ssh-hardening\.[a-zA-Z0-9]{8}$ ]]
    test ! -L "$state"
    test "$(stat -c '%U:%a' "$state")" = root:700
    test ! -e "$state/rolled-back"
    unit=$(cat "$state/unit")
    [[ "$unit" = "incept-ssh-rollback-${state##*.}" ]]
    systemctl is-active --quiet "$unit.timer"
    verify
    date -Is > "$state/confirmed"
    systemctl stop "$unit.timer"
    /usr/sbin/sshd -T | sed -n '/^passwordauthentication /p; /^kbdinteractiveauthentication /p; /^permitrootlogin /p; /^pubkeyauthentication /p'
    printf 'CONFIRMED=%s\n' "$state"
    ;;
  *) echo 'Usage: ssh-hardening.sh prepare | confirm /root/incept-ssh-hardening.XXXXXXXX' >&2; exit 2 ;;
esac
