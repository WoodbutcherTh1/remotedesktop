/** Client device viewport (the device the user connects from). */
export function getClientViewport(): {
  width: number;
  height: number;
  dpr: number;
} {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, dpr: 1 };
  }
  const vv = window.visualViewport;
  return {
    width: Math.floor(vv?.width ?? window.innerWidth),
    height: Math.floor(vv?.height ?? window.innerHeight),
    dpr: window.devicePixelRatio || 1,
  };
}

export function resizeDisplayCanvas(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
  dpr: number;
} {
  const { width, height, dpr } = getClientViewport();

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.right = 'auto';
  canvas.style.bottom = 'auto';
  canvas.style.margin = '0';
  canvas.style.padding = '0';
  canvas.style.border = 'none';
  canvas.style.display = 'block';
  canvas.style.maxWidth = 'none';
  canvas.style.maxHeight = 'none';
  canvas.style.zIndex = '1';
  canvas.style.touchAction = 'none';
  canvas.style.backgroundColor = '#0A0A0F';

  const bw = Math.round(width * dpr);
  const bh = Math.round(height * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  return { width, height, dpr };
}
