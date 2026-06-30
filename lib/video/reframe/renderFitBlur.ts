export function buildFitBlurFilter(outputLabel = 'v_crop', outputWidth = 1080, outputHeight = 1920) {
  return [
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight},gblur=sigma=28[bg]`,
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[${outputLabel}]`,
  ].join(';');
}
