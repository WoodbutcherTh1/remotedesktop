'use client';

import { useCallback, useEffect, useRef } from 'react';
import { parseShortcutExceptions, RemoteSettings } from '@/lib/settings-store';

interface UseKeyboardHandlerOptions {
  settings: RemoteSettings;
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  enabled?: boolean;
}

function applyLayout(key: string, layout: string): string {
  if (layout === 'de' && key.length === 1) {
    const deMap: Record<string, string> = { y: 'z', z: 'y', Y: 'Z', Z: 'Y' };
    return deMap[key] ?? key;
  }
  if (layout === 'fr' && key.length === 1) {
    const frMap: Record<string, string> = {
      a: 'q', q: 'a', w: 'z', z: 'w',
      A: 'Q', Q: 'A', W: 'Z', Z: 'W',
    };
    return frMap[key] ?? key;
  }
  return key;
}
function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    ' ': 'space',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Escape: 'escape',
    Enter: 'enter',
    Backspace: 'backspace',
    Delete: 'delete',
    Tab: 'tab',
    Control: 'ctrl',
    Alt: 'alt',
    Shift: 'shift',
    Meta: 'cmd',
  };
  return map[key] ?? key.toLowerCase();
}

function isShortcutException(e: KeyboardEvent, exceptions: string[]): boolean {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(normalizeKey(e.key));
  const combo = parts.join('+');
  return exceptions.some((ex) => combo.includes(ex) || ex === normalizeKey(e.key));
}

export function useKeyboardHandler({
  settings,
  sendCommand,
  enabled = true,
}: UseKeyboardHandlerOptions) {
  const pressedKeys = useRef<Set<string>>(new Set());

  const sendKeyCombo = useCallback(
    (keys: string[]) => {
      sendCommand('key_combo', { keys });
    },
    [sendCommand],
  );

  const sendKeyPress = useCallback(
    (key: string, pressed: boolean) => {
      sendCommand('key_press', { key, pressed });
    },
    [sendCommand],
  );

  const sendText = useCallback(
    (text: string) => {
      sendCommand('type_text', { text, mode: settings.keyboard.mode });
    },
    [sendCommand, settings.keyboard.mode],
  );

  useEffect(() => {
    if (!enabled) return;

    const exceptions = parseShortcutExceptions(settings.keyboard.shortcutExceptions);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings.keyboard.imeEnabled && e.isComposing) return;

      if (settings.keyboard.blockBrowserShortcuts) {
        const blocked = ['F5', 'F11', 'F12'];
        if (blocked.includes(e.key) && !isShortcutException(e, exceptions)) {
          e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && ['w', 't', 'n', 'r'].includes(e.key.toLowerCase())) {
          if (!settings.keyboard.shortcutPassthrough && !isShortcutException(e, exceptions)) {
            e.preventDefault();
          }
        }
      }

      if (!settings.keyboard.shortcutPassthrough && (e.ctrlKey || e.metaKey || e.altKey)) {
        if (!isShortcutException(e, exceptions)) {
          e.preventDefault();
        }
      }

      let key = normalizeKey(e.key);
      if (settings.keyboard.mode === 'map' && settings.keyboard.layout !== 'auto' && settings.keyboard.layout !== 'us') {
        key = applyLayout(key, settings.keyboard.layout);
      }
      if (pressedKeys.current.has(key)) return;
      pressedKeys.current.add(key);

      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || key.length > 1) {
        const keys: string[] = [];
        if (e.ctrlKey) keys.push('ctrl');
        if (e.altKey) keys.push('alt');
        if (e.shiftKey) keys.push('shift');
        if (e.metaKey) keys.push('cmd');
        if (key.length === 1) keys.push(key);
        else if (!['ctrl', 'alt', 'shift', 'cmd'].includes(key)) keys.push(key);
        sendKeyCombo(keys);
      } else {
        sendKeyPress(key, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key);
      pressedKeys.current.delete(key);
      if (!e.ctrlKey && !e.altKey && !e.metaKey && key.length === 1) {
        sendKeyPress(key, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, settings.keyboard, sendKeyCombo, sendKeyPress]);

  return { sendKeyCombo, sendKeyPress, sendText };
}
