'use client';

import { useCallback, useRef, useState } from 'react';
import { RemoteSettings } from '@/lib/settings-store';

interface UseMouseHandlerOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: RemoteSettings;
  remoteWidth: number;
  remoteHeight: number;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  scaleMode: 'fit' | 'original' | 'stretch';
}

export function useMouseHandler({
  canvasRef,
  settings,
  remoteWidth,
  remoteHeight,
  sendCommand,
  scaleMode,
}: UseMouseHandlerOptions) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const relativePosRef = useRef({ x: 0, y: 0 });

  const mapCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || remoteWidth === 0 || remoteHeight === 0) return null;

      const rect = canvas.getBoundingClientRect();
      let localX = clientX - rect.left;
      let localY = clientY - rect.top;

      const displayW = rect.width;
      const displayH = rect.height;

      if (scaleMode === 'fit') {
        const scale = Math.min(displayW / remoteWidth, displayH / remoteHeight);
        const offsetX = (displayW - remoteWidth * scale) / 2;
        const offsetY = (displayH - remoteHeight * scale) / 2;
        localX = (localX - offsetX) / scale;
        localY = (localY - offsetY) / scale;
      } else if (scaleMode === 'original') {
        localX = localX * (remoteWidth / displayW);
        localY = localY * (remoteHeight / displayH);
      } else {
        localX = localX * (remoteWidth / displayW);
        localY = localY * (remoteHeight / displayH);
      }

      return {
        x: Math.max(0, Math.min(remoteWidth - 1, Math.round(localX))),
        y: Math.max(0, Math.min(remoteHeight - 1, Math.round(localY))),
      };
    },
    [canvasRef, remoteWidth, remoteHeight, scaleMode],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const { mouse } = settings;
      if (mouse.mode === 'relative') {
        relativePosRef.current.x += e.movementX;
        relativePosRef.current.y += e.movementY;
        relativePosRef.current.x = Math.max(0, Math.min(remoteWidth - 1, relativePosRef.current.x));
        relativePosRef.current.y = Math.max(0, Math.min(remoteHeight - 1, relativePosRef.current.y));
        if (mouse.showRemoteCursor) setCursorPos({ ...relativePosRef.current });
        sendCommand('mouse_move', { x: relativePosRef.current.x, y: relativePosRef.current.y });
        return;
      }

      const coords = mapCoords(e.clientX, e.clientY);
      if (!coords) return;
      if (mouse.showRemoteCursor) setCursorPos(coords);

      if (isDraggingRef.current && mouse.dragEnabled) {
        sendCommand('mouse_drag', coords);
      } else {
        sendCommand('mouse_move', coords);
      }
    },
    [settings, mapCoords, sendCommand, remoteWidth, remoteHeight],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const coords = mapCoords(e.clientX, e.clientY);
      if (!coords) return;

      const isRight =
        e.button === 2 ||
        (settings.mouse.ctrlClickAsRightClick && (e.ctrlKey || e.metaKey));

      if (settings.mouse.mode === 'absolute') {
        sendCommand('mouse_move', coords);
      }

      sendCommand('mouse_click', {
        button: isRight ? 'right' : 'left',
        pressed: true,
        x: coords.x,
        y: coords.y,
      });

      if (settings.mouse.dragEnabled) {
        isDraggingRef.current = true;
      }
    },
    [mapCoords, sendCommand, settings],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const isRight =
        e.button === 2 ||
        (settings.mouse.ctrlClickAsRightClick && (e.ctrlKey || e.metaKey));
      sendCommand('mouse_click', {
        button: isRight ? 'right' : 'left',
        pressed: false,
      });
      isDraggingRef.current = false;
    },
    [sendCommand, settings],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const coords = mapCoords(e.clientX, e.clientY);
      if (!coords) return;
      sendCommand('mouse_move', coords);
      sendCommand('mouse_double_click', {
        button: e.button === 2 ? 'right' : 'left',
      });
    },
    [mapCoords, sendCommand],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const speed = settings.mouse.scrollSpeed;
      const dir = settings.mouse.scrollDirection === 'natural' ? -1 : 1;
      let dx = 0;
      let dy = 0;

      if (settings.mouse.scrollMethod === 'pixel') {
        dy = Math.round(e.deltaY * dir * speed * 0.1);
        dx = Math.round(e.deltaX * dir * speed * 0.1);
      } else if (settings.mouse.scrollMethod === 'smooth') {
        dy = Math.round(e.deltaY * dir * speed * 0.05);
        dx = Math.round(e.deltaX * dir * speed * 0.05);
      } else {
        dy = Math.sign(e.deltaY) * speed * dir;
        dx = Math.sign(e.deltaX) * speed * dir;
      }

      sendCommand('mouse_scroll', { dx, dy });
    },
    [sendCommand, settings.mouse],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    cursorPos,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handleDoubleClick,
    handleWheel,
    handleContextMenu,
    mapCoords,
  };
}
