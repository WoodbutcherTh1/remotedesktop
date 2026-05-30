'use client';

import { useCallback, useRef } from 'react';
import { RemoteSettings } from '@/lib/settings-store';
import {
  clampViewOffset,
  clampViewScale,
  shouldPanOnDrag,
  ViewTransform,
} from '@/lib/view-transform';

const TAP_THRESHOLD_PX = 5;

interface TouchHandlerProps {
  settings: RemoteSettings;
  mapCoords: (clientX: number, clientY: number) => { x: number; y: number } | null;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  viewTransform: ViewTransform;
  onViewTransformChange: (next: ViewTransform) => void;
  containerWidth: number;
  containerHeight: number;
}

export default function TouchHandler({
  settings,
  mapCoords,
  sendCommand,
  viewTransform,
  onViewTransformChange,
  containerWidth,
  containerHeight,
}: TouchHandlerProps) {
  const { scale } = viewTransform;
  const lastTapRef = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const lastPinchDist = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const isPanningRef = useRef(false);
  const isPinchingRef = useRef(false);

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

  const applyPan = useCallback(
    (clientX: number, clientY: number) => {
      const start = panStartRef.current;
      if (!start) return;

      const dx = clientX - start.x;
      const dy = clientY - start.y;
      const clamped = clampViewOffset(
        start.offsetX + dx,
        start.offsetY + dy,
        scale,
        containerWidth,
        containerHeight,
      );
      onViewTransformChange({ scale, ...clamped });
    },
    [containerHeight, containerWidth, onViewTransformChange, scale],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || e.isPrimary === false || isPinchingRef.current) return;

      const panOnDrag = shouldPanOnDrag(scale, settings.mouse.touchMode);
      isPanningRef.current = panOnDrag;

      if (panOnDrag) {
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          offsetX: viewTransform.offsetX,
          offsetY: viewTransform.offsetY,
        };
        touchStartRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

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
    [getPointerCoords, sendCommand, settings, scale, settings.mouse.touchMode, viewTransform.offsetX, viewTransform.offsetY],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || isPinchingRef.current) return;

      if (isPanningRef.current) {
        clearLongPressTimer();
        applyPan(e.clientX, e.clientY);
        return;
      }

      clearLongPressTimer();

      const coords = getPointerCoords(e.clientX, e.clientY);
      if (!coords) return;
      lastCoordsRef.current = coords;

      sendCommand('mouse_move', coords);
    },
    [applyPan, clearLongPressTimer, getPointerCoords, sendCommand],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      clearLongPressTimer();

      if (isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        touchStartRef.current = null;
        return;
      }

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
        isPinchingRef.current = true;
        isPanningRef.current = false;
        panStartRef.current = null;
        clearLongPressTimer();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
      }
    },
    [clearLongPressTimer],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      if (lastPinchDist.current > 0) {
        const pinchScale = dist / lastPinchDist.current;
        if (Math.abs(pinchScale - 1) > 0.01) {
          const nextScale = clampViewScale(scale * pinchScale);
          const clamped = clampViewOffset(
            viewTransform.offsetX,
            viewTransform.offsetY,
            nextScale,
            containerWidth,
            containerHeight,
          );
          onViewTransformChange({ scale: nextScale, ...clamped });
        }
      }
      lastPinchDist.current = dist;
    },
    [
      containerHeight,
      containerWidth,
      onViewTransformChange,
      scale,
      viewTransform.offsetX,
      viewTransform.offsetY,
    ],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        isPinchingRef.current = false;
        lastPinchDist.current = 0;
      }
    },
    [],
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
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    />
  );
}
