'use client';

import { useRef, useState } from 'react';
import { KEYBOARD_SHORTCUTS } from '@/lib/constants';

interface KeyboardShortcutBarProps {
  onShortcut: (keys: string[]) => void;
  visible?: boolean;
}

export default function KeyboardShortcutBar({ onShortcut, visible = true }: KeyboardShortcutBarProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!visible) return null;

  const subOptions: Record<string, { label: string; keys: string[] }[]> = {
    'Ctrl+C': [
      { label: 'Copy', keys: ['ctrl', 'c'] },
      { label: 'Copy Path', keys: ['ctrl', 'shift', 'c'] },
    ],
    'Alt+Tab': [
      { label: 'Switch App', keys: ['alt', 'tab'] },
      { label: 'Switch Back', keys: ['alt', 'shift', 'tab'] },
    ],
  };

  const handlePointerDown = (label: string) => {
    longPressTimer.current = setTimeout(() => setExpandedKey(label), 500);
  };

  const handlePointerUp = (shortcut: { label: string; keys: readonly string[] }) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (expandedKey !== shortcut.label) {
      onShortcut([...shortcut.keys]);
    }
    setExpandedKey(null);
  };

  return (
    <div className="flex gap-1 px-2 py-1 overflow-x-auto">
      {KEYBOARD_SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="relative">
          <button
            onPointerDown={() => handlePointerDown(shortcut.label)}
            onPointerUp={() => handlePointerUp(shortcut)}
            onPointerLeave={() => setExpandedKey(null)}
            className="px-2 py-1 text-xs rounded bg-surface border border-white/10 hover:border-primary/40 whitespace-nowrap font-mono"
          >
            {shortcut.label}
          </button>
          {expandedKey === shortcut.label && subOptions[shortcut.label] && (
            <div className="absolute bottom-full mb-1 left-0 glass rounded-lg p-1 flex flex-col gap-1 min-w-[120px] z-10">
              {subOptions[shortcut.label].map((sub) => (
                <button
                  key={sub.label}
                  onClick={() => {
                    onShortcut(sub.keys);
                    setExpandedKey(null);
                  }}
                  className="px-2 py-1 text-xs text-left hover:bg-white/5 rounded"
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
