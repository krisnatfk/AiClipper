import type { CropBox, SubjectBox } from './types';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function generateCropBoxForSubject(
  videoWidth: number,
  videoHeight: number,
  subjectBox: SubjectBox,
  targetAspectRatio = 9 / 16
): CropBox {
  let cropHeight = videoHeight;
  let cropWidth = videoHeight * targetAspectRatio;

  if (cropWidth > videoWidth) {
    cropWidth = videoWidth;
    cropHeight = videoWidth / targetAspectRatio;
  }

  const subjectCenterX = subjectBox.x + subjectBox.width / 2;
  const subjectCenterY = subjectBox.y + subjectBox.height / 2;
  const verticalAnchor = subjectBox.kind === 'face' ? 0.4 : 0.5;

  const cropX = clamp(subjectCenterX - cropWidth / 2, 0, Math.max(0, videoWidth - cropWidth));
  const cropY = clamp(subjectCenterY - cropHeight * verticalAnchor, 0, Math.max(0, videoHeight - cropHeight));

  return {
    timestamp: subjectBox.timestamp,
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
    mode: subjectBox.kind === 'face' ? 'face-center-crop' : 'person-center-crop',
    subjectKind: subjectBox.kind,
    confidence: subjectBox.confidence,
  };
}

export function centerCropBox(videoWidth: number, videoHeight: number, timestamp = 0): CropBox {
  let cropHeight = videoHeight;
  let cropWidth = videoHeight * 9 / 16;

  if (cropWidth > videoWidth) {
    cropWidth = videoWidth;
    cropHeight = videoWidth * 16 / 9;
  }

  return {
    timestamp,
    x: Math.round((videoWidth - cropWidth) / 2),
    y: Math.round((videoHeight - cropHeight) / 2),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
    mode: 'fit-blur',
  };
}
