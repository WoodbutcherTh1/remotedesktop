#!/usr/bin/env python3
"""RemoteDesk desktop agent — cross-platform screen capture and input relay."""

import asyncio
import base64
import hashlib
import io
import json
import logging
import os
import sys
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

RELAY_URL = os.getenv('RELAY_URL', 'ws://localhost:8080')
SECRET_TOKEN = os.getenv('SECRET_TOKEN', 'dev-token-change-me')

CAPTURE_INTERVAL = 0.1
FULL_FRAME_INTERVAL = 2.0
PING_INTERVAL = 5.0
BLOCK_SIZE = 32
DEFAULT_QUALITY = 75
MIN_QUALITY = 50
MAX_QUALITY = 85
LATENCY_HIGH_MS = 200
LATENCY_LOW_MS = 100

mouse = MouseController()
keyboard = KeyboardController()

KEY_MAP = {
    'enter': Key.enter, 'tab': Key.tab, 'space': Key.space,
    'backspace': Key.backspace, 'delete': Key.delete,
    'escape': Key.esc, 'up': Key.up, 'down': Key.down,
    'left': Key.left, 'right': Key.right,
    'home': Key.home, 'end': Key.end,
    'pageup': Key.page_up, 'pagedown': Key.page_down,
    'insert': Key.insert, 'caps_lock': Key.caps_lock,
    'f1': Key.f1, 'f2': Key.f2, 'f3': Key.f3, 'f4': Key.f4,
    'f5': Key.f5, 'f6': Key.f6, 'f7': Key.f7, 'f8': Key.f8,
    'f9': Key.f9, 'f10': Key.f10, 'f11': Key.f11, 'f12': Key.f12,
    'shift': Key.shift, 'ctrl': Key.ctrl, 'alt': Key.alt,
    'cmd': Key.cmd, 'win': Key.cmd, 'meta': Key.cmd,
    'super': Key.cmd, 'control': Key.ctrl,
}


class ScreenCapture:
    def __init__(self) -> None:
        self.sct = mss()
        self.monitor = self.sct.monitors[1]
        self.prev_hash: str | None = None
        self.prev_image: Image.Image | None = None
        self.last_full_frame = 0.0
        self.quality = DEFAULT_QUALITY
        self.latency_ms = 0.0

    @property
    def width(self) -> int:
        return self.monitor['width']

    @property
    def height(self) -> int:
        return self.monitor['height']

    def capture_raw(self) -> Image.Image:
        shot = self.sct.grab(self.monitor)
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

    def encode_jpeg(self, img: Image.Image, quality: int | None = None) -> str:
        q = quality if quality is not None else self.quality
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=q, optimize=True)
        return base64.b64encode(buf.getvalue()).decode('ascii')

    def adjust_quality(self) -> None:
        if self.latency_ms > LATENCY_HIGH_MS:
            self.quality = MIN_QUALITY
        elif self.latency_ms < LATENCY_LOW_MS:
            self.quality = MAX_QUALITY
        else:
            self.quality = DEFAULT_QUALITY

    def build_frame_message(self, img: Image.Image, force_full: bool = False) -> dict[str, Any] | None:
        now = time.time()
        current_hash = self.frame_hash(img)

        if force_full or (now - self.last_full_frame) >= FULL_FRAME_INTERVAL:
            self.last_full_frame = now
            self.prev_hash = current_hash
            self.prev_image = img.copy()
            return {
                'type': 'frame',
                'mode': 'full',
                'width': img.width,
                'height': img.height,
                'rects': [{'x': 0, 'y': 0, 'w': img.width, 'h': img.height,
                           'data': self.encode_jpeg(img)}],
                'timestamp': int(now * 1000),
                'quality': self.quality,
            }

        if self.prev_hash == current_hash:
            return None

        if self.prev_image is None:
            self.prev_hash = current_hash
            self.prev_image = img.copy()
            return {
                'type': 'frame',
                'mode': 'full',
                'width': img.width,
                'height': img.height,
                'rects': [{'x': 0, 'y': 0, 'w': img.width, 'h': img.height,
                           'data': self.encode_jpeg(img)}],
                'timestamp': int(now * 1000),
                'quality': self.quality,
            }

        dirty = self.find_dirty_rects(self.prev_image, img)
        self.prev_hash = current_hash
        self.prev_image = img.copy()

        if not dirty:
            return None

        rects = []
        for x, y, w, h in dirty:
            patch = img.crop((x, y, x + w, y + h))
            rects.append({'x': x, 'y': y, 'w': w, 'h': h, 'data': self.encode_jpeg(patch)})

        return {
            'type': 'frame',
            'mode': 'dirty',
            'width': img.width,
            'height': img.height,
            'rects': rects,
            'timestamp': int(now * 1000),
            'quality': self.quality,
        }


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


class RemoteAgent:
    def __init__(self) -> None:
        self.capture = ScreenCapture()
        self.ws = None
        self.running = True
        self.backoff = 1.0
        self.max_backoff = 30.0

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

    async def capture_loop(self, ws) -> None:
        while self.running:
            try:
                img = self.capture.capture_raw()
                msg = self.capture.build_frame_message(img)
                if msg:
                    await ws.send(json.dumps(msg))
            except websockets.exceptions.ConnectionClosed:
                break
            await asyncio.sleep(CAPTURE_INTERVAL)

    async def receive_loop(self, ws) -> None:
        async for raw in ws:
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

            ping_task = asyncio.create_task(self._ping_loop_safe(ws))
            capture_task = asyncio.create_task(self.capture_loop(ws))
            receive_task = asyncio.create_task(self.receive_loop(ws))

            done, pending = await asyncio.wait(
                [ping_task, capture_task, receive_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
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
