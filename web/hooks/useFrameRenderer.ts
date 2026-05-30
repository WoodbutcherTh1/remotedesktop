'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FrameMessage } from '@/lib/constants';
import { ColorMode, RemoteSettings } from '@/lib/settings-store';

interface FrameRendererState {
  fps: number;
  frameCount: number;
  lastFrameTime: number;
}

export function useFrameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  settings: RemoteSettings,
) {
  const [fps, setFps] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const frameBufferRef = useRef<ImageBitmap | null>(null);
  const pendingFrameRef = useRef<FrameMessage | null>(null);
  const rafRef = useRef<number | null>(null);
  const statsRef = useRef<FrameRendererState>({ fps: 0, frameCount: 0, lastFrameTime: performance.now() });
  const lastRenderRef = useRef(0);

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

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: settings.display.hardwareAcceleration,
    });
    if (!ctx) return;

    applyColorMode(ctx, settings.display.colorMode);

    if (frame.mode === 'full' || canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
      setDimensions({ width: frame.width, height: frame.height });
    }

    for (const rect of frame.rects) {
      try {
        const binary = atob(rect.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);
        ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
        bitmap.close();
      } catch {
        // skip corrupt rect
      }
    }

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
  }, [canvasRef, settings.display, applyColorMode]);

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
      frameBufferRef.current?.close();
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

  return { fps, dimensions, queueFrame, takeScreenshot };
}
