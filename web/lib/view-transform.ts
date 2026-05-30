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
}

export interface FitDestRect {
  destX: number;
  destY: number;
  destW: number;
  destH: number;
  fitScale: number;
  totalScale: number;
}

export function computeFitScale(
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (remoteWidth <= 0 || remoteHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }
  return Math.min(viewportWidth / remoteWidth, viewportHeight / remoteHeight);
}

export function computeFitDestRect(
  remoteWidth: number,
  remoteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  userScale: number,
  offsetX: number,
  offsetY: number,
): FitDestRect {
  const fitScale = computeFitScale(remoteWidth, remoteHeight, viewportWidth, viewportHeight);
  const totalScale = fitScale * userScale;
  const destW = remoteWidth * totalScale;
  const destH = remoteHeight * totalScale;
  const destX = (viewportWidth - destW) / 2 + offsetX;
  const destY = (viewportHeight - destH) / 2 + offsetY;

  return { destX, destY, destW, destH, fitScale, totalScale };
}

export function clampViewOffset(
  offsetX: number,
  offsetY: number,
  userScale: number,
  containerWidth: number,
  containerHeight: number,
  remoteWidth: number,
  remoteHeight: number,
): { offsetX: number; offsetY: number } {
  if (
    userScale <= 1 ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    remoteWidth <= 0 ||
    remoteHeight <= 0
  ) {
    return { offsetX: 0, offsetY: 0 };
  }

  const { destW, destH } = computeFitDestRect(
    remoteWidth,
    remoteHeight,
    containerWidth,
    containerHeight,
    userScale,
    0,
    0,
  );

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
): { x: number; y: number } | null {
  if (remoteWidth <= 0 || remoteHeight <= 0) return null;

  const localX = clientX - canvasRect.left;
  const localY = clientY - canvasRect.top;
  const { destX, destY, destW, destH, totalScale } = computeFitDestRect(
    remoteWidth,
    remoteHeight,
    canvasRect.width,
    canvasRect.height,
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
): { x: number; y: number } {
  const { destX, destY, destW, destH } = computeFitDestRect(
    remoteWidth,
    remoteHeight,
    viewportWidth,
    viewportHeight,
    viewTransform.scale,
    viewTransform.offsetX,
    viewTransform.offsetY,
  );

  return {
    x: destX + (remoteX / remoteWidth) * destW,
    y: destY + (remoteY / remoteHeight) * destH,
  };
}
