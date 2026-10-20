"""Read a local OCI/docker-save archive; never extracts layers or starts containers."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

INDEX = "sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685"
MANIFEST = "sha256:c13ed6a558e76432d8b10eff170c618cd61930f91a16d6b32cad02f2a5cad9cc"
CONFIG = "sha256:eebc98b3a47bccf76cff462d8cbdc027309d4d5dabb470ba3fdc4835a12fbc38"


def prepare(archive, image):
    with tarfile.open(archive) as tar:
        def blob(digest):
            entry = tar.getmember("blobs/sha256/" + digest.split(":")[1])
            if not entry.isfile() or entry.size > 262144:
                raise ValueError("INVALID_IDENTITY_BLOB")
            data = tar.extractfile(entry).read()
            if "sha256:" + hashlib.sha256(data).hexdigest() != digest:
                raise ValueError("IDENTITY_BLOB_HASH_MISMATCH")
            return data.decode("utf-8")
        evidence = {"indexJson": blob(INDEX), "manifestJson": blob(MANIFEST), "configJson": blob(CONFIG)}
    inspected = json.loads(subprocess.check_output(["docker", "image", "inspect", "--platform", "linux/amd64", image]))[0]
    evidence["observed"] = {"id": inspected["Id"], "os": inspected["Os"], "architecture": inspected["Architecture"], "rootfsDiffIds": inspected["RootFS"]["Layers"]}
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    evidence = prepare(args.archive, args.image)
    Path(args.output).write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifestListDigest": INDEX, "platformManifestDigest": MANIFEST, "configId": CONFIG, "observed": evidence["observed"]["id"]}))
