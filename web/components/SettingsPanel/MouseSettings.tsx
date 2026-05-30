'use client';

import { RemoteSettings } from '@/lib/settings-store';
import { SettingRow, Toggle, RangeInput, SelectInput, NumberInput } from './shared';

interface MouseSettingsProps {
  settings: RemoteSettings['mouse'];
  onChange: (partial: Partial<RemoteSettings['mouse']>) => void;
}

export default function MouseSettings({ settings, onChange }: MouseSettingsProps) {
  return (
    <div>
      <SettingRow label="Show remote cursor">
        <Toggle checked={settings.showRemoteCursor} onChange={(v) => onChange({ showRemoteCursor: v })} />
      </SettingRow>
      <SettingRow label="Show local cursor">
        <Toggle checked={settings.showLocalCursor} onChange={(v) => onChange({ showLocalCursor: v })} />
      </SettingRow>
      <SettingRow label="Cursor style">
        <SelectInput
          value={settings.cursorStyle}
          onChange={(v) => onChange({ cursorStyle: v })}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'crosshair', label: 'Crosshair' },
            { value: 'dot', label: 'Dot' },
            { value: 'pointer', label: 'Pointer' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Cursor color">
        <input
          type="color"
          value={settings.cursorColor}
          onChange={(e) => onChange({ cursorColor: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer bg-transparent"
        />
      </SettingRow>
      <SettingRow label="Mouse mode">
        <SelectInput
          value={settings.mode}
          onChange={(v) => onChange({ mode: v })}
          options={[
            { value: 'absolute', label: 'Absolute' },
            { value: 'relative', label: 'Relative' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Scroll speed">
        <RangeInput value={settings.scrollSpeed} min={1} max={10} onChange={(v) => onChange({ scrollSpeed: v })} />
      </SettingRow>
      <SettingRow label="Scroll direction">
        <SelectInput
          value={settings.scrollDirection}
          onChange={(v) => onChange({ scrollDirection: v })}
          options={[
            { value: 'traditional', label: 'Traditional' },
            { value: 'natural', label: 'Natural' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Scroll method">
        <SelectInput
          value={settings.scrollMethod}
          onChange={(v) => onChange({ scrollMethod: v })}
          options={[
            { value: 'wheel', label: 'Wheel' },
            { value: 'smooth', label: 'Smooth' },
            { value: 'pixel', label: 'Pixel' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Double-click speed (ms)">
        <NumberInput value={settings.doubleClickSpeed} min={200} max={800} onChange={(v) => onChange({ doubleClickSpeed: v })} />
      </SettingRow>
      <SettingRow label="Right-click long press (ms)">
        <NumberInput value={settings.rightClickLongPress} min={300} max={1000} onChange={(v) => onChange({ rightClickLongPress: v })} />
      </SettingRow>
      <SettingRow label="Ctrl+Click = Right click">
        <Toggle checked={settings.ctrlClickAsRightClick} onChange={(v) => onChange({ ctrlClickAsRightClick: v })} />
      </SettingRow>
      <SettingRow label="Drag enabled">
        <Toggle checked={settings.dragEnabled} onChange={(v) => onChange({ dragEnabled: v })} />
      </SettingRow>
      <SettingRow label="Drag threshold (px)">
        <NumberInput value={settings.dragThreshold} min={1} max={20} onChange={(v) => onChange({ dragThreshold: v })} />
      </SettingRow>
    </div>
  );
}
