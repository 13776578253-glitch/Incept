import collections
import json
import re
import subprocess
import sys

since = sys.argv[1]


def read_logs(container):
    result = subprocess.run(
        ["docker", "logs", "--since", since, container],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True,
    )
    for line in result.stdout.splitlines():
        try:
            yield line, json.loads(line)
        except ValueError:
            yield line, None


def route_group(path):
    if path.startswith("/api/dashboard/sync/"):
        return "dashboard-sync"
    if path.startswith("/api/internal/sync/"):
        return "internal-sync"
    if path.startswith("/api/"):
        return "dashboard-usage" if path == "/api/dashboard/usage" else "other-api"
    if re.fullmatch(r"/(en|zh)/(about|docs|dashboard|roadmap|settings)", path):
        return path.split("/")[-1]
    if re.fullmatch(r"/(en|zh)/docs/[^/]+", path):
        return "docs-article"
    return "other"


def project(record, fields):
    return {key: record.get(key) for key in fields.split()}


node_samples, proxy_samples = [], []
node_errors, proxy_errors = 0, 0
status = collections.Counter()
server_failures = []
proxy_error_reasons = collections.Counter()
for line, entry in read_logs("incept-app-1"):
    if isinstance(entry, dict) and entry.get("event") == "navigation_timing":
        node_samples.append(project(entry, "requestId route status receivedAt headersMs firstWriteMs lastWriteMs totalMs phases bytes prefetch finished"))
    elif re.search(r"\b(?:error|exception|fatal)\b", line, re.I):
        node_errors += 1

for line, entry in read_logs("incept-proxy-1"):
    if not isinstance(entry, dict):
        continue
    if entry.get("level") == "error":
        proxy_errors += 1
        message = str(entry.get("msg", "")).lower()
        reason = next((name for name in ["context canceled", "connection refused", "timeout", "broken pipe", "connection reset", "tls"] if name in message), "other")
        proxy_error_reasons[reason] += 1
    if str(entry.get("logger", "")).startswith("http.log.access.") and isinstance(entry.get("status"), int):
        group = route_group(entry.get("safe_uri", ""))
        status[f"{group}/{entry['status']}"] += 1
        if entry["status"] >= 500:
            safe_uri = entry.get("safe_uri", "")
            known = {"/api/health/ready", "/api/health/live", "/api/auth/owner/state", "/api/music/tracks", "/api/dashboard/usage",
                     "/api/dashboard/sync/usage", "/api/dashboard/sync/status", "/api/dashboard/sync/devices/status",
                     "/api/dashboard/sync/health", "/api/dashboard/sync/healthz"}
            sync_class = re.fullmatch(r"/api/dashboard/sync/(agent/jobs|jobs|batches|devices|reviews|scopes)(?:/[^/]+)?(?:/(start|complete|commit|pages)(?:/\d+)?)?", safe_uri)
            server_failures.append({"group": group, "path": safe_uri if safe_uri in known else ("/".join(part for part in sync_class.groups() if part) if sync_class else None),
                                    "method": entry.get("request", {}).get("method"), **project(entry, "ts status duration upstream_headers_ms")})
        if group != "other" and entry.get("request_id"):
            proxy_samples.append({"group": group, **project(entry, "request_id ts duration upstream_headers_ms upstream_duration_ms status size")})

print(json.dumps({"since": since, "nodeErrors": node_errors, "proxyErrors": proxy_errors, "status": status,
                  "serverFailures": server_failures, "proxyErrorReasons": proxy_error_reasons,
                  "node": node_samples, "proxy": proxy_samples}, separators=(",", ":")))
