"""Stream an isolated acceptance copy. Production connections are read-only."""
from contextlib import closing
import json
import os
import sqlite3
import subprocess
import sys
import tempfile

kind = sys.argv[1]
if kind == "sqlite":
    source = "/srv/incept/import-20261014/shared/sync/v4.db"
    handle, target = tempfile.mkstemp(prefix="incept-r5-readonly-", suffix=".db")
    os.close(handle)
    try:
        with closing(sqlite3.connect("file:" + source + "?mode=ro", uri=True)) as original:
            original.execute("PRAGMA query_only=ON")
            with closing(sqlite3.connect(target)) as copy:
                original.backup(copy)
                copy.execute("PRAGMA journal_mode=DELETE")
        with open(target, "rb") as copy:
            while True:
                block = copy.read(1024 * 1024)
                if not block:
                    break
                sys.stdout.buffer.write(block)
    finally:
        os.unlink(target)
elif kind == "postgres":
    container = json.loads(subprocess.check_output(["docker", "inspect", "incept-postgres-1"]))[0]
    env = dict(item.split("=", 1) for item in container["Config"]["Env"] if "=" in item)
    user = env.get("POSTGRES_USER", "postgres")
    database = env.get("POSTGRES_DB", user)
    subprocess.run(["docker", "exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on", "incept-postgres-1",
                    "pg_dump", "--format=custom", "--no-owner", "--no-acl", "--username", user, "--dbname", database],
                   stdout=sys.stdout.buffer, check=True)
else:
    raise ValueError("EXPORT_KIND_INVALID")
