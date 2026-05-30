'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BinaryFrame } from '@/lib/frame-protocol';
import { ColorMode, RemoteSettings } from '@/lib/settings-store';
import { VIEW_BACKGROUND } from '@/lib/view-transform';

type CanvasBuffer = HTMLCanvasElement | OffscreenCanvas;

interface FrameRendererState {
  fps: number;
  frameCount: number;
  lastFrameTime: number;
}

async function decodeJpeg(jpeg: Uint8Array): Promise<ImageBitmap | null> {
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

function resizeDisplayCanvas(canvas: HTMLCanvasElement): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function useFrameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  settings: RemoteSettings,
  connected: boolean,
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

    resizeDisplayCanvas(canvas);

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: settingsRef.current.display.hardwareAcceleration,
    });
    if (!ctx) return;

    const remoteWidth = offscreen.width;
    const remoteHeight = offscreen.height;
    const scaleX = canvas.width / remoteWidth;
    const scaleY = canvas.height / remoteHeight;
    const scale = Math.min(scaleX, scaleY);
    const x = (canvas.width - remoteWidth * scale) / 2;
    const y = (canvas.height - remoteHeight * scale) / 2;

    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      applyColorMode(ctx, settingsRef.current.display.colorMode);
      ctx.drawImage(
        offscreen as CanvasImageSource,
        x,
        y,
        remoteWidth * scale,
        remoteHeight * scale,
      );
    } catch {
      // keep last painted display frame
    }
  }, [applyColorMode, canvasRef]);

  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (canvas) resizeDisplayCanvas(canvas);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [canvasRef]);

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

  const ensureOffscreen = useCallback((width: number, height: number): void => {
    const existing = offscreenRef.current;
    if (existing && existing.width === width && existing.height === height) {
      if (!offscreenCtxRef.current) {
        offscreenCtxRef.current = get2dContext(existing);
      }
      return;
    }

    const offscreen = createBufferCanvas(width, height);
    offscreenRef.current = offscreen;
    const ctx = get2dContext(offscreen);
    offscreenCtxRef.current = ctx;
    if (ctx) {
      applyHighQualitySmoothing(ctx);
    }
    setDimensions({ width, height });
  }, []);

  const renderFrame = useCallback(async (frame: BinaryFrame) => {
    const seq = ++renderSeqRef.current;

    try {
      ensureOffscreen(frame.width, frame.height);
    } catch {
      return;
    }

    const ctx = offscreenCtxRef.current;
    if (!ctx) return;

    const fullRect =
      frame.rects.find((r) => r.x === 0 && r.y === 0 && r.w === frame.width && r.h === frame.height) ??
      frame.rects[0];
    if (!fullRect) return;

    const bitmap = await decodeJpeg(fullRect.jpeg);
    if (seq !== renderSeqRef.current) {
      bitmap?.close();
      return;
    }
    if (!bitmap) return;

    try {
      applyHighQualitySmoothing(ctx);
      ctx.drawImage(bitmap, 0, 0, frame.width, frame.height);
    } catch {
      // skip corrupt frame
    } finally {
      try {
        bitmap.close();
      } catch {
        // ignore
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
      canvas.style.imageRendering = 'auto';
      resizeDisplayCanvas(canvas);
      applyHighQualitySmoothing(ctx);
      ctx.fillStyle = VIEW_BACKGROUND;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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
