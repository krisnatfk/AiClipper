import type { DetectionBox, SubjectBox, SubjectKind } from './types';

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function centerDistanceScore(box: DetectionBox, videoWidth: number, videoHeight: number) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = Math.abs(cx - videoWidth / 2) / Math.max(1, videoWidth / 2);
  const dy = Math.abs(cy - videoHeight / 2) / Math.max(1, videoHeight / 2);
  return clamp01(1 - Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
}

function continuityScore(box: DetectionBox, previous?: SubjectBox | null) {
  if (!previous) return 0.5;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const px = previous.x + previous.width / 2;
  const py = previous.y + previous.height / 2;
  const maxDistance = Math.max(previous.width, previous.height, box.width, box.height, 1) * 3;
  const distance = Math.hypot(cx - px, cy - py);
  return clamp01(1 - distance / maxDistance);
}

export function selectMainSubject(
  detections: DetectionBox[],
  kind: SubjectKind,
  timestamp: number,
  videoWidth: number,
  videoHeight: number,
  previous?: SubjectBox | null
): SubjectBox | null {
  if (detections.length === 0) return null;

  const frameArea = Math.max(1, videoWidth * videoHeight);
  let best: SubjectBox | null = null;

  for (const detection of detections) {
    const confidence = clamp01(detection.confidence);
    const area = Math.max(1, detection.width * detection.height);
    const sizeScore = clamp01(Math.sqrt(area / frameArea) * (kind === 'face' ? 6 : 2.6));
    const centered = centerDistanceScore(detection, videoWidth, videoHeight);
    const continuity = continuityScore(detection, previous);
    const score = confidence * 0.35 + sizeScore * 0.25 + centered * 0.2 + continuity * 0.2;

    if (!best || score > (best.score ?? 0)) {
      best = { ...detection, kind, timestamp, score };
    }
  }

  return best;
}
