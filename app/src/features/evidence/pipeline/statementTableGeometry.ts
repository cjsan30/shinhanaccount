import type { StatementTableGeometry } from '../../../domain/statementMasking';

/** RGBA pixels in row-major order, as returned by `CanvasRenderingContext2D.getImageData`. */
export type PixelImage = { width: number; height: number; data: Uint8ClampedArray };

const middle = (values: number[]) => { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.floor(sorted.length / 2)]; };

/**
 * Shinhan's PDF is vector-based, so the rendered table grid can be detected
 * reliably. Snapping masks to those lines fixes both a right-edge overrun and
 * taller deposit rows without reconstructing the original statement.
 *
 * `rowSourceYs` are the rows' PDF y coordinates (origin at the bottom); `scale`
 * converts PDF points to canvas pixels.
 */
export function detectStatementTableGeometry(image: PixelImage, scale: number, rowSourceYs: number[]): StatementTableGeometry | undefined {
  const { width, height, data: pixels } = image;
  const rowCenters = rowSourceYs.map((sourceY) => height - sourceY * scale);
  if (!rowCenters.length) return undefined;
  const minY = Math.max(0, Math.floor(Math.min(...rowCenters) - 36 * scale)); const maxY = Math.min(height - 1, Math.ceil(Math.max(...rowCenters) + 36 * scale));
  const expectedLeft = Math.max(0, Math.floor(18 * scale)); const expectedRight = Math.min(width - 1, Math.ceil(560 * scale));
  const darkAt = (x: number, y: number) => { const offset = (y * width + x) * 4; return pixels[offset] < 125 && pixels[offset + 1] < 125 && pixels[offset + 2] < 125; };
  const lineCandidates: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    let dark = 0;
    for (let x = expectedLeft; x <= expectedRight; x += 1) if (darkAt(x, y)) dark += 1;
    if (dark >= (expectedRight - expectedLeft) * .62) lineCandidates.push(y);
  }
  const horizontalLines: number[] = [];
  for (const y of lineCandidates) {
    const previous = horizontalLines[horizontalLines.length - 1];
    if (previous === undefined || y - previous > 2) horizontalLines.push(y);
  }
  if (horizontalLines.length < 2) return undefined;
  const leftEdges: number[] = []; const rightEdges: number[] = [];
  for (const y of horizontalLines) {
    let left = -1; let right = -1;
    for (let x = expectedLeft; x <= expectedRight; x += 1) if (darkAt(x, y)) { left = x; break; }
    for (let x = expectedRight; x >= expectedLeft; x -= 1) if (darkAt(x, y)) { right = x; break; }
    if (left >= 0 && right > left) { leftEdges.push(left); rightEdges.push(right); }
  }
  if (!leftEdges.length) return undefined;
  // A horizontal rule can end a pixel inside an anti-aliased vertical border.
  // Find that vertical border across the whole table height so the fill reaches
  // the actual outer edge on both sides.
  const strongestVertical = (from: number, to: number) => {
    let best = -1; let bestScore = -1;
    for (let x = Math.max(0, from); x <= Math.min(width - 1, to); x += 1) {
      let score = 0;
      for (let y = minY; y <= maxY; y += 1) if (darkAt(x, y)) score += 1;
      if (score > bestScore) { best = x; bestScore = score; }
    }
    return bestScore > (maxY - minY) * .35 ? best : undefined;
  };
  const outerVertical = (from: number, to: number, side: 'left' | 'right') => {
    const candidates: number[] = [];
    for (let x = Math.max(0, from); x <= Math.min(width - 1, to); x += 1) {
      let score = 0;
      for (let y = minY; y <= maxY; y += 1) if (darkAt(x, y)) score += 1;
      // The outer border can be interrupted by a taller grouped deposit row,
      // so it need only cover a meaningful part of the statement body.
      if (score >= (maxY - minY) * .12) candidates.push(x);
    }
    if (!candidates.length) return undefined;
    return side === 'left' ? Math.min(...candidates) : Math.max(...candidates);
  };
  const left = outerVertical(Math.floor(15 * scale), Math.ceil(60 * scale), 'left') ?? strongestVertical(Math.floor(20 * scale), Math.ceil(45 * scale)) ?? middle(leftEdges);
  const right = outerVertical(Math.floor(500 * scale), Math.ceil(590 * scale), 'right') ?? strongestVertical(Math.floor(530 * scale), Math.ceil(560 * scale)) ?? middle(rightEdges);
  return { left, right, horizontalLines };
}
