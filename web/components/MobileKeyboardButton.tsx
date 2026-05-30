'use client';

import { useCallback, useRef, useState } from 'react';

const SPECIAL_KEYS = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    Enter: 'enter',
    Backspace: 'backspace',
    Tab: 'tab',
    Escape: 'escape',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  return map[key] ?? key.toLowerCase();
}

interface MobileKeyboardButtonProps {
  sendCommand: (action: string, params?: Record<string, unknown>) => boolean;
  keyboardMode: string;
}

export default function MobileKeyboardButton({ sendCommand, keyboardMode }: MobileKeyboardButtonProps) {
  const [active, setActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openKeyboard = useCallback(() => {
    setActive(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const closeKeyboard = useCallback(() => {
    inputRef.current?.blur();
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      closeKeyboard();
    } else {
      openKeyboard();
    }
  }, [active, closeKeyboard, openKeyboard]);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const target = e.currentTarget;
      const text = target.value;
      if (!text) return;
      sendCommand('type_text', { text, mode: keyboardMode });
      target.value = '';
    },
    [sendCommand, keyboardMode],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!SPECIAL_KEYS.has(e.key)) return;
      e.preventDefault();
      const key = normalizeKey(e.key);
      sendCommand('key_press', { key, pressed: true });
      sendCommand('key_press', { key, pressed: false });
    },
    [sendCommand],
  );

  const handleBlur = useCallback(() => {
    setActive(false);
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-hidden="true"
        tabIndex={-1}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="fixed opacity-0 w-px h-px pointer-events-none"
        style={{ left: -9999, top: 0 }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={active ? 'Close keyboard' : 'Open keyboard'}
        aria-pressed={active}
        className={`md:hidden fixed z-50 w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg pointer-events-auto ${
          active
            ? 'bg-violet-600 ring-2 ring-violet-400'
            : 'glass hover:bg-white/10'
        }`}
        style={{ bottom: 80, left: 20 }}
      >
        ⌨️
      </button>
    </>
  );
}
