'use client';

import { RemoteSettings } from '@/lib/settings-store';
import { SettingRow, Toggle, SelectInput } from './shared';

interface KeyboardSettingsProps {
  settings: RemoteSettings['keyboard'];
  onChange: (partial: Partial<RemoteSettings['keyboard']>) => void;
}

export default function KeyboardSettings({ settings, onChange }: KeyboardSettingsProps) {
  return (
    <div>
      <SettingRow label="Input mode">
        <SelectInput
          value={settings.mode}
          onChange={(v) => onChange({ mode: v })}
          options={[
            { value: 'legacy', label: 'Legacy' },
            { value: 'unicode', label: 'Unicode' },
            { value: 'map', label: 'Map' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Shortcut passthrough">
        <Toggle checked={settings.shortcutPassthrough} onChange={(v) => onChange({ shortcutPassthrough: v })} />
      </SettingRow>
      <SettingRow label="Block browser shortcuts">
        <Toggle checked={settings.blockBrowserShortcuts} onChange={(v) => onChange({ blockBrowserShortcuts: v })} />
      </SettingRow>
      <SettingRow label="Shortcut exceptions" description="Comma-separated, e.g. F5,F12">
        <input
          type="text"
          value={settings.shortcutExceptions}
          onChange={(e) => onChange({ shortcutExceptions: e.target.value })}
          className="w-28 bg-surface border border-white/10 rounded px-2 py-1 text-xs"
        />
      </SettingRow>
      <SettingRow label="Special keys toolbar">
        <Toggle checked={settings.showSpecialKeysToolbar} onChange={(v) => onChange({ showSpecialKeysToolbar: v })} />
      </SettingRow>
      <SettingRow label="IME support">
        <Toggle checked={settings.imeEnabled} onChange={(v) => onChange({ imeEnabled: v })} />
      </SettingRow>
      <SettingRow label="Keyboard layout">
        <SelectInput
          value={settings.layout}
          onChange={(v) => onChange({ layout: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'us', label: 'US' },
            { value: 'uk', label: 'UK' },
            { value: 'de', label: 'DE' },
            { value: 'fr', label: 'FR' },
            { value: 'jp', label: 'JP' },
          ]}
        />
      </SettingRow>
    </div>
  );
}
