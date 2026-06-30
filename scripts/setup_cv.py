#!/usr/bin/env python3
"""Download MediaPipe Tasks model files required by track_subject.py.

Run this once after installing packages from scripts/requirements-cv.txt:
    python scripts/setup_cv.py

Models are placed in scripts/models/ and used by track_subject.py at runtime.
"""
import os
import sys
import urllib.request
from pathlib import Path

# Stable model URLs from Google MediaPipe storage.
MODELS = {
    "face_detector.tflite": "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
}


def models_dir() -> Path:
    """Return the directory where models are stored."""
    return Path(__file__).resolve().parent / "models"


def download_file(url: str, dest: Path) -> None:
    """Download url to dest, raising on HTTP error."""
    print(f"Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "AutoClipAI-CV-Setup/1.0"})
    with urllib.request.urlopen(req, timeout=300) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} for {url}")
        data = response.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print(f"Saved {dest} ({len(data)} bytes)")


def main() -> int:
    directory = models_dir()
    directory.mkdir(parents=True, exist_ok=True)
    all_ok = True

    for filename, url in MODELS.items():
        dest = directory / filename
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"Already present: {dest} ({dest.stat().st_size} bytes)")
            continue
        try:
            download_file(url, dest)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR downloading {filename}: {exc}", file=sys.stderr)
            all_ok = False

    if not all_ok:
        return 1

    # Quick sanity import check.
    try:
        import cv2  # noqa: F401
        import mediapipe as mp  # noqa: F401
        from mediapipe.tasks.python.vision import FaceDetector, PoseLandmarker  # noqa: F401
        print("MediaPipe + OpenCV are importable.")
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: import check failed: {exc}", file=sys.stderr)
        return 1

    print("CV setup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
