/** Layout viewport in CSS pixels — matches 100vw/100dvh, not visualViewport (iOS mismatch). */
export function getClientViewport(): {
  width: number;
  height: number;
  dpr: number;
} {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, dpr: 1 };
  }
  const doc = document.documentElement;
  return {
    width: doc.clientWidth || window.innerWidth,
    height: doc.clientHeight || window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

/** Set canvas backing-store size only; CSS (#remote-display-canvas) controls display size. */
export function resizeDisplayCanvas(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
  dpr: number;
} {
  const { width, height, dpr } = getClientViewport();

  const bw = Math.round(width * dpr);
  const bh = Math.round(height * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  return { width, height, dpr };
}
