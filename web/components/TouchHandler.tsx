'use client';

import { useCallback, useRef } from 'react';
import { RemoteSettings } from '@/lib/settings-store';

interface TouchHandlerProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: RemoteSettings;
  mapCoords: (clientX: number, clientY: number) => { x: number; y: number } | null;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export default function TouchHandler({
  canvasRef,
  settings,
  mapCoords,
  sendCommand,
  zoom,
  onZoomChange,
}: TouchHandlerProps) {
  const lastTapRef = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const lastPinchDist = useRef(0);

  const getPointerCoords = useCallback(
    (clientX: number, clientY: number) => mapCoords(clientX, clientY),
    [mapCoords],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      if (e.pointerType === 'touch' && e.isPrimary === false) {
        return;
      }

      const coords = getPointerCoords(e.clientX, e.clientY);
      if (!coords) return;

      const now = Date.now();
      const doubleClickSpeed = settings.mouse.doubleClickSpeed;

      if (now - lastTapRef.current < doubleClickSpeed) {
        sendCommand('mouse_move', coords);
        sendCommand('mouse_double_click', { button: 'left' });
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      longPressTimer.current = setTimeout(() => {
        sendCommand('mouse_move', coords);
        sendCommand('mouse_click', { button: 'right', pressed: true });
        sendCommand('mouse_click', { button: 'right', pressed: false });
      }, settings.mouse.rightClickLongPress);

      if (settings.mouse.dragEnabled) {
        isDragging.current = true;
        sendCommand('mouse_move', coords);
        sendCommand('mouse_click', { button: 'left', pressed: true });
      }
    },
    [getPointerCoords, sendCommand, settings],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const coords = getPointerCoords(e.clientX, e.clientY);
      if (!coords) return;

      if (isDragging.current && settings.mouse.dragEnabled) {
        sendCommand('mouse_drag', coords);
      } else {
        sendCommand('mouse_move', coords);
      }
    },
    [getPointerCoords, sendCommand, settings],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;

        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const coords = mapCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (coords) {
            sendCommand('mouse_move', coords);
            sendCommand('mouse_click', { button: 'left', pressed: true });
            sendCommand('mouse_click', { button: 'left', pressed: false });
          }
        }
      }

      if (isDragging.current) {
        sendCommand('mouse_click', { button: 'left', pressed: false });
        isDragging.current = false;
      }
      lastPinchDist.current = 0;
    },
    [canvasRef, mapCoords, sendCommand],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      if (lastPinchDist.current > 0) {
        const scale = dist / lastPinchDist.current;
        if (Math.abs(scale - 1) > 0.02) {
          if (scale > 1) {
            onZoomChange(Math.min(zoom * 1.05, 3));
          } else {
            onZoomChange(Math.max(zoom * 0.95, 0.5));
          }
        }

        const scrollSpeed = settings.mouse.scrollSpeed;
        sendCommand('mouse_scroll', {
          dx: 0,
          dy: Math.sign(dy) * scrollSpeed,
        });
      }
      lastPinchDist.current = dist;
    },
    [sendCommand, settings.mouse.scrollSpeed, zoom, onZoomChange],
  );

  return (
    <div
      className="absolute inset-0 md:hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    />
  );
}
