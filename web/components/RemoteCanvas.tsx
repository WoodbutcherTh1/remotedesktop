'use client';

import { useCallback, useEffect, useState } from 'react';
import { RemoteSettings } from '@/lib/settings-store';
import {
  clampViewOffset,
  mapRemoteToClient,
  ViewState,
  ViewTransform,
} from '@/lib/view-transform';
import { useMouseHandler } from '@/hooks/useMouseHandler';
import TouchHandler from './TouchHandler';

function latencyColorClass(latency: number): string {
  if (latency < 100) return 'text-emerald-400';
  if (latency <= 300) return 'text-amber-400';
  return 'text-red-400';
}

interface RemoteCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement>;
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
  onCanvasMount?: () => void;
}

export default function RemoteCanvas({
  canvasRef,
  containerRef,
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
  onCanvasMount,
}: RemoteCanvasProps) {
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [containerSize, setContainerSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    onCanvasMount?.();
  }, [onCanvasMount]);

  useEffect(() => {
    const updateSize = () => {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    viewStateRef.current = {
      ...viewTransform,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    };
  }, [viewStateRef, viewTransform, containerSize.width, containerSize.height]);

  useEffect(() => {
    if (viewTransform.scale <= 1 && (viewTransform.offsetX !== 0 || viewTransform.offsetY !== 0)) {
      setViewTransform((prev) => ({ ...prev, offsetX: 0, offsetY: 0 }));
    }
  }, [viewTransform.scale, viewTransform.offsetX, viewTransform.offsetY]);

  const handleViewTransformChange = useCallback(
    (next: ViewTransform) => {
      const clamped = clampViewOffset(
        next.offsetX,
        next.offsetY,
        next.scale,
        containerSize.width,
        containerSize.height,
        remoteWidth,
        remoteHeight,
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
        )
      : null;

  return (
    <div
      ref={containerRef}
      className="remote-canvas-container fixed top-0 left-0 z-0 m-0 p-0 w-[100vw] h-[100dvh] overflow-hidden bg-[#0A0A0F]"
    >
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        className="remote-canvas absolute top-0 left-0 w-full h-full border-0 pointer-events-none md:pointer-events-auto"
        style={{
          backgroundColor: '#0A0A0F',
          imageRendering: 'auto',
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
          className="absolute pointer-events-none z-10"
          style={{
            left: `${cursorScreenPos.x}px`,
            top: `${cursorScreenPos.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {settings.mouse.cursorStyle === 'dot' ? (
            <div
              className="w-3 h-3 rounded-full border-2 border-white"
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
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-[#0A0A0F]">
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
      />

      <div className="md:hidden absolute top-2 right-2 z-30 glass rounded px-2 py-1 font-mono text-[10px] pointer-events-none">
        <span className={latencyColorClass(latency)}>{latency}ms</span>
        <span className="text-zinc-500"> · </span>
        <span className="text-zinc-300">{fps} FPS</span>
        <span className="text-zinc-500"> · #{frameCount}</span>
        {scale !== 1 && (
          <>
            <span className="text-zinc-500"> · </span>
            <span className="text-zinc-300">{Math.round(scale * 100)}%</span>
          </>
        )}
      </div>

      {showStats && (
        <div className="absolute top-2 left-2 glass rounded px-3 py-2 font-mono text-xs space-y-0.5 z-30 pointer-events-none">
          <div>Frames: {frameCount}</div>
          <div>Rendered FPS: {fps}</div>
          <div className={latencyColorClass(latency)}>Latency: {latency}ms</div>
          <div>Resolution: {remoteWidth}×{remoteHeight}</div>
          <div>Touch: {settings.mouse.touchMode}</div>
          <div>Zoom: {scale.toFixed(2)}x</div>
          <div>Pan: {offsetX.toFixed(0)}, {offsetY.toFixed(0)}</div>
        </div>
      )}
    </div>
  );
}
