'use client';

import { useRef, useState } from 'react';
import { RemoteSettings } from '@/lib/settings-store';
import { useMouseHandler } from '@/hooks/useMouseHandler';
import TouchHandler from './TouchHandler';

interface RemoteCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: RemoteSettings;
  remoteWidth: number;
  remoteHeight: number;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  showStats: boolean;
  fps: number;
  latency: number;
}

export default function RemoteCanvas({
  canvasRef,
  settings,
  remoteWidth,
  remoteHeight,
  sendCommand,
  showStats,
  fps,
  latency,
}: RemoteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  const containerClass =
    settings.display.scaleMode === 'fit'
      ? 'flex items-center justify-center w-full h-full'
      : settings.display.scaleMode === 'original'
        ? 'overflow-auto'
        : 'flex items-stretch w-full h-full';

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-0 w-screen h-[100dvh] md:relative md:inset-auto md:flex-1 md:w-auto md:h-auto bg-black md:bg-background overflow-hidden ${containerClass}`}
    >
      <div
        className="relative max-w-full max-h-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
      >
        <canvas
          ref={canvasRef as React.RefObject<HTMLCanvasElement>}
          className="bg-black block border-0 md:border md:border-white/[0.08]"
          style={{
            cursor: settings.mouse.showLocalCursor
              ? cursorStyleMap[settings.mouse.cursorStyle]
              : 'none',
            maxWidth: settings.display.scaleMode === 'fit' ? '100%' : undefined,
            maxHeight: settings.display.scaleMode === 'fit' ? '100%' : undefined,
            width: settings.display.scaleMode === 'stretch' ? '100%' : undefined,
            height: settings.display.scaleMode === 'stretch' ? '100%' : undefined,
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

      <TouchHandler
        canvasRef={canvasRef}
        settings={settings}
        mapCoords={mapCoords}
        sendCommand={sendCommand}
        onZoomChange={setZoom}
        zoom={zoom}
      />

      {showStats && (
        <div className="absolute top-2 left-2 glass rounded px-3 py-2 font-mono text-xs space-y-0.5">
          <div>FPS: {fps}</div>
          <div>Latency: {latency}ms</div>
          <div>Resolution: {remoteWidth}×{remoteHeight}</div>
          <div>Scale: {settings.display.scaleMode}</div>
        </div>
      )}
    </div>
  );
}
