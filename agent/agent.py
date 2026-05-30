#!/usr/bin/env python3
"""RemoteDesk desktop agent — cross-platform screen capture and input relay."""

import asyncio
import hashlib
import io
import json
import logging
import os
import struct
import sys
import threading
import time
from typing import Any

import websockets
from dotenv import load_dotenv
from mss import mss
from PIL import Image
from pynput.keyboard import Controller as KeyboardController, Key
from pynput.mouse import Button, Controller as MouseController

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [agent] %(message)s')
log = logging.getLogger(__name__)

RELAY_URL = os.getenv('RELAY_URL', 'wss://remotedesktop-production-fd00.up.railway.app')
SECRET_TOKEN = os.getenv('SECRET_TOKEN', 'test1234')
CAPTURE_INTERVAL = 0.05
FULL_FRAME_INTERVAL = 1.0
PING_INTERVAL = 5.0
BLOCK_SIZE = 32
DEFAULT_QUALITY = 92
MIN_QUALITY = 75
MAX_QUALITY = 95
LATENCY_HIGH_MS = 200
LATENCY_LOW_MS = 100
FRAME_MAGIC = 0xFD
FRAME_QUEUE_MAX = 30

mouse = MouseController()
keyboard = KeyboardController()

KEY_MAP = {
    'enter': Key.enter, 'tab': Key.tab, 'space': Key.space,
    'backspace': Key.backspace, 'delete': Key.delete,
    'escape': Key.esc, 'up': Key.up, 'down': Key.down,
    'left': Key.left, 'right': Key.right,
    'home': Key.home, 'end': Key.end,
    'pageup': Key.page_up, 'pagedown': Key.page_down,
    'caps_lock': Key.caps_lock,
    'f1': Key.f1, 'f2': Key.f2, 'f3': Key.f3, 'f4': Key.f4,
    'f5': Key.f5, 'f6': Key.f6, 'f7': Key.f7, 'f8': Key.f8,
    'f9': Key.f9, 'f10': Key.f10, 'f11': Key.f11, 'f12': Key.f12,
    'shift': Key.shift, 'ctrl': Key.ctrl, 'alt': Key.alt,
    'cmd': Key.cmd, 'win': Key.cmd, 'meta': Key.cmd,
    'super': Key.cmd, 'control': Key.ctrl,
}


def _mac_display_scale() -> float:
    if sys.platform != 'darwin':
        return 1.0
    try:
        import ctypes
        import ctypes.util

        lib_path = ctypes.util.find_library('CoreGraphics')
        if not lib_path:
            return 1.0
        cg = ctypes.CDLL(lib_path)
        cg.CGMainDisplayID.restype = ctypes.c_uint32
        cg.CGDisplayCopyDisplayMode.argtypes = [ctypes.c_uint32]
        cg.CGDisplayCopyDisplayMode.restype = ctypes.c_void_p
        cg.CGDisplayModeGetWidth.argtypes = [ctypes.c_void_p]
        cg.CGDisplayModeGetWidth.restype = ctypes.c_size_t
        cg.CGDisplayModeGetPixelWidth.argtypes = [ctypes.c_void_p]
        cg.CGDisplayModeGetPixelWidth.restype = ctypes.c_size_t
        cg.CGDisplayModeRelease.argtypes = [ctypes.c_void_p]

        display_id = cg.CGMainDisplayID()
        mode = cg.CGDisplayCopyDisplayMode(display_id)
        if not mode:
            return 1.0
        try:
            logical_w = cg.CGDisplayModeGetWidth(mode)
            pixel_w = cg.CGDisplayModeGetPixelWidth(mode)
            if logical_w <= 0:
                return 1.0
            return max(1.0, pixel_w / logical_w)
        finally:
            cg.CGDisplayModeRelease(mode)
    except Exception:
        return 1.0


class ScreenCapture:
    def __init__(self) -> None:
        self.sct = mss()
        self.monitor = dict(self.sct.monitors[1])
        self.capture_width = self.monitor['width']
        self.capture_height = self.monitor['height']
        self._configure_native_resolution()
        self.prev_hash: str | None = None
        self.prev_image: Image.Image | None = None
        self.last_full_frame = 0.0
        self.quality = DEFAULT_QUALITY
        self.latency_ms = 0.0

    def _configure_native_resolution(self) -> None:
        scale = _mac_display_scale()
        if scale <= 1.0:
            return

        expected_w = int(round(self.monitor['width'] * scale))
        expected_h = int(round(self.monitor['height'] * scale))
        try:
            shot = self.sct.grab(self.monitor)
        except Exception:
            return

        if shot.width >= expected_w * 0.9 and shot.height >= expected_h * 0.9:
            self.capture_width = shot.width
            self.capture_height = shot.height
            log.info(
                'Using native capture resolution %dx%d (scale %.1fx)',
                shot.width,
                shot.height,
                scale,
            )
            return

        native_monitor = {
            'left': self.monitor['left'],
            'top': self.monitor['top'],
            'width': expected_w,
            'height': expected_h,
        }
        try:
            native_shot = self.sct.grab(native_monitor)
        except Exception:
            self.capture_width = shot.width
            self.capture_height = shot.height
            return

        if native_shot.width >= shot.width and native_shot.height >= shot.height:
            self.monitor = native_monitor
            self.capture_width = native_shot.width
            self.capture_height = native_shot.height
            log.info(
                'Configured native capture resolution %dx%d (scale %.1fx)',
                native_shot.width,
                native_shot.height,
                scale,
            )
        else:
            self.capture_width = shot.width
            self.capture_height = shot.height

    @property
    def width(self) -> int:
        return self.capture_width

    @property
    def height(self) -> int:
        return self.capture_height

    def capture_raw(self) -> Image.Image:
        shot = self.sct.grab(self.monitor)
        self.capture_width = shot.width
        self.capture_height = shot.height
        return Image.frombytes('RGB', shot.size, shot.bgra, 'raw', 'BGRX')

    def frame_hash(self, img: Image.Image) -> str:
        return hashlib.md5(img.tobytes()).hexdigest()

    def find_dirty_rects(self, prev: Image.Image, curr: Image.Image) -> list[tuple[int, int, int, int]]:
        w, h = curr.size
        rects: list[tuple[int, int, int, int]] = []
        for y in range(0, h, BLOCK_SIZE):
            for x in range(0, w, BLOCK_SIZE):
                bw = min(BLOCK_SIZE, w - x)
                bh = min(BLOCK_SIZE, h - y)
                prev_block = prev.crop((x, y, x + bw, y + bh))
                curr_block = curr.crop((x, y, x + bw, y + bh))
                if prev_block.tobytes() != curr_block.tobytes():
                    rects.append((x, y, bw, bh))
        return self._merge_rects(rects)

    def _merge_rects(self, rects: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
        if not rects:
            return []
        merged: list[tuple[int, int, int, int]] = []
        for rect in rects:
            rx, ry, rw, rh = rect
            found = False
            for i, (mx, my, mw, mh) in enumerate(merged):
                if not (rx + rw < mx or rx > mx + mw or ry + rh < my or ry > my + mh):
                    nx = min(mx, rx)
                    ny = min(my, ry)
                    nw = max(mx + mw, rx + rw) - nx
                    nh = max(my + mh, ry + rh) - ny
                    merged[i] = (nx, ny, nw, nh)
                    found = True
                    break
            if not found:
                merged.append(rect)
        return merged

    def encode_jpeg_bytes(self, img: Image.Image, quality: int | None = None) -> bytes:
        q = quality if quality is not None else self.quality
        q = max(MIN_QUALITY, min(MAX_QUALITY, q))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=q, optimize=True)
        return buf.getvalue()

    def adjust_quality(self) -> None:
        if self.latency_ms > LATENCY_HIGH_MS:
            self.quality = MIN_QUALITY
        elif self.latency_ms < LATENCY_LOW_MS:
            self.quality = MAX_QUALITY
        else:
            self.quality = DEFAULT_QUALITY

    def build_binary_frame(self, img: Image.Image, force_full: bool = False) -> bytes | None:
        now = time.time()
        current_hash = self.frame_hash(img)
        timestamp = int(now * 1000) & 0xFFFFFFFF

        if force_full or (now - self.last_full_frame) >= FULL_FRAME_INTERVAL:
            self.last_full_frame = now
            self.prev_hash = current_hash
            self.prev_image = img.copy()
            jpeg = self.encode_jpeg_bytes(img)
            return self._pack_frame('full', img.width, img.height, timestamp, [(0, 0, img.width, img.height, jpeg)])

        if self.prev_hash == current_hash:
            return None

        if self.prev_image is None:
            self.prev_hash = current_hash
            self.prev_image = img.copy()
            jpeg = self.encode_jpeg_bytes(img)
            return self._pack_frame('full', img.width, img.height, timestamp, [(0, 0, img.width, img.height, jpeg)])

        dirty = self.find_dirty_rects(self.prev_image, img)
        self.prev_hash = current_hash
        self.prev_image = img.copy()

        if not dirty:
            return None

        rects: list[tuple[int, int, int, int, bytes]] = []
        for x, y, w, h in dirty:
            patch = img.crop((x, y, x + w, y + h))
            rects.append((x, y, w, h, self.encode_jpeg_bytes(patch)))

        return self._pack_frame('dirty', img.width, img.height, timestamp, rects)

    def _pack_frame(
        self,
        mode: str,
        width: int,
        height: int,
        timestamp: int,
        rects: list[tuple[int, int, int, int, bytes]],
    ) -> bytes:
        mode_byte = 0 if mode == 'full' else 1
        header = struct.pack('>BBIIIH', FRAME_MAGIC, mode_byte, width, height, timestamp, self.quality)
        header += struct.pack('>H', len(rects))
        buf = bytearray(header)
        for x, y, w, h, jpeg in rects:
            buf += struct.pack('>IIII', x, y, w, h)
            buf += struct.pack('>I', len(jpeg))
            buf += jpeg
        return bytes(buf)


def resolve_key(key: str):
    k = key.lower()
    if k in KEY_MAP:
        return KEY_MAP[k]
    if len(key) == 1:
        return key
    return None


def execute_command(cmd: dict[str, Any]) -> None:
    action = cmd.get('action')
    try:
        if action == 'mouse_move':
            mouse.position = (int(cmd['x']), int(cmd['y']))

        elif action == 'mouse_click':
            btn = Button.right if cmd.get('button') == 'right' else Button.left
            if cmd.get('pressed', True):
                mouse.press(btn)
            else:
                mouse.release(btn)

        elif action == 'mouse_double_click':
            btn = Button.right if cmd.get('button') == 'right' else Button.left
            mouse.click(btn, 2)

        elif action == 'mouse_drag':
            mouse.position = (int(cmd['x']), int(cmd['y']))

        elif action == 'mouse_scroll':
            mouse.scroll(int(cmd.get('dx', 0)), int(cmd.get('dy', 0)))

        elif action == 'key_press':
            key = resolve_key(cmd['key'])
            if key is None:
                return
            if cmd.get('pressed', True):
                keyboard.press(key)
            else:
                keyboard.release(key)

        elif action == 'key_combo':
            keys = [resolve_key(k) for k in cmd.get('keys', [])]
            keys = [k for k in keys if k is not None]
            for k in keys:
                keyboard.press(k)
            for k in reversed(keys):
                keyboard.release(k)

        elif action == 'type_text':
            text = cmd.get('text', '')
            mode = cmd.get('mode', 'unicode')
            if mode == 'legacy':
                for ch in text:
                    keyboard.type(ch)
            else:
                keyboard.type(text)

        elif action == 'lock_screen':
            if sys.platform == 'win32':
                keyboard.press(Key.cmd)
                keyboard.press('l')
                keyboard.release('l')
                keyboard.release(Key.cmd)
            else:
                keyboard.press(Key.ctrl)
                keyboard.press(Key.alt)
                keyboard.press(Key.delete)
                keyboard.release(Key.delete)
                keyboard.release(Key.alt)
                keyboard.release(Key.ctrl)

        elif action == 'ctrl_alt_del':
            if sys.platform == 'win32':
                import subprocess
                subprocess.run(['powershell', '-Command',
                                '(New-Object -ComObject Shell.Application).ToggleDesktop()'],
                               check=False)
            else:
                keyboard.press(Key.ctrl)
                keyboard.press(Key.alt)
                keyboard.press(Key.delete)
                keyboard.release(Key.delete)
                keyboard.release(Key.alt)
                keyboard.release(Key.ctrl)

    except Exception as exc:
        log.error('Command error (%s): %s', action, exc)


class FrameBridge:
    """Thread-safe bridge from capture thread to asyncio send loop."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=FRAME_QUEUE_MAX)

    def put_frame(self, data: bytes) -> None:
        def _enqueue() -> None:
            if self._queue.full():
                try:
                    self._queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                self._queue.put_nowait(data)
            except asyncio.QueueFull:
                pass

        self._loop.call_soon_threadsafe(_enqueue)

    async def get_frame(self) -> bytes:
        return await self._queue.get()


class RemoteAgent:
    def __init__(self) -> None:
        self.capture = ScreenCapture()
        self.ws = None
        self.running = True
        self.backoff = 1.0
        self.max_backoff = 30.0
        self._capture_stop = threading.Event()

    async def authenticate(self, ws) -> bool:
        await ws.send(json.dumps({'type': 'auth', 'role': 'agent', 'token': SECRET_TOKEN}))
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            resp = json.loads(raw)
            if resp.get('type') == 'auth_ok':
                log.info('Authenticated with relay')
                return True
            log.error('Auth failed: %s', resp.get('message', 'unknown'))
        except asyncio.TimeoutError:
            log.error('Auth timeout')
        return False

    def _capture_worker(self, bridge: FrameBridge) -> None:
        while not self._capture_stop.is_set():
            loop_start = time.time()
            try:
                img = self.capture.capture_raw()
                frame = self.capture.build_binary_frame(img)
                if frame:
                    bridge.put_frame(frame)
            except Exception as exc:
                log.error('Capture error: %s', exc)
            elapsed = time.time() - loop_start
            sleep_time = max(0.0, CAPTURE_INTERVAL - elapsed)
            if sleep_time > 0:
                self._capture_stop.wait(sleep_time)

    async def send_loop(self, ws, bridge: FrameBridge) -> None:
        while self.running:
            try:
                frame = await asyncio.wait_for(bridge.get_frame(), timeout=1.0)
                await ws.send(frame)
            except asyncio.TimeoutError:
                continue
            except websockets.exceptions.ConnectionClosed:
                break

    async def receive_loop(self, ws) -> None:
        async for raw in ws:
            if isinstance(raw, bytes):
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get('type') == 'command':
                execute_command(msg)
            elif msg.get('type') == 'pong':
                sent = msg.get('timestamp')
                if sent:
                    self.capture.latency_ms = max(0, time.time() * 1000 - sent)
                    self.capture.adjust_quality()
            elif msg.get('type') == 'ping':
                await ws.send(json.dumps({'type': 'pong', 'timestamp': msg.get('timestamp', int(time.time() * 1000))}))
            elif msg.get('type') == 'heartbeat':
                pass

    async def run_session(self) -> None:
        log.info('Connecting to %s', RELAY_URL)
        async with websockets.connect(RELAY_URL, ping_interval=None, ping_timeout=None) as ws:
            if not await self.authenticate(ws):
                return
            self.backoff = 1.0
            self.ws = ws

            loop = asyncio.get_running_loop()
            bridge = FrameBridge(loop)
            self._capture_stop.clear()
            capture_thread = threading.Thread(
                target=self._capture_worker,
                args=(bridge,),
                daemon=True,
                name='capture',
            )
            capture_thread.start()

            ping_task = asyncio.create_task(self._ping_loop_safe(ws))
            send_task = asyncio.create_task(self.send_loop(ws, bridge))
            receive_task = asyncio.create_task(self.receive_loop(ws))

            done, pending = await asyncio.wait(
                [ping_task, send_task, receive_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            self._capture_stop.set()
            capture_thread.join(timeout=2.0)
            for task in pending:
                task.cancel()
            for task in done:
                if task.exception():
                    log.error('Task error: %s', task.exception())

    async def _ping_loop_safe(self, ws) -> None:
        while self.running:
            try:
                ts = int(time.time() * 1000)
                await ws.send(json.dumps({'type': 'ping', 'timestamp': ts}))
            except websockets.exceptions.ConnectionClosed:
                break
            await asyncio.sleep(PING_INTERVAL)

    async def run(self) -> None:
        while self.running:
            try:
                await self.run_session()
            except (websockets.exceptions.WebSocketException, OSError) as exc:
                log.warning('Connection lost: %s', exc)
            except Exception as exc:
                log.error('Unexpected error: %s', exc)

            log.info('Reconnecting in %.0fs...', self.backoff)
            await asyncio.sleep(self.backoff)
            self.backoff = min(self.backoff * 2, self.max_backoff)


def main() -> None:
    if not SECRET_TOKEN or SECRET_TOKEN == 'your-secret-token-here':
        log.warning('Set SECRET_TOKEN in .env before production use')
    agent = RemoteAgent()
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        log.info('Agent stopped')


if __name__ == '__main__':
    main()
