import type { CropBox } from './types';

export function medianCropBox(cropBoxes: CropBox[]): CropBox | null {
  if (cropBoxes.length === 0) return null;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return {
    ...cropBoxes[Math.floor(cropBoxes.length / 2)],
    x: median(cropBoxes.map((box) => box.x)),
    y: median(cropBoxes.map((box) => box.y)),
    width: median(cropBoxes.map((box) => box.width)),
    height: median(cropBoxes.map((box) => box.height)),
  };
}

export function buildStaticCropFilter(cropBox: CropBox, outputLabel = 'v_crop') {
  return `[0:v]crop=${cropBox.width}:${cropBox.height}:${cropBox.x}:${cropBox.y},scale=1080:1920[${outputLabel}]`;
}
