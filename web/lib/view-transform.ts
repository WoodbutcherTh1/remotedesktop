export const MIN_VIEW_SCALE = 0.5;
export const MAX_VIEW_SCALE = 4.0;

export type TouchInteractionMode = 'move' | 'pan';

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function clampViewOffset(
  offsetX: number,
  offsetY: number,
  scale: number,
  containerWidth: number,
  containerHeight: number,
): { offsetX: number; offsetY: number } {
  if (scale <= 1 || containerWidth <= 0 || containerHeight <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }

  const maxX = (containerWidth * (scale - 1)) / 2;
  const maxY = (containerHeight * (scale - 1)) / 2;

  return {
    offsetX: Math.max(-maxX, Math.min(maxX, offsetX)),
    offsetY: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}

export function clampViewScale(scale: number): number {
  return Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, scale));
}

export function shouldPanOnDrag(scale: number, touchMode: TouchInteractionMode): boolean {
  if (touchMode === 'pan') return true;
  return scale > 1;
}
