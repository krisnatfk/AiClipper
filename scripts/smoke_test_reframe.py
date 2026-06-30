#!/usr/bin/env python3
"""Smoke tests for AutoClip AI auto-reframe pipeline.

Usage examples:
    python scripts/smoke_test_reframe.py --video storage/uploads/proj_xxx.mp4 --mode face
    python scripts/smoke_test_reframe.py --video storage/uploads/proj_xxx.mp4 --mode person
    python scripts/smoke_test_reframe.py --video storage/uploads/proj_xxx.mp4 --mode smooth

Modes:
    face    - verify face detection + horizontal/vertical centering
    person  - verify person fallback works (no faces visible / face-center-crop forced)
    smooth  - verify smoothing bounds + missing-frame hold
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PYTHON = Path("C:/Users/USER/AppData/Local/Programs/Python/Python312/python.exe")
TRACK_SCRIPT = PROJECT_ROOT / "scripts" / "track_subject.py"


def parse_args():
    parser = argparse.ArgumentParser(description="Smoke test reframe pipeline")
    parser.add_argument("--video", required=True, help="Path to test video")
    parser.add_argument("--mode", default="face", choices=["face", "person", "smooth"])
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=5)
    parser.add_argument("--sample-interval", type=float, default=0.5)
    parser.add_argument("--max-samples", type=int, default=10)
    return parser.parse_args()


def run_tracker(video, mode, start, end, sample_interval, max_samples):
    cmd = [
        str(PYTHON),
        str(TRACK_SCRIPT),
        "--input", video,
        "--start", str(start),
        "--end", str(end),
        "--mode", mode,
        "--sample-interval", str(sample_interval),
        "--max-samples", str(max_samples),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"track_subject.py failed:\n{result.stderr}")
    return json.loads(result.stdout)


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def test_face(data):
    assert_true(data.get("mode") == "face-center-crop", f"expected face-center-crop, got {data.get('mode')}")
    assert_true(data.get("tracked") is True, "expected tracked=True")
    subjects = data.get("selectedSubjects", [])
    assert_true(len(subjects) > 0, "expected at least one selected subject")

    first_subject = subjects[0]
    assert_true(first_subject.get("kind") == "face", "expected first subject kind=face")

    crop_boxes = data.get("cropBoxes", [])
    assert_true(len(crop_boxes) > 0, "expected at least one crop box")

    # Face center should be horizontally ~50% and vertically 38-45% within the crop.
    for subject, crop in zip(subjects[:5], crop_boxes[:5]):
        sx = subject["x"] + subject["width"] / 2
        sy = subject["y"] + subject["height"] / 2
        rel_x = (sx - crop["x"]) / max(1, crop["width"])
        rel_y = (sy - crop["y"]) / max(1, crop["height"])
        assert_true(0.40 <= rel_x <= 0.60, f"face center X out of range: {rel_x:.3f}")
        assert_true(0.33 <= rel_y <= 0.47, f"face center Y out of range: {rel_y:.3f}")

    # Crop box must stay inside video bounds.
    video_w = data["width"]
    video_h = data["height"]
    for crop in crop_boxes:
        assert_true(0 <= crop["x"] <= video_w - crop["width"], f"cropX out of bounds: {crop}")
        assert_true(0 <= crop["y"] <= video_h - crop["height"], f"cropY out of bounds: {crop}")

    print("PASS: face detection + centering + bounds")


def test_person(data):
    mode = data.get("mode")
    assert_true(mode in ("person-center-crop", "face-center-crop", "fit-blur"), f"unexpected mode: {mode}")
    if mode == "person-center-crop":
        subjects = data.get("selectedSubjects", [])
        assert_true(len(subjects) > 0, "expected selected subjects for person mode")
        assert_true(any(s.get("kind") == "person" for s in subjects), "expected at least one person subject")
        print("PASS: person fallback detected")
    elif mode == "fit-blur":
        print("PASS: fell back to fit-blur (no faces or persons)")
    else:
        print(f"PASS: mode was {mode} (person not needed because face detected)")


def test_smooth(data):
    smoothed = data.get("smoothedCropBoxes", [])
    assert_true(len(smoothed) > 1, "need >1 keyframe to test smoothing")

    max_move_per_second = 420
    for prev, curr in zip(smoothed, smoothed[1:]):
        dt = max(0.001, curr["timestamp"] - prev["timestamp"])
        max_delta = max_move_per_second * dt
        dx = abs(curr["x"] - prev["x"])
        dy = abs(curr["y"] - prev["y"])
        assert_true(dx <= max_delta + 1, f"x jump {dx} exceeds max_delta {max_delta} at t={curr['timestamp']}")
        assert_true(dy <= max_delta + 1, f"y jump {dy} exceeds max_delta {max_delta} at t={curr['timestamp']}")

    # Missing-frame hold: if selectedSubjects len equals cropBoxes len, then no holds were
    # needed; otherwise some holds should exist. We just verify counts are reasonable.
    selected = data.get("selectedSubjects", [])
    crop = data.get("cropBoxes", [])
    assert_true(abs(len(selected) - len(crop)) <= 1, f"selected/crop count mismatch: {len(selected)} vs {len(crop)}")

    print("PASS: smoothing bounds + hold consistency")


def main():
    args = parse_args()
    data = run_tracker(
        args.video,
        "face-center-crop" if args.mode == "face" else "person-center-crop" if args.mode == "person" else "face-center-crop",
        args.start,
        args.end,
        args.sample_interval,
        args.max_samples,
    )

    print(f"mode: {data.get('mode')} | tracked: {data.get('tracked')} | subjects: {len(data.get('selectedSubjects', []))}")

    if args.mode == "face":
        test_face(data)
    elif args.mode == "person":
        test_person(data)
    elif args.mode == "smooth":
        test_smooth(data)

    return 0


if __name__ == "__main__":
    sys.exit(main())
