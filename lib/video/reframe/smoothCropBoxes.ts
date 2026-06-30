import type { CropBox } from './types';

function limitStep(current: number, previous: number, maxDelta: number) {
  const delta = current - previous;
  if (Math.abs(delta) <= maxDelta) return current;
  return previous + Math.sign(delta) * maxDelta;
}

export function smoothCropBoxes(cropBoxes: CropBox[], maxMovePerSecond = 420): CropBox[] {
  if (cropBoxes.length <= 1) return cropBoxes;

  const sorted = [...cropBoxes].sort((a, b) => a.timestamp - b.timestamp);
  const smoothed: CropBox[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = smoothed[i - 1];
    const current = sorted[i];
    const dt = Math.max(0.001, current.timestamp - previous.timestamp);
    const maxDelta = maxMovePerSecond * dt;

    const x = previous.x * 0.75 + current.x * 0.25;
    const y = previous.y * 0.75 + current.y * 0.25;
    const width = previous.width * 0.85 + current.width * 0.15;
    const height = previous.height * 0.85 + current.height * 0.15;

    smoothed.push({
      ...current,
      x: Math.round(limitStep(x, previous.x, maxDelta)),
      y: Math.round(limitStep(y, previous.y, maxDelta)),
      width: Math.round(width),
      height: Math.round(height),
    });
  }

  return smoothed;
}
