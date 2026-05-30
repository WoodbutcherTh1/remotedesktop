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

function getViewportSize(viewState?: ViewState): { width: number; height: number } {
  if (viewState && viewState.containerWidth > 0 && viewState.containerHeight > 0) {
    return { width: viewState.containerWidth, height: viewState.containerHeight };
  }

  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return { width: Math.round(vv.width), height: Math.round(vv.height) };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

async function decodeJpeg(jpeg: Uint8Array): Promise<ImageBitmap | null> {
  try {
    const blob = new Blob([jpeg as BlobPart], { type: 'image/jpeg' });
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(blob);
    }
    return await decodeJpegViaImage(blob);
  } catch {
    try {
      const blob = new Blob([jpeg as BlobPart], { type: 'image/jpeg' });
      return await decodeJpegViaImage(blob);
    } catch {
      return null;
    }
  }
}

function decodeJpegViaImage(blob: Blob): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        createImageBitmap(canvas)
          .then(resolve)
          .catch(() => resolve(null));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
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

function get2dContext(
  buffer: CanvasBuffer,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  return buffer.getContext('2d', { alpha: false, desynchronized: true });
}

function applyHighQualitySmoothing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

function syncDisplayCanvasSize(
  canvas: HTMLCanvasElement,
  viewState?: ViewState,
): { width: number; height: number } {
  const viewport = getViewportSize(viewState);
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
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
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null>(
    null,
  );
  const renderSeqRef = useRef(0);
  const displayInitializedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const statsRef = useRef<FrameRendererState>({
    fps: 0,
    frameCount: 0,
    lastFrameTime: performance.now(),
  });
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
    const { width: bufferW, height: bufferH } = syncDisplayCanvasSize(canvas, viewState);
    if (bufferW <= 0 || bufferH <= 0) return;

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
        bufferW,
        bufferH,
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
    const onResize = () => paintDisplayCanvas();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, [paintDisplayCanvas]);

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
    offscreenCtxRef.current = ctx;
    if (ctx) {
      applyHighQualitySmoothing(ctx);
      ctx.fillStyle = VIEW_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
    }
    setDimensions({ width, height });
    return true;
  }, []);

  const renderFrame = useCallback(
    async (frame: BinaryFrame) => {
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
        bitmaps.push(await decodeJpeg(rect.jpeg));
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
          // skip corrupt patch
        } finally {
          try {
            bitmap.close();
          } catch {
            // ignore
          }
        }
      }

      setHasReceivedFrame(true);
      paintDisplayCanvas();

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
    },
    [ensureOffscreen, paintDisplayCanvas],
  );

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
      canvas.style.imageRendering = 'auto';
      const { width, height } = syncDisplayCanvasSize(canvas, viewStateRef.current);
      applyHighQualitySmoothing(ctx);
      ctx.fillStyle = VIEW_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
      displayInitializedRef.current = true;
    } catch {
      // ignore
    }
  }, [canvasRef, viewStateRef]);

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
