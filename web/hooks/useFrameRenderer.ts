'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BinaryFrame } from '@/lib/frame-protocol';
import { ColorMode, RemoteSettings } from '@/lib/settings-store';
import { computeFitDestRect, VIEW_BACKGROUND, ViewState } from '@/lib/view-transform';

type CanvasBuffer = HTMLCanvasElement | OffscreenCanvas;

interface FrameRendererState {
  fps: number;
  frameCount: number;
  lastFrameTime: number;
}

async function decodeRectJpeg(jpeg: Uint8Array): Promise<ImageBitmap | null> {
  try {
    const blob = new Blob([jpeg as BlobPart], { type: 'image/jpeg' });
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function createBufferCanvas(width: number, height: number): CanvasBuffer {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2dContext(buffer: CanvasBuffer): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  return buffer.getContext('2d', { alpha: false, desynchronized: true });
}

function applyHighQualitySmoothing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

export function useFrameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  settings: RemoteSettings,
  connected: boolean,
  viewStateRef: React.MutableRefObject<ViewState>,
) {
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const offscreenRef = useRef<CanvasBuffer | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null>(null);
  const renderSeqRef = useRef(0);
  const displayInitializedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const statsRef = useRef<FrameRendererState>({ fps: 0, frameCount: 0, lastFrameTime: performance.now() });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!connected) {
      setHasReceivedFrame(false);
      displayInitializedRef.current = false;
      offscreenRef.current = null;
      offscreenCtxRef.current = null;
    }
  }, [connected]);

  const applyColorMode = useCallback((ctx: CanvasRenderingContext2D, mode: ColorMode) => {
    if (mode === 'grayscale') {
      ctx.filter = 'grayscale(100%)';
    } else if (mode === 'high-contrast') {
      ctx.filter = 'contrast(150%) saturate(150%)';
    } else {
      ctx.filter = 'none';
    }
  }, []);

  const paintDisplayCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const offscreen = offscreenRef.current;
    if (!canvas || !offscreen || offscreen.width === 0 || offscreen.height === 0) return;

    const viewState = viewStateRef.current;
    const viewportW = viewState.containerWidth > 0 ? viewState.containerWidth : canvas.clientWidth;
    const viewportH = viewState.containerHeight > 0 ? viewState.containerHeight : canvas.clientHeight;
    if (viewportW <= 0 || viewportH <= 0) return;

    const bufferW = Math.round(viewportW);
    const bufferH = Math.round(viewportH);
    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW;
      canvas.height = bufferH;
    }

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: settingsRef.current.display.hardwareAcceleration,
    });
    if (!ctx) return;

    try {
      ctx.fillStyle = VIEW_BACKGROUND;
      ctx.fillRect(0, 0, bufferW, bufferH);

      const { destX, destY, destW, destH } = computeFitDestRect(
        offscreen.width,
        offscreen.height,
        viewportW,
        viewportH,
        viewState.scale,
        viewState.offsetX,
        viewState.offsetY,
      );

      if (destW <= 0 || destH <= 0) return;

      applyHighQualitySmoothing(ctx);
      applyColorMode(ctx, settingsRef.current.display.colorMode);
      ctx.drawImage(
        offscreen as CanvasImageSource,
        0,
        0,
        offscreen.width,
        offscreen.height,
        destX,
        destY,
        destW,
        destH,
      );
    } catch {
      // keep last painted display frame
    }
  }, [applyColorMode, canvasRef, viewStateRef]);

  useEffect(() => {
    const tick = () => {
      paintDisplayCanvas();
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [paintDisplayCanvas]);

  const ensureOffscreen = useCallback((width: number, height: number): boolean => {
    const existing = offscreenRef.current;
    if (existing && existing.width === width && existing.height === height) {
      if (!offscreenCtxRef.current) {
        offscreenCtxRef.current = get2dContext(existing);
      }
      return false;
    }

    const offscreen = createBufferCanvas(width, height);
    offscreenRef.current = offscreen;
    const ctx = get2dContext(offscreen);
    if (!ctx) {
      offscreenCtxRef.current = null;
      return false;
    }
    offscreenCtxRef.current = ctx;
    try {
      applyHighQualitySmoothing(ctx);
      ctx.fillStyle = VIEW_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
    } catch {
      return false;
    }
    setDimensions({ width, height });
    return true;
  }, []);

  const renderFrame = useCallback(async (frame: BinaryFrame) => {
    const seq = ++renderSeqRef.current;

    let sizeChanged = false;
    try {
      sizeChanged = ensureOffscreen(frame.width, frame.height);
    } catch {
      return;
    }

    const ctx = offscreenCtxRef.current;
    if (!ctx) return;

    applyHighQualitySmoothing(ctx);

    if (frame.mode === 'full' || sizeChanged) {
      try {
        ctx.fillStyle = VIEW_BACKGROUND;
        ctx.fillRect(0, 0, frame.width, frame.height);
      } catch {
        return;
      }
    }

    const bitmaps: (ImageBitmap | null)[] = [];
    for (const rect of frame.rects) {
      try {
        bitmaps.push(await decodeRectJpeg(rect.jpeg));
      } catch {
        bitmaps.push(null);
      }
    }

    if (seq !== renderSeqRef.current) {
      bitmaps.forEach((bitmap) => {
        try {
          bitmap?.close();
        } catch {
          // ignore
        }
      });
      return;
    }

    for (let i = 0; i < frame.rects.length; i++) {
      const bitmap = bitmaps[i];
      const rect = frame.rects[i];
      if (!bitmap) continue;
      try {
        ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
      } catch {
        // skip corrupt patch; offscreen keeps previous pixels in this rect
      } finally {
        try {
          bitmap.close();
        } catch {
          // ignore
        }
      }
    }

    setHasReceivedFrame(true);

    const now = performance.now();
    setFrameCount((c) => c + 1);
    statsRef.current.frameCount += 1;
    const elapsed = now - statsRef.current.lastFrameTime;
    if (elapsed >= 1000) {
      statsRef.current.fps = Math.round((statsRef.current.frameCount * 1000) / elapsed);
      statsRef.current.frameCount = 0;
      statsRef.current.lastFrameTime = now;
      setFps(statsRef.current.fps);
    }
  }, [ensureOffscreen]);

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const link = document.createElement('a');
    link.download = `remotedesk-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  const initializeDisplayCanvas = useCallback(() => {
    if (displayInitializedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    try {
      applyHighQualitySmoothing(ctx);
      const w = Math.max(canvas.width, canvas.clientWidth, 1);
      const h = Math.max(canvas.height, canvas.clientHeight, 1);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.fillStyle = VIEW_BACKGROUND;
      ctx.fillRect(0, 0, w, h);
      displayInitializedRef.current = true;
    } catch {
      // ignore
    }
  }, [canvasRef]);

  return {
    fps,
    frameCount,
    dimensions,
    hasReceivedFrame,
    renderFrame,
    takeScreenshot,
    initializeDisplayCanvas,
  };
}
