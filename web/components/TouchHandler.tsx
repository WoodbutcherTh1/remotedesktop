'use client';

import { useCallback, useRef } from 'react';
import { RemoteSettings } from '@/lib/settings-store';

const TAP_THRESHOLD_PX = 5;

interface TouchHandlerProps {
  settings: RemoteSettings;
  mapCoords: (clientX: number, clientY: number) => { x: number; y: number } | null;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export default function TouchHandler({
  settings,
  mapCoords,
  sendCommand,
  zoom,
  onZoomChange,
}: TouchHandlerProps) {
  const lastTapRef = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const lastPinchDist = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const getPointerCoords = useCallback(
    (clientX: number, clientY: number) => mapCoords(clientX, clientY),
    [mapCoords],
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || e.isPrimary === false) return;

      const coords = getPointerCoords(e.clientX, e.clientY);
      if (!coords) return;

      touchStartRef.current = { x: e.clientX, y: e.clientY };
      lastCoordsRef.current = coords;
      longPressFiredRef.current = false;

      const now = Date.now();
      const doubleClickSpeed = settings.mouse.doubleClickSpeed;

      if (now - lastTapRef.current < doubleClickSpeed) {
        sendCommand('mouse_move', coords);
        sendCommand('mouse_double_click', { button: 'left' });
        lastTapRef.current = 0;
        touchStartRef.current = null;
        return;
      }
      lastTapRef.current = now;

      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        longPressFiredRef.current = true;
        const pos = lastCoordsRef.current;
        if (!pos) return;
        sendCommand('mouse_move', pos);
        sendCommand('mouse_click', { button: 'right', pressed: true });
        sendCommand('mouse_click', { button: 'right', pressed: false });
      }, settings.mouse.rightClickLongPress);
    },
    [getPointerCoords, sendCommand, settings],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      clearLongPressTimer();

      const coords = getPointerCoords(e.clientX, e.clientY);
      if (!coords) return;
      lastCoordsRef.current = coords;

      sendCommand('mouse_move', coords);
    },
    [clearLongPressTimer, getPointerCoords, sendCommand],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      clearLongPressTimer();

      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        touchStartRef.current = null;
        lastPinchDist.current = 0;
        return;
      }

      const start = touchStartRef.current;
      const coords = getPointerCoords(e.clientX, e.clientY);
      touchStartRef.current = null;
      lastPinchDist.current = 0;

      if (!start || !coords) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < TAP_THRESHOLD_PX) {
        sendCommand('mouse_move', coords);
        sendCommand('mouse_click', { button: 'left', pressed: true, x: coords.x, y: coords.y });
        sendCommand('mouse_click', { button: 'left', pressed: false });
      }
    },
    [clearLongPressTimer, getPointerCoords, sendCommand],
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
