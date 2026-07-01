#!/usr/bin/env python3
"""
Auto reframe planner for AutoClip AI.

This script does not use an LLM. It samples frames with OpenCV, detects faces
using MediaPipe Tasks FaceDetector, falls back to MediaPipe Tasks PoseLandmarker
for person detection, scores the main subject with temporal continuity,
generates 9:16 crop boxes, smooths them, and prints JSON for the Node worker/API.

All detection runs with MediaPipe Tasks (mediapipe.tasks.vision). The legacy
mp.solutions API is NOT used because it was removed in mediapipe 0.11.0+.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import cv2


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR = SCRIPT_DIR / "models"
FACE_MODEL = MODEL_DIR / "face_detector.tflite"
POSE_MODEL = MODEL_DIR / "pose_landmarker_lite.task"


def parse_args():
    parser = argparse.ArgumentParser(description="AutoClip AI auto reframe planner")
    parser.add_argument("--input", required=True)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=0)
    parser.add_argument("--aspect", default="9:16")
    parser.add_argument("--mode", default="face-center-crop")
    parser.add_argument("--sample-interval", type=float, default=0.5)
    parser.add_argument("--max-samples", type=int, default=160)
    return parser.parse_args()


def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))


def clamp01(value):
    return clamp(value, 0.0, 1.0)


def mediapipe_available():
    """Return True if MediaPipe Tasks can be imported and model files exist."""
    try:
        import mediapipe as mp  # noqa: F401
        from mediapipe.tasks.python.vision import FaceDetector, PoseLandmarker  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return FACE_MODEL.exists() and POSE_MODEL.exists()


def load_detectors():
    """Create MediaPipe FaceDetector and PoseLandmarker instances once.

    Both detectors run in IMAGE mode because we process sampled still frames,
    not a continuous video stream. Detectors are returned as context-manager
    aware objects; callers must call .close() or use a context manager.
    """
    import mediapipe as mp
    from mediapipe.tasks.python import vision

    BaseOptions = mp.tasks.BaseOptions

    face_options = vision.FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=str(FACE_MODEL)),
        running_mode=vision.RunningMode.IMAGE,
        min_detection_confidence=0.5,
        min_suppression_threshold=0.3,
    )
    face_detector = vision.FaceDetector.create_from_options(face_options)

    pose_options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(POSE_MODEL)),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=4,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)

    return face_detector, pose_landmarker


def detect_faces(rgb_frame, face_detector, frame_w, frame_h):
    """Run MediaPipe FaceDetector on an RGB frame.

    Returns a list of {x, y, width, height, confidence} boxes in pixel coords.
    """
    import mediapipe as mp

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
    detection_result = face_detector.detect(mp_image)
    detections = []
    if detection_result.detections:
        for detection in detection_result.detections:
            bbox = detection.bounding_box
            # Some versions return int, some float; convert safely.
            x = int(round(bbox.origin_x))
            y = int(round(bbox.origin_y))
            w = int(round(bbox.width))
            h = int(round(bbox.height))
            # Map back into frame bounds (MediaPipe usually already does this).
            x = clamp(x, 0, frame_w - 1)
            y = clamp(y, 0, frame_h - 1)
            w = clamp(w, 1, frame_w - x)
            h = clamp(h, 1, frame_h - y)
            confidence = clamp01(detection.categories[0].score) if detection.categories else 0.5
            area_score = clamp01(math.sqrt((w * h) / max(1, frame_w * frame_h)) * 6)
            detections.append({
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "confidence": round(confidence * 0.65 + area_score * 0.35, 3),
            })
    return detections


def detect_persons(rgb_frame, pose_landmarker, frame_w, frame_h):
    """Run MediaPipe PoseLandmarker on an RGB frame and derive person bboxes.

    Returns a list of {x, y, width, height, confidence} boxes in pixel coords.
    Landmarks are normalized [0,1]; we expand the bbox with head/body margins.
    """
    import mediapipe as mp

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
    result = pose_landmarker.detect(mp_image)
    detections = []
    if not result.pose_landmarks:
        return detections

    for pose in result.pose_landmarks:
        visible = [lm for lm in pose if getattr(lm, "visibility", 1.0) >= 0.3]
        if not visible:
            continue
        xs = [lm.x for lm in visible]
        ys = [lm.y for lm in visible]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        # Convert to pixels.
        x = x_min * frame_w
        y = y_min * frame_h
        w = (x_max - x_min) * frame_w
        h = (y_max - y_min) * frame_h

        # Expand so the crop leaves comfortable head/body margin.
        expand_x = w * 0.18
        expand_top = h * 0.35
        expand_bottom = h * 0.12
        px = clamp(x - expand_x, 0, frame_w - 1)
        py = clamp(y - expand_top, 0, frame_h - 1)
        pw = clamp(w + expand_x * 2, 1, frame_w - px)
        ph = clamp(h + expand_top + expand_bottom, 1, frame_h - py)

        area_score = clamp01(math.sqrt((pw * ph) / max(1, frame_w * frame_h)) * 2.6)
        detections.append({
            "x": int(round(px)),
            "y": int(round(py)),
            "width": int(round(pw)),
            "height": int(round(ph)),
            "confidence": round(0.55 + area_score * 0.35, 3),
        })
    return detections


def center_score(box, frame_w, frame_h):
    cx = box["x"] + box["width"] / 2
    cy = box["y"] + box["height"] / 2
    dx = abs(cx - frame_w / 2) / max(1, frame_w / 2)
    dy = abs(cy - frame_h / 2) / max(1, frame_h / 2)
    return clamp01(1 - math.sqrt(dx * dx + dy * dy) / math.sqrt(2))


def continuity_score(box, previous):
    if previous is None:
        return 0.5
    cx = box["x"] + box["width"] / 2
    cy = box["y"] + box["height"] / 2
    px = previous["x"] + previous["width"] / 2
    py = previous["y"] + previous["height"] / 2
    max_distance = max(previous["width"], previous["height"], box["width"], box["height"], 1) * 3
    return clamp01(1 - math.hypot(cx - px, cy - py) / max_distance)


def select_main_subject(detections, kind, timestamp, frame_w, frame_h, previous):
    if not detections:
        return None

    frame_area = max(1, frame_w * frame_h)
    best = None
    best_score = -1

    for box in detections:
        confidence = clamp01(float(box.get("confidence", 0)))
        area = max(1, box["width"] * box["height"])
        size_multiplier = 6 if kind == "face" else 2.6
        size_score = clamp01(math.sqrt(area / frame_area) * size_multiplier)
        score = (
            confidence * 0.35
            + size_score * 0.25
            + center_score(box, frame_w, frame_h) * 0.20
            + continuity_score(box, previous) * 0.20
        )
        if score > best_score:
            best = dict(box)
            best["kind"] = kind
            best["timestamp"] = round(timestamp, 3)
            best["score"] = round(score, 4)
            best_score = score

    return best


def crop_dimensions(frame_w, frame_h, aspect):
    if aspect == "1:1":
        side = min(frame_w, frame_h)
        return side, side
    if aspect == "4:5":
        crop_h = frame_h
        crop_w = int(frame_h * 4 / 5)
        if crop_w > frame_w:
            crop_w = frame_w
            crop_h = int(frame_w * 5 / 4)
        return max(1, crop_w), max(1, crop_h)
    if aspect == "16:9":
        crop_w = frame_w
        crop_h = int(frame_w * 9 / 16)
        if crop_h > frame_h:
            crop_h = frame_h
            crop_w = int(frame_h * 16 / 9)
        return crop_w, crop_h

    crop_h = frame_h
    crop_w = int(frame_h * 9 / 16)
    if crop_w > frame_w:
        crop_w = frame_w
        crop_h = int(frame_w * 16 / 9)
    return max(1, crop_w), max(1, crop_h)


def generate_crop_box(frame_w, frame_h, subject, aspect):
    crop_w, crop_h = crop_dimensions(frame_w, frame_h, aspect)
    subject_cx = subject["x"] + subject["width"] / 2
    subject_cy = subject["y"] + subject["height"] / 2
    anchor_y = 0.40 if subject["kind"] == "face" else 0.50

    crop_x = clamp(subject_cx - crop_w / 2, 0, max(0, frame_w - crop_w))
    crop_y = clamp(subject_cy - crop_h * anchor_y, 0, max(0, frame_h - crop_h))
    return {
        "timestamp": round(subject["timestamp"], 3),
        "x": int(round(crop_x)),
        "y": int(round(crop_y)),
        "width": int(round(crop_w)),
        "height": int(round(crop_h)),
        "mode": "face-center-crop" if subject["kind"] == "face" else "person-center-crop",
        "subjectKind": subject["kind"],
        "confidence": subject["confidence"],
    }


def smooth_crop_boxes(crop_boxes, max_move_per_second=420):
    if len(crop_boxes) <= 1:
        return crop_boxes

    boxes = sorted(crop_boxes, key=lambda b: b["timestamp"])
    out = [dict(boxes[0])]

    for current in boxes[1:]:
        previous = out[-1]
        dt = max(0.001, current["timestamp"] - previous["timestamp"])
        max_delta = max_move_per_second * dt

        raw_x = previous["x"] * 0.75 + current["x"] * 0.25
        raw_y = previous["y"] * 0.75 + current["y"] * 0.25
        raw_w = previous["width"] * 0.85 + current["width"] * 0.15
        raw_h = previous["height"] * 0.85 + current["height"] * 0.15

        def limited(value, prev):
            delta = value - prev
            if abs(delta) <= max_delta:
                return value
            return prev + (max_delta if delta > 0 else -max_delta)

        smoothed = dict(current)
        smoothed["x"] = int(round(limited(raw_x, previous["x"])))
        smoothed["y"] = int(round(limited(raw_y, previous["y"])))
        smoothed["width"] = int(round(raw_w))
        smoothed["height"] = int(round(raw_h))
        out.append(smoothed)

    return out


def fit_blur_result(frame_w, frame_h, aspect, reason="MediaPipe unavailable or no detections"):
    """Return a safe fallback result when detection cannot run or finds nothing."""
    crop_w, crop_h = crop_dimensions(frame_w, frame_h, aspect)
    return {
        "width": frame_w,
        "height": frame_h,
        "cropW": crop_w,
        "cropH": crop_h,
        "outputWidth": 1080,
        "outputHeight": 1920,
        "mode": "fit-blur",
        "fallbackMode": "fit-blur",
        "tracked": False,
        "faceDetections": [],
        "personDetections": [],
        "selectedSubjects": [],
        "cropBoxes": [],
        "smoothedCropBoxes": [],
        "keyframes": [],
        "reason": reason,
    }


def decimate_keyframes(smoothed, max_keyframes=80):
    """Keep keyframes sparse enough that FFmpeg crop expressions don't overflow."""
    if len(smoothed) <= max_keyframes:
        return smoothed
    step = max(1, int(round(len(smoothed) / max_keyframes)))
    return smoothed[::step]


def main():
    args = parse_args()
    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        print(json.dumps({"error": "Could not open video", **fit_blur_result(1920, 1080, args.aspect)}))
        sys.exit(1)

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_duration = (cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps) if fps else 0
    end_sec = args.end if args.end > 0 else total_duration
    if end_sec <= args.start:
        end_sec = args.start + 1

    # If MediaPipe is not installed or models are missing, immediately return
    # the safe fit-blur fallback so the worker never crashes and never forces
    # a center-crop.
    if not mediapipe_available():
        print(json.dumps(fit_blur_result(frame_w, frame_h, args.aspect, reason="MediaPipe or model files unavailable")))
        cap.release()
        return

    face_detector = None
    pose_landmarker = None
    try:
        face_detector, pose_landmarker = load_detectors()

        face_detections = []
        person_detections = []
        selected_subjects = []
        crop_boxes = []
        previous_subject = None
        last_subject = None
        missing_frames = 0

        t = args.start
        samples = 0
        while t < end_sec and samples < args.max_samples:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
            ok, frame = cap.read()
            local_t = round(t - args.start, 3)
            if not ok:
                t += args.sample_interval
                samples += 1
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            faces = detect_faces(rgb, face_detector, frame_w, frame_h)
            persons = [] if args.mode == "face-center-crop" and faces else detect_persons(rgb, pose_landmarker, frame_w, frame_h)

            face_detections.append({"timestamp": local_t, "faces": faces})
            person_detections.append({"timestamp": local_t, "persons": persons})

            subject = None
            if args.mode != "person-center-crop":
                subject = select_main_subject(faces, "face", local_t, frame_w, frame_h, previous_subject)
            if subject is None and args.mode != "face-center-crop":
                subject = select_main_subject(persons, "person", local_t, frame_w, frame_h, previous_subject)
            if subject is None and args.mode == "face-center-crop":
                subject = select_main_subject(persons, "person", local_t, frame_w, frame_h, previous_subject)

            if subject is not None:
                selected_subjects.append(subject)
                crop_boxes.append(generate_crop_box(frame_w, frame_h, subject, args.aspect))
                previous_subject = subject
                last_subject = subject
                missing_frames = 0
            elif last_subject is not None and missing_frames < 4:
                held = dict(last_subject)
                held["timestamp"] = local_t
                held["confidence"] = round(max(0.25, held["confidence"] * 0.75), 3)
                held["score"] = round(max(0.2, held.get("score", 0.5) * 0.75), 4)
                selected_subjects.append(held)
                crop_boxes.append(generate_crop_box(frame_w, frame_h, held, args.aspect))
                missing_frames += 1
            else:
                missing_frames += 1

            t += args.sample_interval
            samples += 1

        cap.release()

        smoothed = smooth_crop_boxes(crop_boxes)
        has_face = any(subject["kind"] == "face" for subject in selected_subjects)
        has_person = any(subject["kind"] == "person" for subject in selected_subjects)
        mode = "face-center-crop" if has_face else "person-center-crop" if has_person else "fit-blur"
        tracked = mode != "fit-blur" and len(smoothed) > 0

        smoothed = decimate_keyframes(smoothed, max_keyframes=80)

        result = {
            "width": frame_w,
            "height": frame_h,
            "cropW": smoothed[0]["width"] if smoothed else crop_dimensions(frame_w, frame_h, args.aspect)[0],
            "cropH": smoothed[0]["height"] if smoothed else crop_dimensions(frame_w, frame_h, args.aspect)[1],
            "outputWidth": 1080,
            "outputHeight": 1920,
            "mode": mode,
            "fallbackMode": "fit-blur",
            "tracked": tracked,
            "faceDetections": face_detections,
            "personDetections": person_detections,
            "selectedSubjects": selected_subjects,
            "cropBoxes": crop_boxes,
            "smoothedCropBoxes": smoothed,
            "keyframes": [
                {
                    "t": box["timestamp"],
                    "x": box["x"],
                    "y": box["y"],
                    "w": box["width"],
                    "h": box["height"],
                }
                for box in smoothed
            ],
        }
        print(json.dumps(result))
    finally:
        if face_detector is not None:
            face_detector.close()
        if pose_landmarker is not None:
            pose_landmarker.close()


if __name__ == "__main__":
    main()
