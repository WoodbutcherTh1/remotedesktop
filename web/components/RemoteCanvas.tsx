'use client';

import { useRef, useState } from 'react';
import { RemoteSettings } from '@/lib/settings-store';
import { useMouseHandler } from '@/hooks/useMouseHandler';
import TouchHandler from './TouchHandler';

interface RemoteCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement>;
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
}

export default function RemoteCanvas({
  canvasRef,
  containerRef,
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
}: RemoteCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const { cursorPos, handleMouseMove, handleMouseDown, handleMouseUp, handleDoubleClick, handleWheel, handleContextMenu, mapCoords } =
    useMouseHandler({
      canvasRef,
      settings,
      remoteWidth,
      remoteHeight,
      sendCommand,
      scaleMode: settings.display.scaleMode,
    });

  const cursorStyleMap: Record<string, string> = {
    default: 'default',
    crosshair: 'crosshair',
    dot: 'none',
    pointer: 'pointer',
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 m-0 p-0 w-[100vw] h-[100dvh] overflow-hidden bg-black md:relative md:inset-auto md:flex-1 md:w-auto md:h-auto md:bg-background"
    >
      <div
        className="relative w-full h-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
      >
        <canvas
          ref={canvasRef as React.RefObject<HTMLCanvasElement>}
          className="block w-full h-full object-contain bg-black border-0 md:border md:border-white/[0.08]"
          style={{
            cursor: settings.mouse.showLocalCursor
              ? cursorStyleMap[settings.mouse.cursorStyle]
              : 'none',
          }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        />

        {settings.mouse.showRemoteCursor && cursorPos && remoteWidth > 0 && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: `${(cursorPos.x / remoteWidth) * 100}%`,
              top: `${(cursorPos.y / remoteHeight) * 100}%`,
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
      </div>

      {connected && !hasReceivedFrame && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-zinc-400">Waiting for screen...</p>
        </div>
      )}

      <TouchHandler
        canvasRef={canvasRef}
        settings={settings}
        mapCoords={mapCoords}
        sendCommand={sendCommand}
        onZoomChange={setZoom}
        zoom={zoom}
      />

      <div className="md:hidden absolute top-2 right-2 z-30 glass rounded px-2 py-1 font-mono text-[10px] text-zinc-400 pointer-events-none">
        #{frameCount} · {fps} FPS
      </div>

      {showStats && (
        <div className="absolute top-2 left-2 glass rounded px-3 py-2 font-mono text-xs space-y-0.5">
          <div>Frames: {frameCount}</div>
          <div>FPS: {fps}</div>
          <div>Latency: {latency}ms</div>
          <div>Resolution: {remoteWidth}×{remoteHeight}</div>
          <div>Scale: {settings.display.scaleMode}</div>
        </div>
      )}
    </div>
  );
}
