'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FrameMessage } from '@/lib/constants';
import { ColorMode, RemoteSettings, ScaleMode } from '@/lib/settings-store';

interface FrameRendererState {
  fps: number;
  frameCount: number;
  lastFrameTime: number;
}

function drawToDisplayCanvas(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  scaleMode: ScaleMode,
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, destW, destH);

  if (srcW === 0 || srcH === 0) return;

  if (scaleMode === 'stretch') {
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, destW, destH);
    return;
  }

  if (scaleMode === 'original') {
    const x = Math.max(0, (destW - srcW) / 2);
    const y = Math.max(0, (destH - srcH) / 2);
    ctx.drawImage(source, 0, 0, srcW, srcH, x, y, srcW, srcH);
    return;
  }

  const scale = Math.min(destW / srcW, destH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const drawX = (destW - drawW) / 2;
  const drawY = (destH - drawH) / 2;
  ctx.drawImage(source, 0, 0, srcW, srcH, drawX, drawY, drawW, drawH);
}

export function useFrameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement>,
  settings: RemoteSettings,
  connected: boolean,
) {
  const [fps, setFps] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const pendingFrameRef = useRef<FrameMessage | null>(null);
  const rafRef = useRef<number | null>(null);
  const statsRef = useRef<FrameRendererState>({ fps: 0, frameCount: 0, lastFrameTime: performance.now() });
  const lastRenderRef = useRef(0);

  useEffect(() => {
    if (!connected) {
      setHasReceivedFrame(false);
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

  const renderFrame = useCallback(async () => {
    const canvas = canvasRef.current;
    const frame = pendingFrameRef.current;
    if (!canvas || !frame) return;

    const now = performance.now();
    const fpsLimit = settings.display.fpsLimit;
    const minInterval = fpsLimit > 0 ? 1000 / fpsLimit : 0;
    if (minInterval > 0 && now - lastRenderRef.current < minInterval) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    lastRenderRef.current = now;

    if (!bufferRef.current) {
      bufferRef.current = document.createElement('canvas');
    }
    const buffer = bufferRef.current;
    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return;

    if (frame.mode === 'full' || buffer.width !== frame.width || buffer.height !== frame.height) {
      buffer.width = frame.width;
      buffer.height = frame.height;
      setDimensions({ width: frame.width, height: frame.height });
    }

    for (const rect of frame.rects) {
      try {
        const binary = atob(rect.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);
        bufferCtx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
        bitmap.close();
      } catch {
        // skip corrupt rect
      }
    }

    const container = containerRef.current;
    const displayW = container?.clientWidth ?? frame.width;
    const displayH = container?.clientHeight ?? frame.height;

    canvas.width = displayW;
    canvas.height = displayH;

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: settings.display.hardwareAcceleration,
    });
    if (!ctx) return;

    applyColorMode(ctx, settings.display.colorMode);
    drawToDisplayCanvas(
      ctx,
      buffer,
      frame.width,
      frame.height,
      displayW,
      displayH,
      settings.display.scaleMode,
    );

    setHasReceivedFrame(true);

    statsRef.current.frameCount += 1;
    const elapsed = now - statsRef.current.lastFrameTime;
    if (elapsed >= 1000) {
      statsRef.current.fps = Math.round((statsRef.current.frameCount * 1000) / elapsed);
      statsRef.current.frameCount = 0;
      statsRef.current.lastFrameTime = now;
      setFps(statsRef.current.fps);
    }

    pendingFrameRef.current = null;
    rafRef.current = requestAnimationFrame(renderFrame);
  }, [canvasRef, containerRef, settings.display, applyColorMode]);

  const queueFrame = useCallback(
    (frame: FrameMessage) => {
      pendingFrameRef.current = frame;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    },
    [renderFrame],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const link = document.createElement('a');
    link.download = `remotedesk-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  return { fps, dimensions, hasReceivedFrame, queueFrame, takeScreenshot };
}
