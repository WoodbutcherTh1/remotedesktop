'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BinaryFrame } from '@/lib/frame-protocol';
import { ColorMode, RemoteSettings } from '@/lib/settings-store';

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

export function useFrameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  settings: RemoteSettings,
  connected: boolean,
) {
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const bufferRef = useRef<CanvasBuffer | null>(null);
  const renderSeqRef = useRef(0);
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
    (canvas: HTMLCanvasElement, buffer: CanvasBuffer) => {
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
      ctx.drawImage(buffer as CanvasImageSource, 0, 0);
    },
    [applyColorMode, settings.display.hardwareAcceleration],
  );

  const renderFrame = useCallback(
    async (frame: BinaryFrame) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const seq = ++renderSeqRef.current;

      if (!bufferRef.current) {
        bufferRef.current = createBufferCanvas(frame.width, frame.height);
      }
      const buffer = bufferRef.current;
      const bufferCtx = get2dContext(buffer);
      if (!bufferCtx) return;

      const sizeChanged = buffer.width !== frame.width || buffer.height !== frame.height;
      if (sizeChanged) {
        bufferRef.current = createBufferCanvas(frame.width, frame.height);
        const newBuffer = bufferRef.current;
        const newCtx = get2dContext(newBuffer);
        if (!newCtx) return;
        newCtx.fillStyle = '#000';
        newCtx.fillRect(0, 0, frame.width, frame.height);
        setDimensions({ width: frame.width, height: frame.height });
      }

      const activeBuffer = bufferRef.current!;
      const activeCtx = get2dContext(activeBuffer)!;

      if (frame.mode === 'full' || sizeChanged) {
        activeCtx.fillStyle = '#000';
        activeCtx.fillRect(0, 0, frame.width, frame.height);
      }

      const bitmaps = await Promise.all(frame.rects.map((rect) => decodeRectJpeg(rect.jpeg)));

      if (seq !== renderSeqRef.current) {
        bitmaps.forEach((bitmap) => bitmap?.close());
        return;
      }

      for (let i = 0; i < frame.rects.length; i++) {
        const bitmap = bitmaps[i];
        const rect = frame.rects[i];
        if (!bitmap) continue;
        activeCtx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
        bitmap.close();
      }

      presentBuffer(canvas, activeBuffer);
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

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const link = document.createElement('a');
    link.download = `remotedesk-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  return { fps, frameCount, dimensions, hasReceivedFrame, renderFrame, takeScreenshot };
}
