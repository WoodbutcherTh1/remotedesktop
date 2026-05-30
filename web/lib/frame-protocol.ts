/** Binary frame wire format (big-endian):
 *  [0]     magic 0xFD
 *  [1]     mode: 0=full, 1=dirty
 *  [2-5]   width u32
 *  [6-9]   height u32
 *  [10-13] timestamp u32 (ms)
 *  [14-15] quality u16
 *  [16-17] num_rects u16
 *  per rect:
 *    [0-3]   x u32
 *    [4-7]   y u32
 *    [8-11]  w u32
 *    [12-15] h u32
 *    [16-19] jpeg_len u32
 *    [20..]  jpeg bytes
 */

export const FRAME_MAGIC = 0xfd;

export interface BinaryFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  jpeg: Uint8Array;
}

export interface BinaryFrame {
  mode: 'full' | 'dirty';
  width: number;
  height: number;
  timestamp: number;
  quality: number;
  rects: BinaryFrameRect[];
}

export function isBinaryFrame(data: ArrayBuffer | ArrayBufferLike): boolean {
  if (data.byteLength < 1) return false;
  return new Uint8Array(data)[0] === FRAME_MAGIC;
}

export function parseBinaryFrame(data: ArrayBuffer): BinaryFrame | null {
  if (data.byteLength < 18) return null;

  const view = new DataView(data);
  if (view.getUint8(0) !== FRAME_MAGIC) return null;

  const mode = view.getUint8(1) === 0 ? 'full' : 'dirty';
  const width = view.getUint32(2);
  const height = view.getUint32(6);
  const timestamp = view.getUint32(10);
  const quality = view.getUint16(14);
  const numRects = view.getUint16(16);

  let offset = 18;
  const rects: BinaryFrameRect[] = [];

  for (let i = 0; i < numRects; i++) {
    if (offset + 20 > data.byteLength) return null;
    const x = view.getUint32(offset);
    offset += 4;
    const y = view.getUint32(offset);
    offset += 4;
    const w = view.getUint32(offset);
    offset += 4;
    const h = view.getUint32(offset);
    offset += 4;
    const jpegLen = view.getUint32(offset);
    offset += 4;
    if (offset + jpegLen > data.byteLength) return null;
    rects.push({ x, y, w, h, jpeg: new Uint8Array(data, offset, jpegLen) });
    offset += jpegLen;
  }

  return { mode, width, height, timestamp, quality, rects };
}
