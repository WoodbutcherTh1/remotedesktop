'use client';

import { useState } from 'react';
import { RemoteSettings } from '@/lib/settings-store';
import MouseSettings from './MouseSettings';
import KeyboardSettings from './KeyboardSettings';
import DisplaySettings from './DisplaySettings';
import AdvancedSettings from './AdvancedSettings';

type Tab = 'mouse' | 'keyboard' | 'display' | 'advanced';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: RemoteSettings;
  onUpdate: <K extends keyof RemoteSettings>(section: K, partial: Partial<RemoteSettings[K]>) => void;
  mobile?: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'mouse', label: 'Mouse' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'display', label: 'Display' },
  { id: 'advanced', label: 'Advanced' },
];

export default function SettingsPanel({ open, onClose, settings, onUpdate, mobile = false }: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>('mouse');

  if (!open) return null;

  const panelClass = mobile
    ? 'fixed inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl z-40'
    : 'fixed top-12 right-0 bottom-0 w-80 z-40';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />
      <aside className={`${panelClass} glass flex flex-col shadow-2xl`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="font-medium">Settings</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white px-2">✕</button>
        </div>

        <div className="flex border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-medium ${tab === t.id ? 'settings-tab-active' : 'text-zinc-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {tab === 'mouse' && (
            <MouseSettings settings={settings.mouse} onChange={(p) => onUpdate('mouse', p)} />
          )}
          {tab === 'keyboard' && (
            <KeyboardSettings settings={settings.keyboard} onChange={(p) => onUpdate('keyboard', p)} />
          )}
          {tab === 'display' && (
            <DisplaySettings settings={settings.display} onChange={(p) => onUpdate('display', p)} />
          )}
          {tab === 'advanced' && (
            <AdvancedSettings settings={settings.advanced} onChange={(p) => onUpdate('advanced', p)} />
          )}
        </div>
      </aside>
    </>
  );
}
