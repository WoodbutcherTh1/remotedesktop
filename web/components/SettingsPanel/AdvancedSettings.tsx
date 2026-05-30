'use client';

import { RemoteSettings } from '@/lib/settings-store';
import { SettingRow, Toggle, NumberInput } from './shared';

interface AdvancedSettingsProps {
  settings: RemoteSettings['advanced'];
  onChange: (partial: Partial<RemoteSettings['advanced']>) => void;
}

export default function AdvancedSettings({ settings, onChange }: AdvancedSettingsProps) {
  return (
    <div>
      <SettingRow label="Auto-reconnect">
        <Toggle checked={settings.autoReconnect} onChange={(v) => onChange({ autoReconnect: v })} />
      </SettingRow>
      <SettingRow label="Reconnect attempts">
        <NumberInput
          value={settings.reconnectAttempts}
          min={1}
          max={50}
          onChange={(v) => onChange({ reconnectAttempts: v })}
        />
      </SettingRow>
      <SettingRow label="Clipboard sync">
        <Toggle checked={settings.clipboardSync} onChange={(v) => onChange({ clipboardSync: v })} />
      </SettingRow>
      <SettingRow label="Session timeout (min)" description="0 = disabled">
        <NumberInput
          value={settings.sessionTimeout}
          min={0}
          max={480}
          onChange={(v) => onChange({ sessionTimeout: v })}
        />
      </SettingRow>
      <SettingRow label="Audio streaming" description="Coming soon">
        <Toggle checked={settings.audioEnabled} onChange={(v) => onChange({ audioEnabled: v })} />
      </SettingRow>
      <SettingRow label="File transfer" description="Coming soon">
        <Toggle checked={settings.fileTransferEnabled} onChange={(v) => onChange({ fileTransferEnabled: v })} />
      </SettingRow>
      <SettingRow label="Wake-on-LAN" description="Coming soon">
        <Toggle checked={settings.wakeOnLanEnabled} onChange={(v) => onChange({ wakeOnLanEnabled: v })} />
      </SettingRow>
    </div>
  );
}
