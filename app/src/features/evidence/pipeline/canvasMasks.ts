import { clampMaskRect, type LabeledMaskRect, type MaskRect } from './statementMaskLayout';

export function drawSolidMask(ctx: CanvasRenderingContext2D, rect: MaskRect) {
  const { x, y, width, height } = clampMaskRect(rect, ctx.canvas);
  ctx.save(); ctx.fillStyle = '#e5e5e5'; ctx.fillRect(x, y, width, height); ctx.restore();
}

export function drawRowMask(ctx: CanvasRenderingContext2D, rect: LabeledMaskRect) {
  const { x, y, width, height } = clampMaskRect(rect, ctx.canvas);
  // The source layout is a fixed Shinhan table. Draw from its outer grid line
  // to outer grid line, rather than only covering the parsed text cells.
  ctx.save(); ctx.fillStyle = '#e5e5e5'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = '#26343f'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  ctx.fillStyle = '#5c6770'; ctx.font = `600 ${Math.max(11, Math.min(16, height * .48))}px Pretendard, "Noto Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(rect.label, x + width / 2, y + height / 2); ctx.restore();
}
