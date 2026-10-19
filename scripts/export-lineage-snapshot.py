"""Read-only evidence export. Run through SSH stdin; creates no remote files.

Endpoint is an operator-supplied assertion, not proof that a route exists.
Verify the tunnel destination and service identity separately before online use.
"""
import argparse
from contextlib import closing
import datetime
import json
from pathlib import Path
import sqlite3
import subprocess


def export_snapshot(container, endpoint, device_id):
    inspected = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
    env = dict(item.split("=", 1) for item in inspected["Config"]["Env"] if "=" in item)
    database_file = env.get("INCEPT_SYNC_DATABASE_FILE")
    if database_file != "/data/sync/v4.db" or env.get("INCEPT_SYNC_TRUSTED_MODE") != "1":
        raise ValueError("V4_TRUSTED_DATABASE_REQUIRED")
    mounts = [m for m in inspected["Mounts"] if database_file.startswith(m["Destination"].rstrip("/") + "/")]
    if not mounts:
        raise ValueError("DATABASE_MOUNT_REQUIRED")
    mount = max(mounts, key=lambda m: len(m["Destination"]))
    base = Path(mount["Source"]).resolve(strict=True)
    database_path = (base / database_file[len(mount["Destination"]):].lstrip("/")).resolve(strict=True)
    if not database_path.is_relative_to(base):
        raise ValueError("DATABASE_PATH_OUTSIDE_MOUNT")
    with closing(sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True)) as db:
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        rows = db.execute("SELECT s.head_manifest,s.head_generation,s.token_total,m.header_json FROM sync_scopes s LEFT JOIN sync_manifests m ON m.id=s.head_manifest ORDER BY s.scope_id").fetchall()
        scopes = []
        for manifest, generation, total, header_json in rows:
            header = json.loads(header_json)
            scope = header["manifest"]["scope"]
            if scope["deviceId"] != device_id:
                raise ValueError("REMOTE_DEVICE_MISMATCH")
            scopes.append({"scope": scope, "manifestHash": manifest, "generationId": generation, "tokenTotal": total})
        receipt_rows = db.execute("SELECT device_id,receipt_json FROM sync_receipts ORDER BY batch_id").fetchall()
        if any(row[0] != device_id for row in receipt_rows):
            raise ValueError("REMOTE_RECEIPT_DEVICE_MISMATCH")
        revision = db.execute("SELECT data_revision FROM sync_meta WHERE id=1").fetchone()[0]
        reviews = db.execute("SELECT COUNT(*) FROM sync_reviews").fetchone()[0]
        return {"version": 1, "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "service": {"deviceId": device_id, "endpoint": endpoint, "databaseFile": database_file, "imageId": inspected["Image"]},
                "evidence": {"container": container, "hostDatabaseFile": str(database_path), "reviewCount": reviews,
                             "trustedMode": env.get("INCEPT_SYNC_TRUSTED_MODE"), "readMode": env.get("INCEPT_SYNC_READ_MODE")},
                "dataRevision": revision, "tokenTotal": sum(row["tokenTotal"] for row in scopes),
                "scopes": scopes, "receipts": [json.loads(row[1]) for row in receipt_rows]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--device-id", required=True)
    args = parser.parse_args()
    print(json.dumps(export_snapshot(args.container, args.endpoint, args.device_id), separators=(",", ":")))
