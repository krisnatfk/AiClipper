import type { ManualCrop } from './types';

export function buildManualCropFilter(crop: ManualCrop, outputLabel = 'v_crop') {
  return `[0:v]crop=${Math.round(crop.width)}:${Math.round(crop.height)}:${Math.round(crop.x)}:${Math.round(crop.y)},scale=1080:1920[${outputLabel}]`;
}
