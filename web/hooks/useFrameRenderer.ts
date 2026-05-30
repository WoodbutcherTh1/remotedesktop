'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FrameMessage } from '@/lib/constants';
import { ColorMode, RemoteSettings } from '@/lib/settings-store';

interface FrameRendererState {
  fps: number;
  frameCount: number;
  lastFrameTime: number;
}

async function decodeRect(
  rect: FrameMessage['rects'][number],
): Promise<ImageBitmap | null> {
  try {
    const binary = atob(rect.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    return await createImageBitmap(blob);
  } catch {
    return null;
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
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const frameQueueRef = useRef<FrameMessage[]>([]);
  const processingRef = useRef(false);
  const statsRef = useRef<FrameRendererState>({ fps: 0, frameCount: 0, lastFrameTime: performance.now() });

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

  const presentBuffer = useCallback(
    (canvas: HTMLCanvasElement, buffer: HTMLCanvasElement) => {
      if (canvas.width !== buffer.width || canvas.height !== buffer.height) {
        canvas.width = buffer.width;
        canvas.height = buffer.height;
      }

      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: settings.display.hardwareAcceleration,
      });
      if (!ctx) return;

      applyColorMode(ctx, settings.display.colorMode);
      ctx.drawImage(buffer, 0, 0);
    },
    [applyColorMode, settings.display.hardwareAcceleration],
  );

  const processOneFrame = useCallback(
    async (frame: FrameMessage) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!bufferRef.current) {
        bufferRef.current = document.createElement('canvas');
      }
      const buffer = bufferRef.current;
      const bufferCtx = buffer.getContext('2d');
      if (!bufferCtx) return;

      const sizeChanged = buffer.width !== frame.width || buffer.height !== frame.height;
      if (sizeChanged) {
        buffer.width = frame.width;
        buffer.height = frame.height;
        setDimensions({ width: frame.width, height: frame.height });
      }

      if (frame.mode === 'full') {
        bufferCtx.fillStyle = '#000';
        bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
      } else if (sizeChanged) {
        bufferCtx.fillStyle = '#000';
        bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
      }

      for (const rect of frame.rects) {
        const bitmap = await decodeRect(rect);
        if (!bitmap) continue;
        bufferCtx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
        bitmap.close();
      }

      presentBuffer(canvas, buffer);
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
    },
    [canvasRef, presentBuffer],
  );

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (frameQueueRef.current.length > 0) {
      const frame = frameQueueRef.current.shift()!;
      await processOneFrame(frame);
    }

    processingRef.current = false;
  }, [processOneFrame]);

  const queueFrame = useCallback(
    (frame: FrameMessage) => {
      frameQueueRef.current.push(frame);
      void drainQueue();
    },
    [drainQueue],
  );

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const link = document.createElement('a');
    link.download = `remotedesk-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  return { fps, frameCount, dimensions, hasReceivedFrame, queueFrame, takeScreenshot };
}
