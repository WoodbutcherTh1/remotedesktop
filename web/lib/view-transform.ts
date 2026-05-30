import { ScaleMode } from './settings-store';

export const MIN_VIEW_SCALE = 0.5;
export const MAX_VIEW_SCALE = 4.0;
export const VIEW_BACKGROUND = '#0A0A0F';

export type TouchInteractionMode = 'move' | 'pan';

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ViewState extends ViewTransform {
  containerWidth: number;
  containerHeight: number;
  scaleMode: ScaleMode;
}

export interface DestRect {
  destX: number;
  destY: number;
  destW: number;
  destH: number;
  baseScale: number;
  totalScale: number;
}

import { getClientViewport } from './client-viewport';

/** CSS pixel viewport size (layout viewport — matches 100vw/100dvh). */
export function getVisualViewportCssSize(): { width: number; height: number } {
  const { width, height } = getClientViewport();
  return { width, height };
}

export function computeBaseScale(
  scaleMode: ScaleMode,
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (remoteWidth <= 0 || remoteHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }

  switch (scaleMode) {
    case 'fill':
      return Math.max(viewportWidth / remoteWidth, viewportHeight / remoteHeight);
    case 'fit':
      return Math.min(viewportWidth / remoteWidth, viewportHeight / remoteHeight);
    case 'original':
      return 1;
    case 'stretch':
      return 1;
    default:
      return Math.max(viewportWidth / remoteWidth, viewportHeight / remoteHeight);
  }
}

export function computeDestRect(
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  scaleMode: ScaleMode,
  userScale: number,
  offsetX: number,
  offsetY: number,
): DestRect {
  if (scaleMode === 'stretch') {
    const destW = viewportWidth * userScale;
    const destH = viewportHeight * userScale;
    return {
      destX: (viewportWidth - destW) / 2 + offsetX,
      destY: (viewportHeight - destH) / 2 + offsetY,
      destW,
      destH,
      baseScale: 1,
      totalScale: userScale,
    };
  }

  const baseScale = computeBaseScale(
    scaleMode,
    remoteWidth,
    remoteHeight,
    viewportWidth,
    viewportHeight,
  );
  const totalScale = baseScale * userScale;
  const destW = remoteWidth * totalScale;
  const destH = remoteHeight * totalScale;
  const destX = (viewportWidth - destW) / 2 + offsetX;
  const destY = (viewportHeight - destH) / 2 + offsetY;

  return { destX, destY, destW, destH, baseScale, totalScale };
}

/** @deprecated Use computeDestRect */
export function computeFitScale(
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  return computeBaseScale('fit', remoteWidth, remoteHeight, viewportWidth, viewportHeight);
}

/** @deprecated Use computeDestRect */
export function computeFitDestRect(
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  userScale: number,
  offsetX: number,
  offsetY: number,
): DestRect {
  return computeDestRect(
    remoteWidth,
    remoteHeight,
    viewportWidth,
    viewportHeight,
    'fit',
    userScale,
    offsetX,
    offsetY,
  );
}

export function clampViewOffset(
  offsetX: number,
  offsetY: number,
  userScale: number,
  containerWidth: number,
  containerHeight: number,
  remoteWidth: number,
  remoteHeight: number,
  scaleMode: ScaleMode,
): { offsetX: number; offsetY: number } {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    remoteWidth <= 0 ||
    remoteHeight <= 0
  ) {
    return { offsetX: 0, offsetY: 0 };
  }

  const { destW, destH } = computeDestRect(
    remoteWidth,
    remoteHeight,
    containerWidth,
    containerHeight,
    scaleMode,
    userScale,
    0,
    0,
  );

  if (userScale <= 1 && scaleMode === 'fit') {
    return { offsetX: 0, offsetY: 0 };
  }

  const maxX = Math.max(0, (destW - containerWidth) / 2);
  const maxY = Math.max(0, (destH - containerHeight) / 2);

  return {
    offsetX: Math.max(-maxX, Math.min(maxX, offsetX)),
    offsetY: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}

export function clampViewScale(scale: number): number {
  return Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, scale));
}

export function shouldPanOnDrag(_scale: number, touchMode: TouchInteractionMode): boolean {
  return touchMode === 'pan';
}

export function mapClientToRemote(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  remoteWidth: number,
  remoteHeight: number,
  viewTransform: ViewTransform,
  scaleMode: ScaleMode,
): { x: number; y: number } | null {
  if (remoteWidth <= 0 || remoteHeight <= 0) return null;

  const localX = clientX - canvasRect.left;
  const localY = clientY - canvasRect.top;

  if (scaleMode === 'stretch') {
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    return {
      x: Math.max(
        0,
        Math.min(remoteWidth - 1, Math.round((localX / canvasRect.width) * remoteWidth)),
      ),
      y: Math.max(
        0,
        Math.min(remoteHeight - 1, Math.round((localY / canvasRect.height) * remoteHeight)),
      ),
    };
  }

  const { destX, destY, destW, destH, totalScale } = computeDestRect(
    remoteWidth,
    remoteHeight,
    canvasRect.width,
    canvasRect.height,
    scaleMode,
    viewTransform.scale,
    viewTransform.offsetX,
    viewTransform.offsetY,
  );

  if (destW <= 0 || destH <= 0 || totalScale <= 0) return null;

  const remoteX = (localX - destX) / totalScale;
  const remoteY = (localY - destY) / totalScale;

  return {
    x: Math.max(0, Math.min(remoteWidth - 1, Math.round(remoteX))),
    y: Math.max(0, Math.min(remoteHeight - 1, Math.round(remoteY))),
  };
}

export function mapRemoteToClient(
  remoteX: number,
  remoteY: number,
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  viewTransform: ViewTransform,
  scaleMode: ScaleMode,
): { x: number; y: number } {
  if (scaleMode === 'stretch' && remoteWidth > 0 && remoteHeight > 0) {
    return {
      x: (remoteX / remoteWidth) * viewportWidth,
      y: (remoteY / remoteHeight) * viewportHeight,
    };
  }

  const { destX, destY, destW, destH } = computeDestRect(
    remoteWidth,
    remoteHeight,
    viewportWidth,
    viewportHeight,
    scaleMode,
    viewTransform.scale,
    viewTransform.offsetX,
    viewTransform.offsetY,
  );

  return {
    x: destX + (remoteX / remoteWidth) * destW,
    y: destY + (remoteY / remoteHeight) * destH,
  };
}
