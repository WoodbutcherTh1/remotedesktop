'use client';

import { QualityPreset } from '@/lib/constants';
import { RemoteSettings } from '@/lib/settings-store';
import { SettingRow, Toggle, RangeInput, SelectInput } from './shared';

interface DisplaySettingsProps {
  settings: RemoteSettings['display'];
  onChange: (partial: Partial<RemoteSettings['display']>) => void;
}

export default function DisplaySettings({ settings, onChange }: DisplaySettingsProps) {
  return (
    <div>
      <SettingRow label="Quality preset">
        <SelectInput
          value={settings.qualityPreset}
          onChange={(v) => onChange({ qualityPreset: v as QualityPreset })}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'ultra', label: 'Ultra' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </SettingRow>
      {settings.qualityPreset === 'custom' && (
        <SettingRow label="Custom JPEG quality">
          <RangeInput
            value={settings.customJpegQuality}
            min={20}
            max={100}
            onChange={(v) => onChange({ customJpegQuality: v })}
          />
        </SettingRow>
      )}
      <SettingRow label="FPS limit">
        <RangeInput value={settings.fpsLimit} min={5} max={60} onChange={(v) => onChange({ fpsLimit: v })} />
      </SettingRow>
      <SettingRow label="Hardware acceleration">
        <Toggle checked={settings.hardwareAcceleration} onChange={(v) => onChange({ hardwareAcceleration: v })} />
      </SettingRow>
      <SettingRow label="Color mode">
        <SelectInput
          value={settings.colorMode}
          onChange={(v) => onChange({ colorMode: v })}
          options={[
            { value: 'color', label: 'Color' },
            { value: 'grayscale', label: 'Grayscale' },
            { value: 'high-contrast', label: 'High contrast' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Stats overlay">
        <Toggle checked={settings.showStatsOverlay} onChange={(v) => onChange({ showStatsOverlay: v })} />
      </SettingRow>
      <SettingRow label="Scale mode">
        <SelectInput
          value={settings.scaleMode}
          onChange={(v) => onChange({ scaleMode: v })}
          options={[
            { value: 'fit', label: 'Fit to window' },
            { value: 'original', label: 'Original size' },
            { value: 'stretch', label: 'Stretch' },
          ]}
        />
      </SettingRow>
    </div>
  );
}
