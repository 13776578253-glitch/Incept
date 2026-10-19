import hashlib
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("lineage_export", Path(__file__).with_name("export-lineage-snapshot.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExportTests(unittest.TestCase):
    def setUp(self):
        # Use the writable workspace output on Windows sandboxed runtimes.
        output = Path(__file__).resolve().parents[1] / "output"
        output.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="lineage-export-test-", dir=output)
        self.root = Path(self.temp.name)
        (self.root / "sync").mkdir()
        self.path = self.root / "sync" / "v4.db"
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript("CREATE TABLE sync_scopes(scope_id TEXT,head_manifest TEXT,head_generation TEXT,token_total INTEGER);"
                             "CREATE TABLE sync_manifests(id TEXT,header_json TEXT);"
                             "CREATE TABLE sync_receipts(device_id TEXT,batch_id TEXT,receipt_json TEXT);"
                             "CREATE TABLE sync_meta(id INTEGER,data_revision INTEGER); CREATE TABLE sync_reviews(id TEXT);")
            header = {"manifest": {"scope": {"deviceId": "test-device", "source": "codex", "sessionId": "synthetic", "originId": "origin"}}}
            db.execute("INSERT INTO sync_scopes VALUES('scope','manifest','generation',42)")
            db.execute("INSERT INTO sync_manifests VALUES(?,?)", ("manifest", json.dumps(header)))
            db.execute("INSERT INTO sync_receipts VALUES(?,?,?)", ("test-device", "batch", json.dumps({"batchId": "batch"})))
            db.execute("INSERT INTO sync_meta VALUES(1,1)")
        self.container = {"Image": "synthetic-image", "Config": {"Env": ["INCEPT_SYNC_DATABASE_FILE=/data/sync/v4.db", "INCEPT_SYNC_TRUSTED_MODE=1", "INCEPT_SYNC_READ_MODE=v2"]},
                          "Mounts": [{"Source": str(self.root), "Destination": "/data"}]}

    def tearDown(self):
        target = Path(self.temp.name).resolve()
        if target.parent != Path(__file__).resolve().parents[1] / "output":
            raise ValueError("TEST_CLEANUP_OUTSIDE_OUTPUT")
        self.temp.cleanup()

    def export(self):
        with patch.object(module.subprocess, "check_output", return_value=json.dumps([self.container]).encode()) as docker:
            result = module.export_snapshot("synthetic-container", "http://127.0.0.1:12345", "test-device")
            docker.assert_called_once_with(["docker", "inspect", "synthetic-container"])
            return result

    def test_exports_mounted_identity_and_inventory_without_changing_database(self):
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        result = self.export()
        self.assertEqual(result["service"]["imageId"], "synthetic-image")
        self.assertEqual(result["service"]["databaseFile"], "/data/sync/v4.db")
        self.assertEqual(result["tokenTotal"], 42)
        self.assertEqual(len(result["scopes"]), 1)
        self.assertEqual(len(result["receipts"]), 1)
        self.assertEqual(result["dataRevision"], 1)
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before)

    def test_rejects_production_v2_path(self):
        self.container["Config"]["Env"][0] = "INCEPT_SYNC_DATABASE_FILE=/data/sync/v2.db"
        with self.assertRaisesRegex(ValueError, "V4_TRUSTED_DATABASE_REQUIRED"):
            self.export()

    def test_rejects_missing_trusted_mode(self):
        self.container["Config"]["Env"][1] = "INCEPT_SYNC_TRUSTED_MODE=0"
        with self.assertRaisesRegex(ValueError, "V4_TRUSTED_DATABASE_REQUIRED"):
            self.export()

    def test_rejects_foreign_scope_device(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE sync_manifests SET header_json=?", (json.dumps({"manifest": {"scope": {"deviceId": "foreign"}}}),))
        with self.assertRaisesRegex(ValueError, "REMOTE_DEVICE_MISMATCH"):
            self.export()

    def test_rejects_foreign_receipt_device(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE sync_receipts SET device_id='foreign'")
        with self.assertRaisesRegex(ValueError, "REMOTE_RECEIPT_DEVICE_MISMATCH"):
            self.export()


if __name__ == "__main__":
    unittest.main()
