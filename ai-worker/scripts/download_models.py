"""
Reproducible Model Acquisition Script for AI Worker (Phase 3C)
Downloads verified lightweight YOLOv8n model weights with SHA-256 validation.
"""

import hashlib
import os
import sys
import urllib.request

MODELS = {
    "yolov8n.pt": {
        "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt",
        "sha256": "f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36",
        "size": 6549796,
        "description": "YOLOv8 Nano pretrained model (~3.2M params, 6.2MB) for CPU vehicle detection"
    }
}


def compute_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def download_models(target_dir: str):
    os.makedirs(target_dir, exist_ok=True)
    print(f"Checking model weights in {target_dir}...")

    for filename, meta in MODELS.items():
        dest = os.path.join(target_dir, filename)
        if os.path.exists(dest):
            actual_sha = compute_sha256(dest)
            if actual_sha == meta["sha256"]:
                print(f"  [OK] {filename} already exists and verified (SHA-256 matched)")
                continue
            else:
                print(f"  [WARN] {filename} hash mismatch, re-downloading...")

        print(f"  Downloading {filename} from {meta['url']}...")
        urllib.request.urlretrieve(meta["url"], dest)
        actual_sha = compute_sha256(dest)
        if actual_sha != meta["sha256"]:
            print(f"  [ERROR] {filename} failed SHA-256 verification!")
            sys.exit(1)
        print(f"  [SUCCESS] {filename} downloaded and verified successfully ({meta['size']} bytes)")


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(os.path.dirname(script_dir), "models")
    download_models(models_dir)
