'use client';

import { useCallback, useEffect, useState } from 'react';
import { isMobileViewport, RemoteSettings } from '@/lib/settings-store';
import { getClientViewport } from '@/lib/client-viewport';
import {
  clampViewOffset,
  mapRemoteToClient,
  ViewState,
  ViewTransform,
} from '@/lib/view-transform';
import { PaintMetrics } from '@/hooks/useFrameRenderer';
import { useMouseHandler } from '@/hooks/useMouseHandler';
import TouchHandler from './TouchHandler';

function latencyColorClass(latency: number): string {
  if (latency < 100) return 'text-emerald-400';
  if (latency <= 300) return 'text-amber-400';
  return 'text-red-400';
}

interface RemoteCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewStateRef: React.MutableRefObject<ViewState>;
  settings: RemoteSettings;
  remoteWidth: number;
  remoteHeight: number;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  showStats: boolean;
  fps: number;
  frameCount: number;
  latency: number;
  connected: boolean;
  hasReceivedFrame: boolean;
  paintMetrics: PaintMetrics;
  onCanvasMount?: () => void;
}

export default function RemoteCanvas({
  canvasRef,
  viewStateRef,
  settings,
  remoteWidth,
  remoteHeight,
  sendCommand,
  showStats,
  fps,
  frameCount,
  latency,
  connected,
  hasReceivedFrame,
  paintMetrics,
  onCanvasMount,
}: RemoteCanvasProps) {
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const scaleMode = isMobileViewport() ? ('fit' as const) : settings.display.scaleMode;

  useEffect(() => {
    onCanvasMount?.();
  }, [onCanvasMount]);

  useEffect(() => {
    setViewTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  }, [connected]);

  useEffect(() => {
    const readSize = () => {
      const { width, height } = getClientViewport();
      setContainerSize({ width, height });
    };

    readSize();
    window.addEventListener('resize', readSize);
    window.visualViewport?.addEventListener('resize', readSize);

    return () => {
      window.removeEventListener('resize', readSize);
      window.visualViewport?.removeEventListener('resize', readSize);
    };
  }, []);

  useEffect(() => {
    viewStateRef.current = {
      ...viewTransform,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      scaleMode,
    };
  }, [viewStateRef, viewTransform, containerSize.width, containerSize.height, scaleMode]);

  const handleViewTransformChange = useCallback(
    (next: ViewTransform) => {
      if (isMobileViewport()) {
        setViewTransform({ scale: 1, offsetX: 0, offsetY: 0 });
        return;
      }
      const clamped = clampViewOffset(
        next.offsetX,
        next.offsetY,
        next.scale,
        containerSize.width,
        containerSize.height,
        remoteWidth,
        remoteHeight,
        scaleMode,
      );
      setViewTransform({ scale: next.scale, ...clamped });
    },
    [containerSize.height, containerSize.width, remoteHeight, remoteWidth],
  );

  const {
    cursorPos,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handleDoubleClick,
    handleWheel,
    handleContextMenu,
    mapCoords,
  } = useMouseHandler({
    canvasRef,
    settings,
    remoteWidth,
    remoteHeight,
    sendCommand,
    viewTransform,
    scaleMode,
  });

  const cursorStyleMap: Record<string, string> = {
    default: 'default',
    crosshair: 'crosshair',
    dot: 'none',
    pointer: 'pointer',
  };

  const { scale, offsetX, offsetY } = viewTransform;
  const cursorScreenPos =
    cursorPos && remoteWidth > 0 && containerSize.width > 0
      ? mapRemoteToClient(
          cursorPos.x,
          cursorPos.y,
          remoteWidth,
          remoteHeight,
          containerSize.width,
          containerSize.height,
          viewTransform,
          scaleMode,
        )
      : null;

  const clientViewport = containerSize;

  return (
    <>
      <canvas
        id="remote-display-canvas"
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        style={{
          cursor: settings.mouse.showLocalCursor
            ? cursorStyleMap[settings.mouse.cursorStyle]
            : 'none',
        }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />

      {settings.mouse.showRemoteCursor && cursorScreenPos && (
        <div
          className="fixed pointer-events-none z-10"
          style={{
            left: `${cursorScreenPos.x}px`,
            top: `${cursorScreenPos.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {settings.mouse.cursorStyle === 'dot' ? (
            <div
              className="w-3 h-3 rounded-full border-2 border-zinc-200"
              style={{ backgroundColor: settings.mouse.cursorColor }}
            />
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill={settings.mouse.cursorColor}>
              <path d="M0 0 L0 16 L4 12 L7 19 L9 18 L6 11 L12 11 Z" />
            </svg>
          )}
        </div>
      )}

      {connected && !hasReceivedFrame && (
        <div className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none bg-[#0A0A0F]">
          <p className="text-sm text-zinc-400">Waiting for screen...</p>
        </div>
      )}

      <TouchHandler
        settings={settings}
        mapCoords={mapCoords}
        sendCommand={sendCommand}
        viewTransform={viewTransform}
        onViewTransformChange={handleViewTransformChange}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
        remoteWidth={remoteWidth}
        remoteHeight={remoteHeight}
        scaleMode={scaleMode}
      />

      <div className="md:hidden fixed top-2 right-2 z-50 glass rounded px-2 py-1 font-mono text-[10px] pointer-events-none">
        <span className="text-zinc-500">fill-v4 · </span>
        <span className={latencyColorClass(latency)}>{latency}ms</span>
        <span className="text-zinc-500"> · </span>
        <span className="text-zinc-300">{fps} FPS</span>
        <span className="text-zinc-500"> · </span>
        <span className="text-zinc-400">
          w{paintMetrics.w} dw{Math.round(paintMetrics.drawW)} x{Math.round(paintMetrics.x)}
        </span>
      </div>

      {showStats && (
        <div className="fixed top-2 left-2 glass rounded px-3 py-2 font-mono text-xs space-y-0.5 z-50 pointer-events-none">
          <div>fill-v4</div>
          <div>Frames: {frameCount}</div>
          <div>Rendered FPS: {fps}</div>
          <div className={latencyColorClass(latency)}>Latency: {latency}ms</div>
          <div>Remote: {remoteWidth}×{remoteHeight}</div>
          <div>Client: {clientViewport.width}×{clientViewport.height}</div>
          <div>
            Paint: w{paintMetrics.w} drawW{Math.round(paintMetrics.drawW)} x
            {Math.round(paintMetrics.x)}
          </div>
          <div>Scale: {scaleMode}</div>
          <div>Touch: {settings.mouse.touchMode}</div>
          <div>Zoom: {scale.toFixed(2)}x</div>
          <div>Pan: {offsetX.toFixed(0)}, {offsetY.toFixed(0)}</div>
        </div>
      )}
    </>
  );
}
