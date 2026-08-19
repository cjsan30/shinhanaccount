export type ImagePlacement = { x: number; y: number; width: number; height: number };

export function fitImageInsidePage(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number,
): ImagePlacement {
  if (imageWidth <= 0 || imageHeight <= 0) throw new Error('이미지 크기가 올바르지 않습니다.');
  const availableWidth = Math.max(1, pageWidth - margin * 2);
  const availableHeight = Math.max(1, pageHeight - margin * 2);
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}
